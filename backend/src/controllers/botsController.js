// src/controllers/botsController.js — VERSÃO BLINDADA (anti-loop entre bots) + OCR em grupo de rastreamento
const financialBot = require('../services/financialBotService');
const internalBot = require('../services/internalBotService');
const safety = require('../services/botSafety');
const ocr = require('../services/ocrService');
const axios = require('axios');

const EVO_URL = process.env.EVOLUTION_URL || process.env.EVOLUTION_API_URL || 'http://jr-evolution-api:8080';
const EVO_KEY = process.env.EVOLUTION_API_KEY || '';

// Dedup por messageId — evita 3 webhooks processarem mesma mensagem (cada bot no grupo recebe)
const ocrProcessedIds = new Map(); // messageId → timestamp
function shouldProcessOcr(messageId) {
  const now = Date.now();
  // Limpa ids antigos (>10min)
  for (const [id, ts] of ocrProcessedIds.entries()) {
    if (now - ts > 10 * 60 * 1000) ocrProcessedIds.delete(id);
  }
  if (ocrProcessedIds.has(messageId)) return false;
  ocrProcessedIds.set(messageId, now);
  return true;
}

/** Extrai mensagem. Pra OCR em grupo, aceita fromMe=true (Junior mandando do próprio celular). */
function extractMessage(req, { allowFromMeInGroup = false } = {}) {
  const { event, data } = req.body || {};
  if (event !== 'messages.upsert') return null;
  const msg = data?.messages?.[0] || data;
  if (!msg) return null;
  const remoteJid = msg.key?.remoteJid || '';
  const isGroup = remoteJid.includes('@g.us');
  const fromMe = !!msg.key?.fromMe;
  // Em grupo OCR, fromMe=true é OK (sender é Junior pelo próprio cel)
  if (fromMe && !(isGroup && allowFromMeInGroup)) return null;
  const phone = isGroup ? remoteJid : remoteJid.split('@')[0];
  // Pra fromMe=true, senderPhone é o ownerJid (Junior). Pra fromMe=false em grupo, é participant.
  const senderPhone = isGroup
    ? (fromMe ? '5565993471331' : (msg.key?.participant || '').split('@')[0])
    : phone;
  const hasImage = !!msg.message?.imageMessage;
  const messageContent = msg.message?.conversation
    || msg.message?.extendedTextMessage?.text
    || msg.message?.imageMessage?.caption
    || '';
  return {
    phone, senderPhone, isGroup, hasImage, fromMe,
    messageKey: msg.key,
    fullMessage: msg,
    contactName: msg.pushName || null,
    messageContent,
    messageId: msg.key?.id,
  };
}

/** Processa imagem em grupo de rastreamento (OCR de placa/IMEI).
 *  `instance` = bot que recebeu o webhook (usado pra baixar a mídia, só dono da msg consegue). */
async function handleOcrInGroup(m, instance) {
  if (!safety.OCR_ALLOWED_GROUPS.has(m.phone)) {
    return { ignored: 'group_not_in_ocr_whitelist' };
  }
  const sender = safety.normalizePhone(m.senderPhone);
  if (!safety.EMPLOYEE_PHONES.has(sender) && sender !== '5565993471331') {
    return { ignored: 'sender_not_employee', sender };
  }
  // Dedup
  if (!shouldProcessOcr(m.messageId)) {
    return { ignored: 'duplicate_message_id' };
  }
  console.log(`[ocr] processando img de ${sender} no grupo ${m.phone} via ${instance} (msgId=${m.messageId})`);
  const base64 = await ocr.fetchImageBase64(instance, m.fullMessage);
  if (!base64) return { ignored: 'sem_imagem' };
  const result = await ocr.extract(base64);
  if (!result.ok) {
    console.log(`[ocr] sem match: ${result.reason}`);
    return { ok: true, ocr_no_match: true, reason: result.reason };
  }
  const reply = ocr.formatReply(result, sender);
  if (reply) {
    try {
      // Resposta sai SEMPRE pelo jr-rh-bot (canal oficial da equipe)
      await axios.post(`${EVO_URL}/message/sendText/jr-rh-bot`,
        { number: m.phone, text: reply },
        { headers: { apikey: EVO_KEY, 'Content-Type': 'application/json' }, timeout: 25000 }
      );
      return { ok: true, ocr_replied: true, type: result.type, value: result.value };
    } catch (e) {
      console.log('[ocr] send err:', e.message);
      return { ok: false, error: e.message };
    }
  }
  return { ignored: 'no_reply' };
}

async function financialWebhook(req, res) {
  try {
    const m = extractMessage(req);
    if (!m || !m.phone || !m.messageContent) return res.json({ ignored: 'empty' });
    const guard = safety.preflightReceive({
      phone: m.phone,
      messageContent: m.messageContent,
      receivingInstance: 'jr-financeiro-bot',
    });
    if (!guard.ok) {
      console.log(`[fin webhook] bloqueado: ${guard.reason} | from=${m.phone}`);
      return res.json({ ignored: guard.reason });
    }
    const r = await financialBot.handleMessage(m);
    res.json({ ok: true, result: r });
  } catch (e) {
    console.log('[fin webhook] err:', e.message);
    res.status(500).json({ error: e.message });
  }
}

async function internalWebhook(req, res) {
  try {
    const m = extractMessage(req, { allowFromMeInGroup: true });
    if (!m) return res.json({ ignored: 'empty' });

    if (m.isGroup && m.hasImage) {
      const r = await handleOcrInGroup(m, 'jr-rh-bot');
      return res.json(r);
    }
    if (m.isGroup) return res.json({ ignored: 'group_no_ocr' });

    if (!m.phone || !m.messageContent) return res.json({ ignored: 'empty' });
    const guard = safety.preflightReceive({
      phone: m.phone, messageContent: m.messageContent, receivingInstance: 'jr-rh-bot',
    });
    if (!guard.ok) {
      console.log(`[int webhook] bloqueado: ${guard.reason} | from=${m.phone}`);
      return res.json({ ignored: guard.reason });
    }
    const r = await internalBot.handleMessage(m);
    res.json({ ok: true, result: r });
  } catch (e) {
    console.log('[int webhook] err:', e.message);
    res.status(500).json({ error: e.message });
  }
}

/** Webhook público pra usar no personalController (OCR em grupo). */
async function ocrFromPersonal(req, res) {
  try {
    const m = extractMessage(req, { allowFromMeInGroup: true });
    if (!m) return res.json({ ignored: 'empty' });
    if (!(m.isGroup && m.hasImage)) return res.json({ ignored: 'not_image_in_group' });
    const r = await handleOcrInGroup(m, 'jr-pessoal-junior');
    res.json(r);
  } catch (e) {
    console.log('[personal-ocr] err:', e.message);
    res.status(500).json({ error: e.message });
  }
}

module.exports = { financialWebhook, internalWebhook, ocrFromPersonal, handleOcrInGroup, extractMessage };
