// src/services/auditService.js - audit log + WhatsApp notify
const prisma = require('../lib/prisma');
const axios = require('axios');

const SEVERITY = { INFO: 0, NOTICE: 1, WARN: 2, ERROR: 3, CRITICAL: 4 };
const NOTIFY_IMMEDIATELY = ['ERROR', 'CRITICAL']; // severities que avisam JR na hora
const NOTIFY_TYPES_IMMEDIATE = ['lead_olx', 'cobranca_paga', 'cobranca_respondida', 'venda_fechada', 'erro_critico'];

const EVO_URL = process.env.EVOLUTION_URL || 'http://jr-evolution-api:8080';
const EVO_KEY = process.env.EVOLUTION_API_KEY || '';
const EVO_INSTANCE = process.env.EVO_INSTANCE_FINANCEIRO || 'jr-financeiro-bot';
const JUNIOR_PHONE = process.env.JUNIOR_ALERT_PHONE || '5565993471331';

async function log(event) {
  try {
    const entry = await prisma.auditLog.create({
      data: {
        eventType: event.eventType,
        severity: event.severity || 'INFO',
        source: event.source || 'system',
        action: event.action,
        actor: event.actor || null,
        resource: event.resource || null,
        details: event.details || null,
      },
    });
    // Notifica imediatamente se for crítico
    if (NOTIFY_IMMEDIATELY.includes(entry.severity) || NOTIFY_TYPES_IMMEDIATE.includes(entry.eventType)) {
      notifyImmediate(entry).catch(e => console.log('[audit] erro notify:', e.message));
    }
    return entry;
  } catch (err) {
    console.log('[audit] erro log:', err.message);
  }
}

async function notifyImmediate(entry) {
  const emoji = { CRITICAL: '🚨', ERROR: '❌', WARN: '⚠️', NOTICE: 'ℹ️', INFO: '📌' }[entry.severity] || '📌';
  const msg = `${emoji} *${entry.eventType}*\n${entry.action}\n${entry.resource ? `_${entry.resource}_\n` : ''}${entry.details ? `\`\`\`${JSON.stringify(entry.details).slice(0, 200)}\`\`\`` : ''}`;
  await axios.post(`${EVO_URL}/message/sendText/${EVO_INSTANCE}`,
    { number: JUNIOR_PHONE, text: msg },
    { headers: { apikey: EVO_KEY }, timeout: 10000 }
  ).catch(() => {});
  await prisma.auditLog.update({ where: { id: entry.id }, data: { notified: true } });
}

/** Resumo periódico (chamado por cron) — consolida ultimos N min e manda resumo */
async function notifyDigest(minutosAtras = 30) {
  const desde = new Date(Date.now() - minutosAtras * 60_000);
  const recentes = await prisma.auditLog.findMany({
    where: { createdAt: { gte: desde }, notified: false },
    orderBy: { createdAt: 'desc' },
  });
  if (!recentes.length) return { skipped: true };

  // Agrupa por eventType
  const grupos = {};
  for (const r of recentes) {
    if (!grupos[r.eventType]) grupos[r.eventType] = { count: 0, exemplos: [] };
    grupos[r.eventType].count++;
    if (grupos[r.eventType].exemplos.length < 3) grupos[r.eventType].exemplos.push(r);
  }

  let msg = `📊 *Resumo JR — últimos ${minutosAtras} min*\n\n`;
  for (const [tipo, g] of Object.entries(grupos)) {
    msg += `*${tipo}*: ${g.count}\n`;
  }
  msg += `\nTotal: ${recentes.length} eventos`;

  await axios.post(`${EVO_URL}/message/sendText/${EVO_INSTANCE}`,
    { number: JUNIOR_PHONE, text: msg },
    { headers: { apikey: EVO_KEY }, timeout: 10000 }
  ).catch(() => {});

  // Marca como notificados
  await prisma.auditLog.updateMany({
    where: { id: { in: recentes.map(r => r.id) } },
    data: { notified: true },
  });
  return { sent: recentes.length };
}

module.exports = { log, notifyImmediate, notifyDigest };
