const evolutionApiProvider = require('../services/evolutionApiProvider');
const evolutionQrStore = require('../services/evolutionQrStore');

function getWebhookUrl() {
  const env = process.env.EVOLUTION_WEBHOOK_URL || '';
  if (env.trim()) return env.trim();
  return 'http://backend:3001/api/webhooks/evolution';
}

const getStatus = async (req, res) => {
  try {
    const state = await evolutionApiProvider.getConnectionState();
    return res.json({ state });
  } catch (err) {
    const status = err?.response?.status;
    const message = err?.response?.data?.response?.message?.[0] || err.message || 'Erro ao obter status.';
    return res.status(status || 500).json({ error: message });
  }
};

const createInstance = async (req, res) => {
  try {
    const data = await evolutionApiProvider.createInstance();
    return res.status(201).json(data);
  } catch (err) {
    const status = err?.response?.status;
    const message = err?.response?.data?.response?.message?.[0] || err.message || 'Erro ao criar instância.';
    return res.status(status || 500).json({ error: message });
  }
};

const getQrCode = async (req, res) => {
  try {
    let state;
    try {
      state = await evolutionApiProvider.getConnectionState();
    } catch (err) {
      if (err?.response?.status === 404) {
        await evolutionApiProvider.createInstance();
        await evolutionApiProvider.setWebhook({
          webhookUrl: getWebhookUrl(),
          events: ['MESSAGES_UPSERT', 'QRCODE_UPDATED'],
          webhookBase64: true,
        });
        state = null;
      } else {
        throw err;
      }
    }

    if (state === 'open') {
      return res.json({ connected: true, state: 'open' });
    }

    const trigger = req.query.trigger === 'true' || req.query.trigger === '1';
    if (trigger) {
      try {
        const apiResponse = await evolutionApiProvider.getQrCode();
        if (apiResponse.base64 || apiResponse.pairingCode || apiResponse.code) {
          evolutionQrStore.setQr({
            base64: apiResponse.base64,
            pairingCode: apiResponse.pairingCode,
            code: apiResponse.code,
          });
        }
      } catch {
        // Evolution API pode retornar vazio; o QR virá via webhook
      }
    }

    const cached = evolutionQrStore.getQr();
    if (cached && (cached.base64 || cached.pairingCode || cached.code)) {
      return res.json({
        base64: cached.base64,
        pairingCode: cached.pairingCode,
        code: cached.code,
        timestamp: cached.timestamp,
      });
    }

    return res.json({ pending: true, message: 'Aguardando QR code. Clique em "Gerar QR Code" e aguarde alguns segundos.' });
  } catch (err) {
    const status = err?.response?.status;
    const message = err?.response?.data?.response?.message?.[0] || err.message || 'Erro ao obter QR code.';
    return res.status(status || 500).json({ error: message });
  }
};

const setWebhook = async (req, res) => {
  try {
    const webhookUrl = req.body?.url || getWebhookUrl();
    const data = await evolutionApiProvider.setWebhook({
      webhookUrl,
      events: ['MESSAGES_UPSERT', 'QRCODE_UPDATED'],
      webhookBase64: true,
    });
    return res.json({ message: 'Webhook configurado.', ...data });
  } catch (err) {
    const status = err?.response?.status;
    const message = err?.response?.data?.response?.message?.[0] || err.message || 'Erro ao configurar webhook.';
    return res.status(status || 500).json({ error: message });
  }
};

const logoutInstance = async (req, res) => {
  try {
    await evolutionApiProvider.logoutInstance();
    return res.json({ message: 'Instância desconectada com sucesso.' });
  } catch (err) {
    const status = err?.response?.status;
    const message = err?.response?.data?.response?.message?.[0] || err.message || '';

    if (status === 400 && /not connected/i.test(message)) {
      return res.json({ message: 'Instância já estava desconectada.' });
    }

    return res.status(status || 500).json({ error: message || 'Erro ao desconectar.' });
  }
};

const disconnectAndReset = async (req, res) => {
  try {
    try {
      await evolutionApiProvider.logoutInstance();
    } catch (logoutErr) {
      if (logoutErr?.response?.status !== 400) throw logoutErr;
    }
    await new Promise((r) => setTimeout(r, 1500));
    try {
      await evolutionApiProvider.deleteInstance();
    } catch (delErr) {
      if (delErr?.response?.status !== 404) throw delErr;
    }
    await evolutionApiProvider.createInstance();
    await evolutionApiProvider.setWebhook({
      webhookUrl: getWebhookUrl(),
      events: ['MESSAGES_UPSERT', 'QRCODE_UPDATED'],
      webhookBase64: true,
    });
    evolutionQrStore.clearQr();
    return res.json({ message: 'Instância resetada. Gere um novo QR code para reconectar.' });
  } catch (err) {
    const status = err?.response?.status;
    const message = err?.response?.data?.response?.message?.[0] || err.message || 'Erro ao resetar instância.';
    return res.status(status || 500).json({ error: message });
  }
};

module.exports = { getStatus, createInstance, getQrCode, setWebhook, logoutInstance, disconnectAndReset };
