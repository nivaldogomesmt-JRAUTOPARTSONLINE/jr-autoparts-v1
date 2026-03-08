const { sendWhatsAppMessage } = require('../services/whatsappService');
const prisma = require('../lib/prisma');

// GET /api/messages
const list = async (req, res) => {
  try {
    const { status, clientId, soId, page = 1, limit = 30 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const where = {
      ...(status && { status }),
      ...(clientId && { clientId }),
      ...(soId && { soId }),
    };

    const [messages, total] = await Promise.all([
      prisma.whatsappMessage.findMany({
        where,
        include: {
          client: { select: { id: true, name: true } },
          serviceOrder: { select: { id: true, number: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: parseInt(limit),
      }),
      prisma.whatsappMessage.count({ where }),
    ]);

    res.json({ data: messages, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao listar mensagens.' });
  }
};

// POST /api/messages/:id/resend
const resend = async (req, res) => {
  try {
    const msg = await prisma.whatsappMessage.findUnique({ where: { id: req.params.id } });
    if (!msg) return res.status(404).json({ error: 'Mensagem não encontrada.' });

    await prisma.whatsappMessage.update({
      where: { id: req.params.id },
      data: { status: 'PENDING', attempts: { increment: 1 } },
    });

    const result = await sendWhatsAppMessage({
      clientId: msg.clientId,
      soId: msg.soId,
      phone: msg.phone,
      content: msg.content,
      messageId: msg.id,
    });

    res.json({ message: 'Mensagem reenviada.', result });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao reenviar mensagem.' });
  }
};

// POST /api/messages/send — envio manual
const send = async (req, res) => {
  try {
    const { clientId, phone, content, soId } = req.body;
    if (!clientId || !phone || !content) {
      return res.status(400).json({ error: 'Cliente, telefone e mensagem são obrigatórios.' });
    }

    const result = await sendWhatsAppMessage({ clientId, soId, phone, content });
    res.json({ message: 'Mensagem enviada.', result });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao enviar mensagem.' });
  }
};

module.exports = { list, resend, send };
