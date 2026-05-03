const axios = require('axios');
const prisma = require('../lib/prisma');
const { resolveNotificationPayload } = require('./notificationCenterService');
const evolutionApiProvider = require('./evolutionApiProvider');

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

function parseMaybeJson(raw) {
  if (!raw) return null;
  const text = String(raw).trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function normalizeConfigUrl(rawUrl) {
  let value = String(rawUrl || '').trim();
  if (!value) return '';

  if (!/^https?:\/\//i.test(value)) {
    value = `https://${value}`;
  }

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return '';
  }

  let pathname = parsed.pathname || '';
  pathname = pathname.replace(/\/+$/, '');
  pathname = pathname.replace(/\/swagger(?:\/.*)?$/i, '');
  pathname = pathname.replace(/\/api-docs(?:\/.*)?$/i, '');
  pathname = pathname.replace(/\/docs(?:\/.*)?$/i, '');

  parsed.pathname = pathname || '';
  return sanitizeBaseUrl(parsed.toString());
}

function buildBaseUrlCandidates(rawUrl) {
  const normalized = normalizeConfigUrl(rawUrl);
  if (!normalized) return [];

  let parsed;
  try {
    parsed = new URL(normalized);
  } catch {
    return [];
  }

  const baseOrigin = `${parsed.protocol}//${parsed.host}`;
  const cleanPath = String(parsed.pathname || '').replace(/\/+$/, '');
  const candidates = new Set();

  if (/\/api\/v1$/i.test(cleanPath)) {
    candidates.add(`${baseOrigin}${cleanPath}`);
  } else if (/\/api$/i.test(cleanPath)) {
    candidates.add(`${baseOrigin}${cleanPath}/v1`);
    candidates.add(`${baseOrigin}${cleanPath}`);
  } else if (cleanPath) {
    candidates.add(`${baseOrigin}${cleanPath}/api/v1`);
    candidates.add(`${baseOrigin}${cleanPath}/api`);
    candidates.add(`${baseOrigin}${cleanPath}`);
  } else {
    candidates.add(`${baseOrigin}/api/v1`);
    candidates.add(`${baseOrigin}/api`);
    candidates.add(baseOrigin);
  }

  return [...candidates].map((item) => sanitizeBaseUrl(item));
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
    { url: `${baseUrl}/subscriber/`, body: { phone, has_opt_in_whatsapp: true } },
    { url: `${baseUrl}/subscriber/create/`, body: { phone, has_opt_in_whatsapp: true } },
    { url: `${baseUrl}/subscriber`, body: { phone, has_opt_in_whatsapp: true } },
    { url: `${baseUrl}/subscriber/create`, body: { phone, has_opt_in_whatsapp: true } },
  ];

  for (const endpoint of endpoints) {
    try {
      await axios.post(endpoint.url, endpoint.body, { headers, timeout: 10000 });
      return true;
    } catch (err) {
      const status = err?.response?.status;
      if (status === 404 || status === 405 || status === 401) {
        continue;
      }
    }
  }

  return false;
}

async function getSubscriberByPhone({ baseUrl, headers, phone }) {
  const lookupUrl = `${baseUrl}/subscriber/get_by_phone/${encodeURIComponent(phone)}/`;
  const response = await axios.get(lookupUrl, { headers, timeout: 10000 });
  return response.data || null;
}

async function sendToBotConversa({ baseUrl, headers, phone, content }) {
  let subscriber = null;

  try {
    subscriber = await getSubscriberByPhone({ baseUrl, headers, phone });
  } catch (err) {
    const status = err?.response?.status;
    if (status !== 404) {
      throw err;
    }
  }

  if (!subscriber?.id) {
    const created = await ensureSubscriber({ baseUrl, headers, phone });
    if (created) {
      try {
        subscriber = await getSubscriberByPhone({ baseUrl, headers, phone });
      } catch (err) {
        const status = err?.response?.status;
        if (status !== 404) {
          throw err;
        }
      }
    }
  }

  if (!subscriber?.id) {
    throw new Error(`Subscriber nao encontrado para o telefone ${phone}.`);
  }

  const sendUrl = `${baseUrl}/subscriber/${subscriber.id}/send_message/`;
  await axios.post(
    sendUrl,
    {
      type: 'text',
      value: content,
    },
    { headers, timeout: 10000 }
  );

  return { ok: true, subscriberId: subscriber.id };
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

async function wasWhatsAppRecentlySent({ clientId, soId = null, content, windowHours = 24 }) {
  const safeHours = Math.max(1, Number.parseInt(String(windowHours || 24), 10) || 24);
  const recent = new Date(Date.now() - safeHours * 60 * 60 * 1000);

  const found = await prisma.whatsappMessage.findFirst({
    where: {
      clientId,
      soId: soId || null,
      content: String(content || ''),
      createdAt: { gte: recent },
      status: { in: ['PENDING', 'SENT'] },
    },
    select: { id: true, createdAt: true, status: true },
    orderBy: { createdAt: 'desc' },
  });

  return found || null;
}

async function getBotConversaConfig() {
  const envUrl = process.env.BOTCONVERSA_API_URL || process.env.BOTCONVERSA_API_BASE_URL || '';
  const envKey = process.env.BOTCONVERSA_API_KEY || '';

  if (String(envUrl).trim() && String(envKey).trim()) {
    return {
      apiUrl: String(envUrl).trim(),
      apiKey: String(envKey).trim(),
      source: 'env',
    };
  }

  try {
    const account = await prisma.digitalAccount.findFirst({
      where: {
        active: true,
        platform: 'BOTCONVERSA',
        status: 'ACTIVE',
      },
      orderBy: { updatedAt: 'desc' },
    });

    if (!account) {
      return {
        apiUrl: String(envUrl).trim(),
        apiKey: String(envKey).trim(),
        source: 'env',
      };
    }

    const notesObj = parseMaybeJson(account.notes) || {};
    const fromNotesUrl = notesObj.apiUrl || notesObj.baseUrl || notesObj.url || '';
    const fromNotesKey = notesObj.apiKey || notesObj.key || notesObj.token || '';

    const apiUrl = String(envUrl || fromNotesUrl || account.plan || '').trim();
    const apiKey = String(envKey || fromNotesKey || account.contact || '').trim();

    return { apiUrl, apiKey, source: 'digitalAccount' };
  } catch {
    return {
      apiUrl: String(envUrl).trim(),
      apiKey: String(envKey).trim(),
      source: 'env',
    };
  }
}

function getWhatsAppProvider() {
  const provider = String(process.env.WHATSAPP_PROVIDER || 'botconversa').trim().toLowerCase();
  return provider === 'evolution' ? 'evolution' : 'botconversa';
}

/**
 * Envia mensagem via provider configurado (BotConversa ou Evolution API) e registra no banco.
 */
const sendWhatsAppMessage = async ({ clientId, soId, phone, content, messageId }) => {
  const normalizedPhone = normalizePhone(phone);
  const provider = getWhatsAppProvider();

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

  try {
    if (provider === 'evolution') {
      const apiUrl = String(process.env.EVOLUTION_API_URL || '').trim();
      const apiKey = String(process.env.EVOLUTION_API_KEY || '').trim();
      const instanceName = String(process.env.EVOLUTION_INSTANCE_NAME || '').trim();

      if (!apiUrl || !apiKey || !instanceName) {
        const errorMsg = 'EVOLUTION_API_URL, EVOLUTION_API_KEY e EVOLUTION_INSTANCE_NAME devem estar configurados.';
        await prisma.whatsappMessage.update({
          where: { id: message.id },
          data: { status: 'FAILED', errorMessage: errorMsg },
        });
        return { success: false, messageId: message.id, error: errorMsg };
      }

      await evolutionApiProvider.sendTextMessage({
        phone: normalizedPhone,
        content,
      });

      await prisma.whatsappMessage.update({
        where: { id: message.id },
        data: { status: 'SENT', sentAt: new Date(), errorMessage: null },
      });

      console.log(`WhatsApp enviado para ${normalizedPhone} (evolution)`);
      return { success: true, messageId: message.id };
    }

    const config = await getBotConversaConfig();
    const apiKey = String(config.apiKey || '').trim();
    const baseCandidates = buildBaseUrlCandidates(config.apiUrl || 'https://backend.botconversa.com.br/api/v1');

    if (!apiKey) {
      const errorMsg = 'BOTCONVERSA_API_KEY nao configurada no backend.';
      await prisma.whatsappMessage.update({
        where: { id: message.id },
        data: { status: 'FAILED', errorMessage: errorMsg },
      });
      return { success: false, messageId: message.id, error: errorMsg };
    }

    if (!baseCandidates.length) {
      const errorMsg = 'BOTCONVERSA_API_URL invalida. Exemplo: https://backend.botconversa.com.br/api/v1';
      await prisma.whatsappMessage.update({
        where: { id: message.id },
        data: { status: 'FAILED', errorMessage: errorMsg },
      });
      return { success: false, messageId: message.id, error: errorMsg };
    }

    let sent = false;
    let lastErr = null;

    for (const baseUrl of baseCandidates) {
      try {
        await sendToBotConversa({
          baseUrl,
          headers: buildHeaders(apiKey),
          phone: normalizedPhone,
          content,
        });
        sent = true;
        break;
      } catch (err) {
        lastErr = err;
      }
    }

    if (!sent) {
      throw lastErr || new Error('Falha ao enviar mensagem em todos os endpoints configurados.');
    }

    await prisma.whatsappMessage.update({
      where: { id: message.id },
      data: { status: 'SENT', sentAt: new Date(), errorMessage: null },
    });

    console.log(`WhatsApp enviado para ${normalizedPhone} (${config.source})`);
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

const sendWhatsAppMessageWithDedupe = async ({
  clientId,
  soId,
  phone,
  content,
  messageId,
  dedupeHours = 24,
  eventKey,
  templateVariables,
}) => {
  const resolved = await resolveNotificationPayload({
    eventKey,
    fallbackContent: content,
    variables: templateVariables || {},
    fallbackDedupeHours: dedupeHours,
  });

  if (!resolved.enabled) {
    return {
      success: true,
      skipped: true,
      reason: resolved.reason || 'event_disabled',
      eventKey: resolved.eventKey,
    };
  }

  const duplicate = await wasWhatsAppRecentlySent({
    clientId,
    soId: soId || null,
    content: resolved.content,
    windowHours: resolved.dedupeHours,
  });

  if (duplicate) {
    return {
      success: true,
      skipped: true,
      reason: 'duplicate',
      duplicateMessageId: duplicate.id,
      eventKey: resolved.eventKey,
    };
  }

  const result = await sendWhatsAppMessage({
    clientId,
    soId,
    phone,
    content: resolved.content,
    messageId,
  });

  return {
    ...result,
    skipped: false,
    eventKey: resolved.eventKey,
  };
};

module.exports = {
  sendWhatsAppMessage,
  sendWhatsAppMessageWithDedupe,
  wasWhatsAppRecentlySent,
  getWhatsAppProvider,
};

