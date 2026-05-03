// src/services/whatsappTemplateService.js
const prisma = require('../lib/prisma');

const cache = new Map();
let cacheUntil = 0;

async function loadAll() {
  const now = Date.now();
  if (cache.size && cacheUntil > now) return cache;
  const rows = await prisma.whatsappTemplate.findMany({ where: { active: true } });
  cache.clear();
  for (const r of rows) cache.set(r.eventKey, r);
  cacheUntil = now + 30_000; // 30s cache
  return cache;
}

function invalidate() {
  cache.clear();
  cacheUntil = 0;
}

function render(template, vars) {
  return template.replace(/\{(\w+)\}/g, (_, k) => vars[k] != null ? String(vars[k]) : '');
}

async function buildMessage(eventKey, vars) {
  const all = await loadAll();
  const tpl = all.get(eventKey);
  if (!tpl) return null;
  return render(tpl.message, vars);
}

module.exports = { loadAll, invalidate, render, buildMessage };
