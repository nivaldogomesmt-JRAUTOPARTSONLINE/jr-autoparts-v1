const axios = require('axios');

const baseUrl = () => String(process.env.EVOLUTION_API_URL || '').trim().replace(/\/+$/, '');
const apiKey = () => String(process.env.EVOLUTION_API_KEY || '').trim();
const instanceName = () => String(process.env.EVOLUTION_INSTANCE_NAME || '').trim();

function getHeaders() {
  const key = apiKey();
  return {
    apikey: key,
    'Content-Type': 'application/json',
  };
}

async function sendTextMessage({ phone, content }) {
  const url = baseUrl();
  const instance = instanceName();
  const key = apiKey();

  if (!url || !instance || !key) {
    throw new Error('EVOLUTION_API_URL, EVOLUTION_API_KEY e EVOLUTION_INSTANCE_NAME devem estar configurados.');
  }

  const response = await axios.post(
    `${url}/message/sendText/${instance}`,
    { number: phone, text: content },
    { headers: getHeaders(), timeout: 15000 }
  );

  return response.data;
}

async function getConnectionState() {
  const url = baseUrl();
  const instance = instanceName();
  const key = apiKey();

  if (!url || !instance || !key) {
    throw new Error('EVOLUTION_API_URL, EVOLUTION_API_KEY e EVOLUTION_INSTANCE_NAME devem estar configurados.');
  }

  const response = await axios.get(`${url}/instance/connectionState/${instance}`, {
    headers: getHeaders(),
    timeout: 10000,
  });

  return response.data?.instance?.state ?? null;
}

async function createInstance() {
  const url = baseUrl();
  const instance = instanceName();
  const key = apiKey();

  if (!url || !instance || !key) {
    throw new Error('EVOLUTION_API_URL, EVOLUTION_API_KEY e EVOLUTION_INSTANCE_NAME devem estar configurados.');
  }

  const response = await axios.post(
    `${url}/instance/create`,
    {
      instanceName: instance,
      integration: 'WHATSAPP-BAILEYS',
      qrcode: true,
    },
    { headers: getHeaders(), timeout: 15000 }
  );

  return response.data;
}

function looksLikeBase64(str) {
  if (!str || typeof str !== 'string') return false;
  return /^[A-Za-z0-9+/=]+$/.test(str) && str.length > 100;
}

async function getQrCode() {
  const url = baseUrl();
  const instance = instanceName();
  const key = apiKey();

  if (!url || !instance || !key) {
    throw new Error('EVOLUTION_API_URL, EVOLUTION_API_KEY e EVOLUTION_INSTANCE_NAME devem estar configurados.');
  }

  const maxRetries = 3;
  const retryDelayMs = 2000;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const response = await axios.get(`${url}/instance/connect/${instance}`, {
      headers: getHeaders(),
      timeout: 10000,
    });

    const data = response.data || {};
    const pairingCode = data.pairingCode || data.pairing_code;
    const code = data.code;
    const base64Raw = data.base64 || data.qrcode;
    const base64 = base64Raw || (code && looksLikeBase64(code) ? code : null);

    if (base64 || pairingCode || code) {
      return {
        pairingCode,
        code,
        base64: base64 || base64Raw,
        count: data.count,
      };
    }

    if (attempt < maxRetries) {
      await new Promise((r) => setTimeout(r, retryDelayMs));
    }
  }

  return { pairingCode: null, code: null, base64: null, count: 0 };
}

async function setWebhook({ webhookUrl, events = ['MESSAGES_UPSERT', 'QRCODE_UPDATED'], webhookBase64 = true }) {
  const url = baseUrl();
  const instance = instanceName();
  const key = apiKey();

  if (!url || !instance || !key) {
    throw new Error('EVOLUTION_API_URL, EVOLUTION_API_KEY e EVOLUTION_INSTANCE_NAME devem estar configurados.');
  }

  const response = await axios.post(
    `${url}/webhook/set/${instance}`,
    {
      webhook: {
        url: webhookUrl,
        enabled: true,
        webhookByEvents: false,
        webhookBase64: !!webhookBase64,
        events,
      },
    },
    { headers: getHeaders(), timeout: 15000 }
  );

  return response.data;
}

async function logoutInstance() {
  const url = baseUrl();
  const instance = instanceName();
  const key = apiKey();

  if (!url || !instance || !key) {
    throw new Error('EVOLUTION_API_URL, EVOLUTION_API_KEY e EVOLUTION_INSTANCE_NAME devem estar configurados.');
  }

  const response = await axios.delete(`${url}/instance/logout/${instance}`, {
    headers: getHeaders(),
    timeout: 10000,
  });

  return response.data;
}

async function deleteInstance() {
  const url = baseUrl();
  const instance = instanceName();
  const key = apiKey();

  if (!url || !instance || !key) {
    throw new Error('EVOLUTION_API_URL, EVOLUTION_API_KEY e EVOLUTION_INSTANCE_NAME devem estar configurados.');
  }

  const response = await axios.delete(`${url}/instance/delete/${instance}`, {
    headers: getHeaders(),
    timeout: 10000,
  });

  return response.data;
}

module.exports = {
  sendTextMessage,
  getConnectionState,
  createInstance,
  getQrCode,
  setWebhook,
  logoutInstance,
  deleteInstance,
};
