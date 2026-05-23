/**
 * smsGatewayService
 * Envia SMS atraves de um gateway configuravel por variaveis de ambiente.
 * Pensado para o android-sms-gateway (celular pareado), mas e generico.
 *
 * Variaveis de ambiente:
 *   SMS_GATEWAY_URL    -> endpoint que recebe o POST de envio (ex.: http://jr-sms-gateway:3000/message)
 *   SMS_GATEWAY_USER   -> usuario (basic auth) [opcional]
 *   SMS_GATEWAY_PASS   -> senha (basic auth) [opcional]
 *   SMS_GATEWAY_TOKEN  -> bearer token [opcional, alternativa ao basic auth]
 *   SMS_GATEWAY_FORMAT -> "android" (default) | "simple"
 *
 * Formatos de corpo:
 *   android -> { message: <texto>, phoneNumbers: [<to>] }   (android-sms-gateway)
 *   simple  -> { to: <to>, text: <texto> }                  (gateway generico/proprio)
 */
const axios = require('axios');

function isConfigured() {
  return Boolean(String(process.env.SMS_GATEWAY_URL || '').trim());
}

function buildAuthHeaders() {
  const token = String(process.env.SMS_GATEWAY_TOKEN || '').trim();
  if (token) return { Authorization: `Bearer ${token}` };
  const user = String(process.env.SMS_GATEWAY_USER || '').trim();
  const pass = String(process.env.SMS_GATEWAY_PASS || '').trim();
  if (user) {
    const basic = Buffer.from(`${user}:${pass}`).toString('base64');
    return { Authorization: `Basic ${basic}` };
  }
  return {};
}

function buildBody(to, text) {
  const format = String(process.env.SMS_GATEWAY_FORMAT || 'android').trim().toLowerCase();
  if (format === 'simple') return { to, text };
  // default: android-sms-gateway
  return { message: text, phoneNumbers: [to] };
}

function normalizeNumber(raw) {
  return String(raw || '').replace(/[^\d+]/g, '');
}

async function sendSms(to, text) {
  if (!isConfigured()) {
    const err = new Error('Gateway de SMS nao configurado (defina SMS_GATEWAY_URL).');
    err.code = 'GATEWAY_NOT_CONFIGURED';
    throw err;
  }
  const url = String(process.env.SMS_GATEWAY_URL).trim();
  const number = normalizeNumber(to);
  if (!number) {
    const err = new Error('Numero de destino invalido.');
    err.code = 'INVALID_NUMBER';
    throw err;
  }
  if (!String(text || '').trim()) {
    const err = new Error('Comando/texto vazio.');
    err.code = 'EMPTY_TEXT';
    throw err;
  }
  const headers = Object.assign({ 'Content-Type': 'application/json' }, buildAuthHeaders());
  const res = await axios.post(url, buildBody(number, text), { headers, timeout: 20000 });
  return { ok: true, status: res.status, data: res.data };
}

module.exports = { isConfigured, sendSms, normalizeNumber };
