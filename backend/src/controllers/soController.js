const prisma = require('../lib/prisma');
const { sendWhatsAppMessage } = require('../services/whatsappService');

const STATUS_LABELS = {
  QUOTE: 'Orçamento',
  APPROVED: 'Aprovado',
  STARTED: 'Iniciado',
  IN_PROGRESS: 'Em Execução',
  WAITING_PART: 'Aguardando Peça',
  FINISHING: 'Finalizando',
  DONE: 'Finalizado',
  DELIVERED: 'Entregue',
};

const NOTIFY_ON_STATUS = ['STARTED', 'IN_PROGRESS', 'WAITING_PART', 'FINISHING', 'DONE', 'DELIVERED'];

const list = async (req, res) => {
  try {
    const { status, clientId, vehicleId, search, page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const where = {
      ...(status && { status }),
      ...(clientId && { clientId }),
      ...(vehicleId && { vehicleId }),
      ...(search && {
        OR: [
          { number: { equals: parseInt(search, 10) || 0 } },
          { client: { name: { contains: search, mode: 'insensitive' } } },
          { vehicle: { plate: { contains: String(search).toUpperCase() } } },
        ],
      }),
    };

    const [orders, total] = await Promise.all([
      prisma.serviceOrder.findMany({
        where,
        include: {
          client: { select: { id: true, name: true, phone: true, whatsapp: true } },
          vehicle: { select: { id: true, plate: true, brand: true, model: true } },
          _count: { select: { items: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: parseInt(limit, 10),
      }),
      prisma.serviceOrder.count({ where }),
    ]);

    return res.json({
      data: orders.map((o) => ({ ...o, total: o.totalPrice })),
      total,
      page: parseInt(page, 10),
      pages: Math.ceil(total / parseInt(limit, 10)),
    });
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao listar ordens de serviço.' });
  }
};

const get = async (req, res) => {
  try {
    const order = await prisma.serviceOrder.findUnique({
      where: { id: req.params.id },
      include: {
        client: true,
        vehicle: true,
        items: {
          include: {
            product: { select: { id: true, name: true, photoUrl: true } },
            service: { select: { id: true, name: true } },
          },
        },
        statusLogs: {
          orderBy: { createdAt: 'asc' },
          include: { user: { select: { id: true, name: true } } },
        },
        messages: { orderBy: { createdAt: 'desc' }, take: 10 },
      },
    });
    if (!order) return res.status(404).json({ error: 'OS não encontrada.' });
    return res.json({ ...order, total: order.totalPrice });
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao buscar OS.' });
  }
};

const create = async (req, res) => {
  try {
    const { clientId, vehicleId, entryKm, notes, items = [] } = req.body;
    if (!clientId || !vehicleId) {
      return res.status(400).json({ error: 'Cliente e veículo são obrigatórios.' });
    }

    const parsedItems = items.map((item) => ({
      type: item.type,
      productId: item.type === 'PRODUCT' ? item.itemId : null,
      serviceId: item.type === 'SERVICE' ? item.itemId : null,
      itemName: item.itemName,
      quantity: parseFloat(item.quantity),
      unitPrice: parseFloat(item.unitPrice),
    }));
    const total = parsedItems.reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0);

    const order = await prisma.$transaction(async (tx) => {
      const created = await tx.serviceOrder.create({
        data: {
          clientId,
          vehicleId,
          entryKm: entryKm ? parseInt(entryKm, 10) : null,
          notes,
          totalPrice: total,
          createdById: req.user.id,
          items: { create: parsedItems },
          statusLogs: { create: { newStatus: 'QUOTE', userId: req.user.id } },
        },
        include: { client: true, vehicle: true, items: true },
      });

      if (entryKm) {
        await tx.vehicle.update({ where: { id: vehicleId }, data: { currentKm: parseInt(entryKm, 10) } });
      }
      return created;
    });

    return res.status(201).json(order);
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao criar OS.' });
  }
};

const updateStatus = async (req, res) => {
  try {
    const { status, notes } = req.body;
    if (!status || !STATUS_LABELS[status]) {
      return res.status(400).json({ error: 'Status inválido.' });
    }

    const current = await prisma.serviceOrder.findUnique({
      where: { id: req.params.id },
      include: { client: true, vehicle: true },
    });
    if (!current) return res.status(404).json({ error: 'OS não encontrada.' });

    const order = await prisma.$transaction(async (tx) => tx.serviceOrder.update({
      where: { id: req.params.id },
      data: {
        status,
        ...(notes && { notes }),
        statusLogs: {
          create: {
            oldStatus: current.status,
            newStatus: status,
            userId: req.user.id,
          },
        },
      },
      include: { client: true, vehicle: true },
    }));

    if (NOTIFY_ON_STATUS.includes(status)) {
      const phone = current.client.whatsapp || current.client.phone;
      if (phone) {
        const msg = buildWhatsAppMessage(current.client.name, current.vehicle.plate, current.vehicle.brand, current.vehicle.model, status, current.number);
        await sendWhatsAppMessage({ clientId: current.clientId, soId: current.id, phone, content: msg }).catch((error) => {
          console.error('WhatsApp error:', error.message);
        });
      }
    }

    return res.json(order);
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao atualizar status.' });
  }
};

const update = async (req, res) => {
  try {
    const { entryKm, notes, items } = req.body;
    const current = await prisma.serviceOrder.findUnique({ where: { id: req.params.id } });
    if (!current) return res.status(404).json({ error: 'OS não encontrada.' });

    const order = await prisma.$transaction(async (tx) => {
      let total = current.totalPrice;
      if (items) {
        const parsedItems = items.map((item) => ({
          soId: req.params.id,
          type: item.type,
          productId: item.type === 'PRODUCT' ? item.itemId : null,
          serviceId: item.type === 'SERVICE' ? item.itemId : null,
          itemName: item.itemName,
          quantity: parseFloat(item.quantity),
          unitPrice: parseFloat(item.unitPrice),
        }));
        total = parsedItems.reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0);
        await tx.soItem.deleteMany({ where: { soId: req.params.id } });
        if (parsedItems.length) await tx.soItem.createMany({ data: parsedItems });
      }

      const updated = await tx.serviceOrder.update({
        where: { id: req.params.id },
        data: {
          entryKm: entryKm ? parseInt(entryKm, 10) : undefined,
          notes,
          totalPrice: parseFloat(total),
        },
        include: { client: true, vehicle: true, items: true },
      });

      if (entryKm) {
        await tx.vehicle.update({ where: { id: updated.vehicleId }, data: { currentKm: parseInt(entryKm, 10) } });
      }
      return updated;
    });

    return res.json(order);
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao atualizar OS.' });
  }
};

function buildWhatsAppMessage(clientName, plate, brand, model, status, number) {
  const statusLabel = STATUS_LABELS[status];
  const portalUrl = `${process.env.FRONTEND_URL}/portal`;
  const msgs = {
    STARTED: `Olá, ${clientName}! A manutenção do seu ${brand} ${model} (${plate}) foi iniciada. OS #${number}. Acompanhe pelo portal: ${portalUrl}`,
    IN_PROGRESS: `Olá, ${clientName}! Seu ${brand} ${model} (${plate}) está em manutenção neste momento. OS #${number}. Status: ${statusLabel}.`,
    WAITING_PART: `Olá, ${clientName}! Seu ${brand} ${model} (${plate}) está aguardando peça para continuidade do serviço. OS #${number}.`,
    FINISHING: `Olá, ${clientName}! O serviço do seu ${brand} ${model} (${plate}) está em fase final. OS #${number}.`,
    DONE: `Olá, ${clientName}! O serviço do seu ${brand} ${model} (${plate}) foi concluído. OS #${number}. Em breve faremos a liberação/entrega.`,
    DELIVERED: `Olá, ${clientName}! Seu ${brand} ${model} (${plate}) foi entregue. Obrigado pela preferência. Portal: ${portalUrl}`,
  };
  return msgs[status] || `Atualização da OS #${number}: status alterado para ${statusLabel}.`;
}

module.exports = { list, get, create, update, updateStatus };
