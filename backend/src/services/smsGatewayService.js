/**
 * smsGatewayService
 * Envia SMS via SMSGate (android-sms-gateway). Compativel com servidor
 * privado (auto-hospedado) e nuvem publica — muda apenas a SMS_GATEWAY_URL.
 *
 * Variaveis de ambiente:
 *   SMS_GATEWAY_URL   -> endpoint de envio
 *       privado: https://SEU_DOMINIO/api/3rdparty/v1/messages
 *       nuvem:   https://api.sms-gate.app/3rdparty/v1/messages
 *   SMS_GATEWAY_USER  -> usuario (gerado pelo app ao conectar) [basic auth]
 *   SMS_GATEWAY_PASS  -> senha (gerada pelo app ao conectar)
 *   SMS_GATEWAY_TOKEN -> bearer token (alternativa ao basic auth) [opcional]
 *
 * Corpo (API 3rdparty v1): { phoneNumbers: ["+55..."], textMessage: { text } }
 */
const axios = require('axios');

function cfg() {
  return {
    url: String(process.env.SMS_GATEWAY_URL || '').trim(),
    user: String(process.env.SMS_GATEWAY_USER || '').trim(),
    pass: String(process.env.SMS_GATEWAY_PASS || '').trim(),
    token: String(process.env.SMS_GATEWAY_TOKEN || '').trim(),
  };
}

// So considera configurado quando ha URL E credencial (evita "envio real" sem login).
function isConfigured() {
  const c = cfg();
  return Boolean(c.url && (c.token || c.user));
}

function authHeaders() {
  const c = cfg();
  if (c.token) return { Authorization: `Bearer ${c.token}` };
  if (c.user) return { Authorization: `Basic ${Buffer.from(`${c.user}:${c.pass}`).toString('base64')}` };
  return {};
}

function normalizeNumber(raw) {
  return String(raw || '').replace(/[^\d+]/g, '');
}

async function sendSms(to, text) {
  const c = cfg();
  if (!isConfigured()) {
    const err = new Error('Gateway de SMS nao configurado (defina SMS_GATEWAY_URL e credenciais).');
    err.code = 'GATEWAY_NOT_CONFIGURED';
    throw err;
  }
  const number = normalizeNumber(to);
  if (!number) { const e = new Error('Numero de destino invalido.'); e.code = 'INVALID_NUMBER'; throw e; }
  if (!String(text || '').trim()) { const e = new Error('Comando/texto vazio.'); e.code = 'EMPTY_TEXT'; throw e; }

  const headers = Object.assign({ 'Content-Type': 'application/json' }, authHeaders());
  const body = { phoneNumbers: [number], textMessage: { text } };
  const res = await axios.post(c.url, body, { headers, timeout: 20000 });
  return { ok: true, status: res.status, data: res.data };
}

module.exports = { isConfigured, sendSms, normalizeNumber };
