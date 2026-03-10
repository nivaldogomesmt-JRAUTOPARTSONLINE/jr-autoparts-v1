const prisma = require('../lib/prisma');
const { sendWhatsAppMessage } = require('../services/whatsappService');

const STATUS_LABELS = {
  QUOTE: 'OrÃ§amento',
  APPROVED: 'Aprovado',
  STARTED: 'Iniciado',
  IN_PROGRESS: 'Em ExecuÃ§Ã£o',
  WAITING_PART: 'Aguardando PeÃ§a',
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
    return res.status(500).json({ error: 'Erro ao listar ordens de serviÃ§o.' });
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
    if (!order) return res.status(404).json({ error: 'OS nÃ£o encontrada.' });
    return res.json({ ...order, total: order.totalPrice });
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao buscar OS.' });
  }
};

const create = async (req, res) => {
  try {
    const { clientId, vehicleId, entryKm, notes, items = [] } = req.body;
    if (!clientId || !vehicleId) {
      return res.status(400).json({ error: 'Cliente e veiculo sao obrigatorios.' });
    }

    const parsedEntryKm = parseInt(entryKm, 10);
    if (!Number.isInteger(parsedEntryKm) || parsedEntryKm < 0) {
      return res.status(400).json({ error: 'Quilometragem de entrada e obrigatoria.' });
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
          entryKm: parsedEntryKm,
          notes,
          totalPrice: total,
          createdById: req.user.id,
          items: { create: parsedItems },
          statusLogs: { create: { newStatus: 'QUOTE', userId: req.user.id } },
        },
        include: { client: true, vehicle: true, items: true },
      });

      await tx.vehicle.update({ where: { id: vehicleId }, data: { currentKm: parsedEntryKm } });
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
      return res.status(400).json({ error: 'Status invÃ¡lido.' });
    }

    const current = await prisma.serviceOrder.findUnique({
      where: { id: req.params.id },
      include: { client: true, vehicle: true },
    });
    if (!current) return res.status(404).json({ error: 'OS nÃ£o encontrada.' });

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
    const parsedEntryKm = entryKm !== undefined && entryKm !== null && entryKm !== '' ? parseInt(entryKm, 10) : null;
    if (parsedEntryKm !== null && (!Number.isInteger(parsedEntryKm) || parsedEntryKm < 0)) {
      return res.status(400).json({ error: 'Quilometragem de entrada invalida.' });
    }
    const current = await prisma.serviceOrder.findUnique({ where: { id: req.params.id } });
    if (!current) return res.status(404).json({ error: 'OS nÃ£o encontrada.' });

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
          entryKm: parsedEntryKm !== null ? parsedEntryKm : undefined,
          notes,
          totalPrice: parseFloat(total),
        },
        include: { client: true, vehicle: true, items: true },
      });

      if (parsedEntryKm !== null) {
        await tx.vehicle.update({ where: { id: updated.vehicleId }, data: { currentKm: parsedEntryKm } });
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
    STARTED: `OlÃ¡, ${clientName}! A manutenÃ§Ã£o do seu ${brand} ${model} (${plate}) foi iniciada. OS #${number}. Acompanhe pelo portal: ${portalUrl}`,
    IN_PROGRESS: `OlÃ¡, ${clientName}! Seu ${brand} ${model} (${plate}) estÃ¡ em manutenÃ§Ã£o neste momento. OS #${number}. Status: ${statusLabel}.`,
    WAITING_PART: `OlÃ¡, ${clientName}! Seu ${brand} ${model} (${plate}) estÃ¡ aguardando peÃ§a para continuidade do serviÃ§o. OS #${number}.`,
    FINISHING: `OlÃ¡, ${clientName}! O serviÃ§o do seu ${brand} ${model} (${plate}) estÃ¡ em fase final. OS #${number}.`,
    DONE: `OlÃ¡, ${clientName}! O serviÃ§o do seu ${brand} ${model} (${plate}) foi concluÃ­do. OS #${number}. Em breve faremos a liberaÃ§Ã£o/entrega.`,
    DELIVERED: `OlÃ¡, ${clientName}! Seu ${brand} ${model} (${plate}) foi entregue. Obrigado pela preferÃªncia. Portal: ${portalUrl}`,
  };
  return msgs[status] || `AtualizaÃ§Ã£o da OS #${number}: status alterado para ${statusLabel}.`;
}

module.exports = { list, get, create, update, updateStatus };





