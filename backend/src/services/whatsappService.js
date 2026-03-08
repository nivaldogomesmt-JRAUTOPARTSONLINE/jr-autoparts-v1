const axios = require('axios');
const prisma = require('../lib/prisma');

/**
 * Envia mensagem via BotConversa API e registra no banco.
 */
const sendWhatsAppMessage = async ({ clientId, soId, phone, content, messageId }) => {
  // Normaliza número (remove tudo exceto dígitos)
  const normalizedPhone = phone.replace(/\D/g, '');

  // Cria ou atualiza registro da mensagem
  let message;
  if (messageId) {
    message = await prisma.whatsappMessage.update({
      where: { id: messageId },
      data: { status: 'PENDING', attempts: { increment: 1 } },
    });
  } else {
    message = await prisma.whatsappMessage.create({
      data: {
        clientId,
        soId: soId || null,
        phone: normalizedPhone,
        content,
        status: 'PENDING',
        attempts: 1,
      },
    });
  }

  try {
    // Envio via BotConversa
    // Documentação: https://docs.botconversa.com.br
    const response = await axios.post(
      `${process.env.BOTCONVERSA_API_URL}/subscriber/send-message/`,
      {
        phone: normalizedPhone,
        message: content,
      },
      {
        headers: {
          'api-key': process.env.BOTCONVERSA_API_KEY,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      }
    );

    // Sucesso
    await prisma.whatsappMessage.update({
      where: { id: message.id },
      data: { status: 'SENT', sentAt: new Date(), errorMessage: null },
    });

    console.log(`✅ WhatsApp enviado para ${normalizedPhone}`);
    return { success: true, messageId: message.id };
  } catch (err) {
    const errorMsg = err.response?.data?.message || err.message;

    // Falha
    await prisma.whatsappMessage.update({
      where: { id: message.id },
      data: { status: 'FAILED', errorMessage: errorMsg },
    });

    console.error(`❌ WhatsApp falhou para ${normalizedPhone}: ${errorMsg}`);
    return { success: false, messageId: message.id, error: errorMsg };
  }
};

module.exports = { sendWhatsAppMessage };
