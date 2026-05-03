// src/services/learningService.js - few-shot evolutivo
const prisma = require('../lib/prisma');

function normalize(s) {
  return String(s || '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ').trim();
}
function tokens(s) {
  const stop = new Set(['de','da','do','dos','das','para','com','um','uma','o','a','e','pra','tem','tem']);
  return normalize(s).split(' ').filter(t => t.length >= 3 && !stop.has(t));
}

async function findSimilar(input, opts = {}) {
  const tks = tokens(input);
  if (!tks.length) return [];
  const where = { score: { gt: 0 } };
  if (opts.intent) where.intent = opts.intent;
  // Mínimo 1 token bate (mais flexível)
  where.OR = tks.slice(0, 6).map(t => ({ inputNorm: { contains: t } }));
  return prisma.learningExample.findMany({
    where,
    orderBy: [{ score: 'desc' }, { createdAt: 'desc' }],
    take: opts.limit || 3,
  });
}

async function registrar({ inputText, outputText, intent, category, score, approvedBy, sourceType, sourceId, templateId }) {
  return prisma.learningExample.create({
    data: {
      inputText: String(inputText).slice(0, 1000),
      inputNorm: normalize(inputText),
      outputText: String(outputText).slice(0, 2000),
      intent: intent || null,
      category: category || null,
      score: score ?? 1,
      approvedBy: approvedBy || null,
      sourceType: sourceType || 'CONVERSATION',
      sourceId: sourceId || null,
      templateId: templateId || null,
    },
  });
}

async function ajustarScore(id, delta) {
  return prisma.learningExample.update({
    where: { id },
    data: { score: { increment: delta } },
  });
}

async function getMemoria(phone) {
  const limpo = String(phone).replace(/\D/g, '');
  return prisma.customerMemory.findUnique({ where: { customerPhone: limpo } });
}

async function upsertMemoria(phone, data = {}) {
  const limpo = String(phone).replace(/\D/g, '');
  return prisma.customerMemory.upsert({
    where: { customerPhone: limpo },
    create: {
      customerPhone: limpo,
      customerName: data.customerName || null,
      lastSeen: new Date(),
      totalMessages: 1,
    },
    update: {
      customerName: data.customerName || undefined,
      lastSeen: new Date(),
      totalMessages: { increment: 1 },
      preferences: data.preferences || undefined,
    },
  });
}

module.exports = { findSimilar, registrar, ajustarScore, getMemoria, upsertMemoria, normalize };
