const prisma = require('../lib/prisma');
const evolutionQrStore = require('../services/evolutionQrStore');
const chatbot = require('../services/whatsappChatbotService');
const evolutionApi = require('../services/evolutionApiProvider');

function extractPhone(remoteJid) {
  if (!remoteJid || typeof remoteJid !== 'string') return '';
  const match = remoteJid.match(/^(\d+)@/);
  return match ? match[1] : remoteJid.replace(/@.*$/, '');
}

function extractText(message) {
  if (!message || typeof message !== 'object') return '';
  return (
    message.conversation ||
    message.extendedTextMessage?.text ||
    message.imageMessage?.caption ||
    ''
  ).trim();
}

async function handleMessagesUpsert(payload) {
  const data = payload?.data || payload;
  let messages = Array.isArray(data) ? data : [data];
  if (data?.messages && Array.isArray(data.messages)) {
    messages = data.messages;
  }

  for (const item of messages) {
    const key = item?.key || item;
    const message = item?.message || item?.messages?.[0] || item;

    if (!key || key.fromMe) continue;

    const phone = extractPhone(key.remoteJid);
    const content = extractText(message);
    if (!phone || !content) continue;

    const normalizedPhone = phone.replace(/\D/g, '');
    const fullPhone = normalizedPhone.length <= 11 ? `55${normalizedPhone}` : normalizedPhone;

    let client = await prisma.client.findFirst({
      where: {
        OR: [
          { phone: { contains: fullPhone } },
          { whatsapp: { contains: fullPhone } },
          { phone: { contains: normalizedPhone } },
          { whatsapp: { contains: normalizedPhone } },
        ],
        active: true,
      },
      select: { id: true },
    });

    await prisma.whatsappMessage.create({
      data: {
        clientId: client?.id ?? null,
        phone: fullPhone,
        content,
        status: 'RECEIVED',
        attempts: 0,
      },
    });

    console.log(`WhatsApp recebido de ${fullPhone} (evolution): ${content.slice(0, 50)}...`);

    try {
      const reply = await chatbot.handleIncomingMessage(fullPhone, content);
      if (reply) {
        await evolutionApi.sendTextMessage({ phone: fullPhone, content: reply });
        console.log(`Chatbot respondeu para ${fullPhone}`);
      }
    } catch (err) {
      console.error(`Chatbot reply failed for ${fullPhone}:`, err.message);
    }
  }
}

function handleQrcodeUpdated(payload) {
  const data = payload?.data || payload;
  const base64 = data?.base64 || data?.qrcode;
  const code = data?.code;
  const pairingCode = data?.pairingCode || data?.pairing_code;
  if (base64 || pairingCode || code) {
    evolutionQrStore.setQr({ base64, pairingCode, code });
    console.log('Evolution: QR code recebido via webhook.');
  }
}

const receive = async (req, res) => {
  try {
    const payload = req.body;
    const event = payload?.event || payload?.eventName || '';

    if (event.includes('messages.upsert') || event === 'MESSAGES_UPSERT') {
      await handleMessagesUpsert(payload);
    }
    if (event.includes('qrcode.updated') || event === 'QRCODE_UPDATED') {
      handleQrcodeUpdated(payload);
    }

    res.status(200).json({ received: true });
  } catch (err) {
    console.error('Evolution webhook error:', err);
    res.status(200).json({ received: true });
  }
};

module.exports = { receive };
