// src/services/personalBotService.js
// Atendimento IA seletivo no WhatsApp pessoal do Junior (65 99347-1331)
// Whitelist + auto-detect intimidade + classificação de tópicos + consulta de filtros
const axios = require('axios');
const prisma = require('../lib/prisma');
const ia = require('./iaService');
const router = require('./messageRouterService');
const filters = require('./filterService');

const EVO_URL = process.env.EVOLUTION_URL || process.env.EVOLUTION_API_URL || 'http://jr-evolution-api:8080';
const EVO_KEY = process.env.EVOLUTION_API_KEY || '';
const PERSONAL_INSTANCE = process.env.PERSONAL_INSTANCE || 'jr-pessoal-junior';
const JUNIOR_PERSONAL_PHONE = '5565993471331';
const INTIMACY_THRESHOLD = 10;  // >10 msgs = considerado pessoal automático

function normalizePhone(phone) {
  let p = String(phone || '').replace(/\D/g, '');
  if (!p) return '';
  if (!p.startsWith('55')) p = '55' + p;
  return p;
}

/** Verifica se o phone está na whitelist (manual OU auto-detected) */
async function isPersonalContact(phone) {
  const p = normalizePhone(phone);
  const r = await prisma.$queryRawUnsafe(
    `SELECT id, name, source FROM personal_contacts WHERE phone = $1 AND active = true LIMIT 1`,
    p
  );
  return r && r.length > 0 ? r[0] : null;
}

/** Conta mensagens trocadas com esse phone — usado pra auto-detect intimidade */
async function countMessages(phone) {
  const p = normalizePhone(phone);
  const r = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*)::int AS c FROM personal_messages WHERE phone = $1`,
    p
  );
  return r[0]?.c || 0;
}

/** Auto-promove contato pra whitelist se trocou >N mensagens */
async function autoPromoteIfFrequent(phone, contactName) {
  const count = await countMessages(phone);
  if (count < INTIMACY_THRESHOLD) return null;
  const exists = await isPersonalContact(phone);
  if (exists) return exists;
  const id = require('crypto').randomUUID();
  await prisma.$executeRawUnsafe(`
    INSERT INTO personal_contacts (id, phone, name, category, source, message_count, notes)
    VALUES ($1, $2, $3, $4, 'auto_detected', $5, $6)
    ON CONFLICT (phone) DO UPDATE SET source='auto_detected', message_count=$5
  `, id, normalizePhone(phone), contactName || null, 'outro', count,
     `Auto-promovido após ${count} mensagens trocadas`);
  return { id, name: contactName, source: 'auto_detected' };
}

/** Classifica intenção da mensagem com Ollama */
async function classifyIntent(messageText) {
  if (!messageText || messageText.length < 3) return null;
  const rules = await prisma.$queryRawUnsafe(
    `SELECT topic, keywords FROM personal_auto_responses WHERE active = true`
  );
  const knownTopics = rules.map(r => r.topic).join(', ');
  const prompt = `Classifique a mensagem abaixo em UM dos tópicos disponíveis OU "outro" se não for nenhum.
MENSAGEM: "${messageText}"
TÓPICOS POSSÍVEIS:
- kitnet (perguntar sobre alugar/kitnet/apartamento)
- comprar_veiculo (querer comprar/vender veículo)
- auto_pecas (peça automotiva, pneu, filtro, óleo)
- guincho (pedir guincho/reboque)
- rastreador (rastreador/GPS/monitoramento)
- instalacao (instalar/agendar instalação)
- pessoal (mensagem pessoal: amigo, família, pergunta íntima)
- outro (qualquer outra coisa)
Retorne APENAS JSON: {"topic": "<um dos acima>", "confidence": 0.0 a 1.0, "reasoning": "breve motivo"}`;
  try {
    const r = await ia.generate(prompt, { temperature: 0.2, maxTokens: 150, timeout: 60000 });
    const m = r.text.match(/\{[\s\S]*\}/);
    if (!m) return null;
    return JSON.parse(m[0]);
  } catch (e) {
    console.log('[personal-bot] erro classify:', e.message);
    return null;
  }
}

/** Busca regra de resposta pelo tópico */
async function findRule(topic) {
  const r = await prisma.$queryRawUnsafe(
    `SELECT * FROM personal_auto_responses WHERE topic = $1 AND active = true LIMIT 1`,
    topic
  );
  return r && r.length > 0 ? r[0] : null;
}

/** Envia mensagem via Evolution */
async function sendReply(phone, text) {
  const url = `${EVO_URL}/message/sendText/${PERSONAL_INSTANCE}`;
  const res = await axios.post(url,
    { number: phone, text },
    { headers: { apikey: EVO_KEY, 'Content-Type': 'application/json' }, timeout: 25000 }
  );
  return res.data;
}

/**
 * Processa mensagem recebida no WhatsApp pessoal do Junior.
 * Chamado pelo webhook Evolution.
 */
async function handleMessage({ phone, contactName, messageContent, messageId, messageType = 'text' }) {
  if (!phone || !messageContent) return null;
  const p = normalizePhone(phone);

  // 0. ANTES de tudo: se for consulta de filtro automotivo (Wo120, ARL2203, filtro civic, etc) — responde direto
  try {
    const filterResult = await filters.handleQuery(messageContent);
    if (filterResult && filterResult.ok && filterResult.reply) {
      await sendReply(p, filterResult.reply);
      const msgIdLog = require('crypto').randomUUID();
      try {
        await prisma.$executeRawUnsafe(`
          INSERT INTO personal_messages (
            id, phone, contact_name, message_id, message_content, message_type,
            detected_topic, detected_intent, action_taken, response_sent
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        `, msgIdLog, p, contactName || null, messageId || null,
           messageContent.slice(0, 4000), messageType,
           'filter', 'filter', 'filter_replied', filterResult.reply.slice(0, 2000));
      } catch (e) { console.log('[personal-bot] log err:', e.message); }
      console.log(`[personal-bot] filter respondido pra ${p}: ${(filterResult.reply || '').slice(0, 80)}...`);
      return { msgId: msgIdLog, isPersonal: false, intent: 'filter', actionTaken: 'filter_replied', responseSent: filterResult.reply };
    }
  } catch (e) {
    console.log('[personal-bot] filter check err:', e.message);
  }

  // 1. Loga a mensagem (sempre, pra audit)
  const msgId = require('crypto').randomUUID();

  // 2. Verifica se é contato pessoal (whitelist)
  const personalContact = await isPersonalContact(p);
  let isPersonal = !!personalContact;

  // 3. Se não tá na whitelist, checa intimidade automática
  if (!isPersonal) {
    const promoted = await autoPromoteIfFrequent(p, contactName);
    if (promoted) {
      isPersonal = true;
    }
  }

  // 4. Classifica intenção (mesmo se for pessoal — pra log)
  const classification = await classifyIntent(messageContent);
  const intent = classification?.topic || 'outro';

  // 5. Decide ação
  let actionTaken = 'ignored';
  let responseSent = null;
  let highlighted = false;

  if (isPersonal) {
    // CONTATO PESSOAL — IA NUNCA responde
    actionTaken = 'ignored';
  } else {
    const rule = await findRule(intent);
    if (rule && rule.action === 'reply') {
      try {
        await sendReply(p, rule.response_text);
        responseSent = rule.response_text;
        actionTaken = 'auto_replied';
        await prisma.$executeRawUnsafe(
          `UPDATE personal_auto_responses SET match_count = match_count + 1 WHERE topic = $1`,
          intent
        );
      } catch (e) {
        console.log('[personal-bot] erro send reply:', e.message);
      }
    } else if (rule && rule.action === 'redirect') {
      try {
        await sendReply(p, rule.response_text);
        responseSent = rule.response_text;
        actionTaken = 'forwarded';
        await prisma.$executeRawUnsafe(
          `UPDATE personal_auto_responses SET match_count = match_count + 1 WHERE topic = $1`,
          intent
        );
      } catch (e) {
        console.log('[personal-bot] erro forward:', e.message);
      }
    } else if (rule && rule.action === 'highlight') {
      highlighted = true;
      actionTaken = 'highlighted';
      try {
        await router.notifyJunior(
          `🔔 *DESTAQUE no seu WhatsApp pessoal*\n\n` +
          `📱 ${contactName || p}\n` +
          `🏷️ Tópico: ${intent}\n\n` +
          `📝 Mensagem:\n${messageContent.slice(0, 300)}\n\n` +
          `Responda direto no zap. IA vai aprender com sua resposta. 🧠`,
          'info'
        );
      } catch (e) { console.log('[personal-bot] notify err:', e.message); }
    } else {
      actionTaken = 'logged';
    }
  }

  // 6. Salva no log
  await prisma.$executeRawUnsafe(`
    INSERT INTO personal_messages (
      id, phone, contact_name, message_id, message_content, message_type,
      detected_topic, detected_intent, ai_confidence, is_personal,
      action_taken, response_sent, highlighted
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
  `,
    msgId, p, contactName || null, messageId || null,
    messageContent.slice(0, 4000), messageType,
    intent, intent, classification?.confidence || 0,
    isPersonal, actionTaken, responseSent, highlighted
  );

  return { msgId, isPersonal, intent, actionTaken, responseSent };
}

/**
 * Quando Junior responde uma mensagem destacada, IA aprende com a resposta.
 */
async function learnFromJuniorResponse({ phone, juniorMessage }) {
  const p = normalizePhone(phone);
  const lastMsg = await prisma.$queryRawUnsafe(`
    SELECT * FROM personal_messages
    WHERE phone = $1 AND highlighted = true AND junior_answered = false
    ORDER BY created_at DESC LIMIT 1
  `, p);
  if (!lastMsg || !lastMsg.length) return null;
  const m = lastMsg[0];
  await prisma.$executeRawUnsafe(`
    UPDATE personal_messages SET junior_answered = true, junior_answer = $1
    WHERE id = $2
  `, juniorMessage, m.id);
  if (['guincho', 'rastreador', 'instalacao'].includes(m.detected_intent)) {
    const exId = require('crypto').randomUUID();
    await prisma.$executeRawUnsafe(`
      INSERT INTO personal_learning_examples (id, topic, customer_msg, junior_response, message_id, approved)
      VALUES ($1, $2, $3, $4, $5, true)
    `, exId, m.detected_intent, m.message_content, juniorMessage, m.id);
    console.log('[personal-bot] aprendeu novo exemplo:', m.detected_intent);
  }
  return { learned: true, msgId: m.id };
}

module.exports = {
  handleMessage,
  learnFromJuniorResponse,
  isPersonalContact,
  autoPromoteIfFrequent,
  classifyIntent,
};
