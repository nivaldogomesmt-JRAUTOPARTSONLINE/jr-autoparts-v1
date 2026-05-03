const axios = require('axios');

const WEBHOOK_URL = process.env.COBRANCA_WEBHOOK_URL || 'http://jr-rastrek-webhook:3000';
const SECRET = process.env.COBRANCA_WEBHOOK_SECRET || process.env.WEBHOOK_SECRET || '';

const client = axios.create({
  baseURL: WEBHOOK_URL,
  timeout: 15000,
  headers: { 'X-Webhook-Secret': SECRET, 'Content-Type': 'application/json' },
});

async function listar({ status, leva } = {}) {
  const { data } = await client.get('/api/cobranca/listar', { params: { status, leva } });
  return data;
}

async function resumo() {
  const { data } = await client.get('/api/cobranca/resumo');
  return data;
}

async function eventos(id) {
  const { data } = await client.get(`/api/cobranca/eventos/${encodeURIComponent(id)}`);
  return data;
}

async function marcarNegociada(id, observacao) {
  const { data } = await client.post('/api/cobranca/marcar-negociada', { id, observacao });
  return data;
}

async function reenviar(id, msg) {
  const { data } = await client.post('/api/cobranca/enviar', { id, msg });
  return data;
}

module.exports = { listar, resumo, eventos, marcarNegociada, reenviar };
