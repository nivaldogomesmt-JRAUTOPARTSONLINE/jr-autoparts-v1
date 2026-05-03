// src/services/healthService.js - métricas saúde do sistema
const axios = require('axios');
const { execSync } = require('child_process');

async function checkUrl(name, url, expect = 'ok', timeout = 5000) {
  const t0 = Date.now();
  try {
    const r = await axios.get(url, { timeout });
    const txt = typeof r.data === 'string' ? r.data : JSON.stringify(r.data);
    return {
      name, url,
      ok: r.status < 400 && (expect ? txt.toLowerCase().includes(String(expect).toLowerCase()) : true),
      status: r.status,
      latencyMs: Date.now() - t0,
    };
  } catch (e) {
    return { name, url, ok: false, status: e.response?.status || 0, latencyMs: Date.now() - t0, error: e.message.slice(0, 100) };
  }
}

async function checkServices() {
  return Promise.all([
    checkUrl('JR Backend',         'http://jr-backend:3001/health', 'ok', 3000),
    checkUrl('Webhook Rastrek',    'http://jr-rastrek-webhook:3000/healthz', 'ok', 3000),
    checkUrl('Evolution API',      'http://jr-evolution-api:8080/', 'evolution', 5000),
    checkUrl('Webhook (alt)',      'http://jr-rastrek-webhook:3000/healthz', 'ok', 3000),
  ]);
}

async function ollamaStatus() {
  try {
    const r = await axios.get('http://host.docker.internal:11434/api/tags', { timeout: 3000 });
    return { ok: true, models: (r.data?.models || []).map(m => ({ name: m.name, size_gb: (m.size / 1e9).toFixed(2) })) };
  } catch (e) {
    return { ok: false, error: e.message.slice(0, 100) };
  }
}

module.exports = { checkServices, ollamaStatus };
