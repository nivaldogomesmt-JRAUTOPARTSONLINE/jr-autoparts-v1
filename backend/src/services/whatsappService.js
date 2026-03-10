const axios = require('axios');
const prisma = require('../lib/prisma');

const DEFAULT_COUNTRY_CODE = '55';

function normalizePhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return '';

  if (digits.length === 10 || digits.length === 11) {
    return `${DEFAULT_COUNTRY_CODE}${digits}`;
  }

  if (digits.length === 12 || digits.length === 13) {
    return digits;
  }

  return digits;
}

function sanitizeBaseUrl(url) {
  return String(url || '').trim().replace(/\/+$/, '');
}

function buildHeaders(apiKey) {
  return {
    'api-key': apiKey,
    'API-KEY': apiKey,
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };
}

function parseErrorMessage(err) {
  const status = err?.response?.status;
  const payload = err?.response?.data;

  let details = '';
  if (typeof payload === 'string') {
    details = payload;
  } else if (payload && typeof payload === 'object') {
    details = payload.message || payload.error || JSON.stringify(payload);
  } else {
    details = err.message || 'Erro desconhecido';
  }

  return status ? `${status} - ${details}` : details;
}

function looksLikeSubscriberMissing(errorText) {
  const text = String(errorText || '').toLowerCase();
  return text.includes('subscriber') && (text.includes('not found') || text.includes('nao encontrado') || text.includes('não encontrado'));
}

async function ensureSubscriber({ baseUrl, headers, phone }) {
  const endpoints = [
    { url: `${baseUrl}/subscriber/`, body: { phone } },
    { url: `${baseUrl}/subscriber/create/`, body: { phone } },
  ];

  for (const endpoint of endpoints) {
    try {
      await axios.post(endpoint.url, endpoint.body, { headers, timeout: 10000 });
      return true;
    } catch (err) {
      const status = err?.response?.status;
      if (status === 404 || status === 405) {
        continue;
      }
    }
  }

  return false;
}

async function sendToBotConversa({ baseUrl, headers, phone, content }) {
  const attempts = [
    { url: `${baseUrl}/subscriber/send-message/`, body: { phone, message: content } },
    { url: `${baseUrl}/subscriber/${phone}/send-message/`, body: { message: content } },
  ];

  let lastError = null;

  for (const attempt of attempts) {
    try {
      await axios.post(attempt.url, attempt.body, { headers, timeout: 10000 });
      return { ok: true };
    } catch (err) {
      const status = err?.response?.status;
      const text = parseErrorMessage(err);

      if (looksLikeSubscriberMissing(text)) {
        const created = await ensureSubscriber({ baseUrl, headers, phone });
        if (created) {
          try {
            await axios.post(attempt.url, attempt.body, { headers, timeout: 10000 });
            return { ok: true };
          } catch (retryErr) {
            lastError = retryErr;
            continue;
          }
        }
      }

      if (status === 404 || status === 405) {
        lastError = err;
        continue;
      }

      throw err;
    }
  }

  throw lastError || new Error('Nenhum endpoint de envio aceitou a requisicao.');
}

async function upsertMessageRecord({ clientId, soId, phone, content, messageId }) {
  if (messageId) {
    return prisma.whatsappMessage.update({
      where: { id: messageId },
      data: { status: 'PENDING', errorMessage: null },
    });
  }

  return prisma.whatsappMessage.create({
    data: {
      clientId,
      soId: soId || null,
      phone,
      content,
      status: 'PENDING',
      attempts: 1,
    },
  });
}

/**
 * Envia mensagem via BotConversa API e registra no banco.
 */
const sendWhatsAppMessage = async ({ clientId, soId, phone, content, messageId }) => {
  const normalizedPhone = normalizePhone(phone);
  const apiUrl = sanitizeBaseUrl(process.env.BOTCONVERSA_API_URL || process.env.BOTCONVERSA_API_BASE_URL);
  const apiKey = String(process.env.BOTCONVERSA_API_KEY || '').trim();

  const message = await upsertMessageRecord({
    clientId,
    soId,
    phone: normalizedPhone,
    content,
    messageId,
  });

  if (!normalizedPhone) {
    const errorMsg = 'Telefone do cliente invalido ou vazio.';
    await prisma.whatsappMessage.update({
      where: { id: message.id },
      data: { status: 'FAILED', errorMessage: errorMsg },
    });
    return { success: false, messageId: message.id, error: errorMsg };
  }

  if (!apiUrl || !apiKey) {
    const errorMsg = 'BOTCONVERSA_API_URL ou BOTCONVERSA_API_KEY nao configurados no backend.';
    await prisma.whatsappMessage.update({
      where: { id: message.id },
      data: { status: 'FAILED', errorMessage: errorMsg },
    });
    return { success: false, messageId: message.id, error: errorMsg };
  }

  try {
    await sendToBotConversa({
      baseUrl: apiUrl,
      headers: buildHeaders(apiKey),
      phone: normalizedPhone,
      content,
    });

    await prisma.whatsappMessage.update({
      where: { id: message.id },
      data: { status: 'SENT', sentAt: new Date(), errorMessage: null },
    });

    console.log(`WhatsApp enviado para ${normalizedPhone}`);
    return { success: true, messageId: message.id };
  } catch (err) {
    const errorMsg = parseErrorMessage(err);

    await prisma.whatsappMessage.update({
      where: { id: message.id },
      data: { status: 'FAILED', errorMessage: errorMsg },
    });

    console.error(`WhatsApp falhou para ${normalizedPhone}: ${errorMsg}`);
    return { success: false, messageId: message.id, error: errorMsg };
  }
};

module.exports = { sendWhatsAppMessage };
