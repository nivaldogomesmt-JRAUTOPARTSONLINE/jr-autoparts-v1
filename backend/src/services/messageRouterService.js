// src/services/messageRouterService.js
// Roteador central de mensagens WhatsApp por tipo de evento.
// Lê regras da tabela messaging_routes e despacha pra instância Evolution correta.
const axios = require('axios');
const prisma = require('../lib/prisma');

const EVO_URL = process.env.EVOLUTION_URL || process.env.EVOLUTION_API_URL || 'http://jr-evolution-api:8080';
const EVO_KEY = process.env.EVOLUTION_API_KEY || '';

function normalizePhone(phone) {
  let p = String(phone || '').replace(/\D/g, '');
  if (!p) return '';
  if (!p.startsWith('55')) p = '55' + p;
  return p;
}

/** Resolve {customer} placeholder com phone do destinatário */
function resolveRecipient(rule, payload) {
  if (rule.toRecipient === '{customer}') return normalizePhone(payload.customerPhone || payload.phone);
  if (rule.toKind === 'group') return rule.toRecipient;  // já é JID @g.us
  return normalizePhone(rule.toRecipient);
}

/**
 * Envia texto via Evolution API.
 * @param {string} instanceName - nome da instância (ex: jr-rh-bot)
 * @param {string} number - destinatário (telefone normalizado ou JID grupo)
 * @param {string} text - mensagem
 */
async function sendText(instanceName, number, text) {
  const url = `${EVO_URL}/message/sendText/${instanceName}`;
  const res = await axios.post(url, { number, text }, {
    headers: { apikey: EVO_KEY, 'Content-Type': 'application/json' },
    timeout: 30000,
  });
  return res.data;
}

/**
 * Envia mídia (imagem/PDF) via Evolution API.
 */
async function sendMedia(instanceName, number, mediaUrl, caption = '', mediaType = 'image') {
  const url = `${EVO_URL}/message/sendMedia/${instanceName}`;
  const res = await axios.post(url, {
    number, mediatype: mediaType, media: mediaUrl, caption,
  }, {
    headers: { apikey: EVO_KEY, 'Content-Type': 'application/json' },
    timeout: 60000,
  });
  return res.data;
}

/**
 * Função principal: roteia uma mensagem baseado no tipo de evento.
 * @param {string} eventType - ex: 'motivational_morning', 'system_alert', 'customer_complaint'
 * @param {object} payload - { text, customerPhone, mediaUrl, caption, ... }
 * @returns {Promise<{ok:boolean, route:object, result:any, error?:string}>}
 */
async function route(eventType, payload) {
  if (!eventType) throw new Error('eventType obrigatório');
  if (!payload || (!payload.text && !payload.mediaUrl)) {
    throw new Error('payload com text ou mediaUrl obrigatório');
  }

  const rule = await prisma.$queryRawUnsafe(
    `SELECT * FROM messaging_routes WHERE event_type = $1 AND active = true LIMIT 1`,
    eventType
  );

  if (!rule || !rule.length) {
    return { ok: false, error: `Sem regra ativa pra event_type='${eventType}'` };
  }

  const r = rule[0];
  const route = {
    eventType,
    fromInstance: r.from_instance,
    toKind: r.to_kind,
    toRecipient: resolveRecipient({
      toRecipient: r.to_recipient,
      toKind: r.to_kind,
    }, payload),
    privacy: r.privacy_level,
  };

  if (!route.toRecipient) {
    return { ok: false, error: 'Destinatário não resolvido', route };
  }

  try {
    let result;
    if (payload.mediaUrl) {
      result = await sendMedia(route.fromInstance, route.toRecipient, payload.mediaUrl, payload.caption || payload.text || '', payload.mediaType || 'image');
    } else {
      result = await sendText(route.fromInstance, route.toRecipient, payload.text);
    }
    return { ok: true, route, result };
  } catch (err) {
    return { ok: false, error: err?.response?.data?.message || err.message, route };
  }
}

/** Atalhos pra eventos comuns */
async function sendMotivational(text, period = 'morning') {
  return route(period === 'evening' ? 'motivational_evening' : 'motivational_morning', { text });
}

async function sendBillingRastrek(customerPhone, text, mediaUrl = null) {
  return route('billing_rastrek', { customerPhone, text, mediaUrl, mediaType: 'document' });
}

async function sendBillingCora(customerPhone, text, mediaUrl = null) {
  return route('billing_cora', { customerPhone, text, mediaUrl, mediaType: 'document' });
}

async function notifyJunior(text, severity = 'info') {
  // Salva no internal_alerts E envia
  try {
    await prisma.$executeRawUnsafe(
      `INSERT INTO internal_alerts (alert_type, severity, title, message, delivered, delivered_at)
       VALUES ($1, $2, $3, $4, true, NOW())`,
      'system_alert', severity, severity.toUpperCase(), text
    );
  } catch (e) { console.log('[router] save alert err:', e.message); }
  return route('system_alert', { text });
}

async function notifyJuniorAITraining(text) {
  return route('ai_training', { text });
}

async function notifyJuniorInternalComplaint(text) {
  return route('internal_complaint', { text });
}

async function notifyTeamCustomerComplaint(text, mediaUrl = null) {
  // Envia 2 mensagens: 1) grupo da equipe, 2) Junior pessoal
  const r1 = await route('customer_complaint', { text, mediaUrl });
  const r2 = await route('customer_complaint_admin', { text, mediaUrl });
  return { team: r1, admin: r2 };
}

/** Lista regras de roteamento (pra painel) */
async function listRoutes() {
  return prisma.$queryRawUnsafe(`SELECT * FROM messaging_routes ORDER BY event_type`);
}

/** Atualiza regra */
async function updateRoute(eventType, fields) {
  const allowed = ['from_instance', 'from_number', 'to_kind', 'to_recipient', 'privacy_level', 'description', 'active'];
  const sets = [];
  const vals = [];
  let i = 1;
  for (const k of allowed) {
    if (fields[k] !== undefined) {
      sets.push(`${k} = $${i++}`);
      vals.push(fields[k]);
    }
  }
  if (!sets.length) return null;
  sets.push(`updated_at = NOW()`);
  vals.push(eventType);
  await prisma.$executeRawUnsafe(
    `UPDATE messaging_routes SET ${sets.join(', ')} WHERE event_type = $${i}`,
    ...vals
  );
  const r = await prisma.$queryRawUnsafe(`SELECT * FROM messaging_routes WHERE event_type = $1`, eventType);
  return r[0];
}

module.exports = {
  route,
  sendText,
  sendMedia,
  sendMotivational,
  sendBillingRastrek,
  sendBillingCora,
  notifyJunior,
  notifyJuniorAITraining,
  notifyJuniorInternalComplaint,
  notifyTeamCustomerComplaint,
  listRoutes,
  updateRoute,
};
