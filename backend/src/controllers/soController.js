const prisma = require('../lib/prisma');
const { sendWhatsAppMessage } = require('../services/whatsappService');
const { uploadToCloudinary, deleteFromCloudinary } = require('../services/uploadService');

const STATUS_LABELS = {
  QUOTE: 'Orcamento',
  APPROVED: 'Aprovado',
  STARTED: 'Iniciado',
  IN_PROGRESS: 'Em Execucao',
  WAITING_PART: 'Aguardando Peca',
  FINISHING: 'Finalizando',
  DONE: 'Finalizado',
  DELIVERED: 'Entregue',
};

const NOTIFY_ON_STATUS = ['STARTED', 'IN_PROGRESS', 'WAITING_PART', 'FINISHING', 'DONE', 'DELIVERED'];
const STATUS_CLOSE_FLOW = ['DONE', 'DELIVERED'];

const MAINTENANCE_RULES = [
  {
    type: 'oil',
    label: 'Troca de Oleo',
    intervalKm: 10000,
    intervalMonths: 6,
    match: (text) => text.includes('OLEO'),
  },
  {
    type: 'belt',
    label: 'Correia Dentada',
    intervalKm: 60000,
    intervalMonths: 48,
    match: (text) => text.includes('CORREIA') && text.includes('DENTADA'),
  },
];

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
}

function recalcNextMaintenance({ doneDate, doneKm, intervalMonths, intervalKm, currentNextDate, currentNextKm }) {
  let nextDate = currentNextDate || null;
  let nextKm = currentNextKm || null;

  if (doneDate && intervalMonths) {
    const d = new Date(doneDate);
    d.setMonth(d.getMonth() + parseInt(intervalMonths, 10));
    nextDate = d;
  }

  if (doneKm !== null && doneKm !== undefined && intervalKm) {
    nextKm = parseInt(doneKm, 10) + parseInt(intervalKm, 10);
  }

  return { nextDate, nextKm };
}

async function syncVehicleMaintenancesFromOrder(tx, order) {
  const shouldSync = STATUS_CLOSE_FLOW.includes(order.status) && !STATUS_CLOSE_FLOW.includes(order.previousStatus);
  if (!shouldSync) return;

  const doneDate = new Date();
  const doneKm = Number.isInteger(order.entryKm) ? order.entryKm : (Number.isInteger(order.vehicle?.currentKm) ? order.vehicle.currentKm : null);

  const joinedOrderText = normalizeText(
    (order.items || [])
      .map((item) => item.itemName)
      .filter(Boolean)
      .join(' ')
  );
  if (!joinedOrderText) return;

  for (const rule of MAINTENANCE_RULES) {
    if (!rule.match(joinedOrderText)) continue;

    const existing = await tx.preventiveMaintenance.findFirst({
      where: { vehicleId: order.vehicleId, type: rule.type },
    });

    if (!existing) {
      const { nextDate, nextKm } = recalcNextMaintenance({
        doneDate,
        doneKm,
        intervalMonths: rule.intervalMonths,
        intervalKm: rule.intervalKm,
      });

      await tx.preventiveMaintenance.create({
        data: {
          vehicleId: order.vehicleId,
          type: rule.type,
          label: rule.label,
          intervalKm: rule.intervalKm,
          intervalMonths: rule.intervalMonths,
          lastDate: doneDate,
          lastKm: doneKm,
          nextDate,
          nextKm,
        },
      });
      continue;
    }

    const { nextDate, nextKm } = recalcNextMaintenance({
      doneDate,
      doneKm,
      intervalMonths: existing.intervalMonths,
      intervalKm: existing.intervalKm,
      currentNextDate: existing.nextDate,
      currentNextKm: existing.nextKm,
    });

    await tx.preventiveMaintenance.update({
      where: { id: existing.id },
      data: {
        lastDate: doneDate,
        lastKm: doneKm,
        nextDate,
        nextKm,
      },
    });
  }
}

function extractCloudinaryPublicId(url) {
  if (!url || typeof url !== 'string') return null;
  const uploadMarker = '/upload/';
  const markerIndex = url.indexOf(uploadMarker);
  if (markerIndex === -1) return null;

  const pathAfterUpload = url.slice(markerIndex + uploadMarker.length);
  const parts = pathAfterUpload.split('/');
  if (parts[0] && /^v\d+$/.test(parts[0])) parts.shift();

  const joined = parts.join('/');
  const dotIndex = joined.lastIndexOf('.');
  return dotIndex > -1 ? joined.slice(0, dotIndex) : joined;
}

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
    return res.status(500).json({ error: 'Erro ao listar ordens de servico.' });
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
        photos: { orderBy: { createdAt: 'desc' } },
        statusLogs: {
          orderBy: { createdAt: 'asc' },
          include: { user: { select: { id: true, name: true } } },
        },
        messages: { orderBy: { createdAt: 'desc' }, take: 10 },
      },
    });
    if (!order) return res.status(404).json({ error: 'OS nao encontrada.' });
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
      return res.status(400).json({ error: 'Status invalido.' });
    }

    const current = await prisma.serviceOrder.findUnique({
      where: { id: req.params.id },
      include: { client: true, vehicle: true, items: true },
    });
    if (!current) return res.status(404).json({ error: 'OS nao encontrada.' });

    const order = await prisma.$transaction(async (tx) => {
      const updatedOrder = await tx.serviceOrder.update({
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
        include: { client: true, vehicle: true, items: true },
      });

      await syncVehicleMaintenancesFromOrder(tx, {
        ...updatedOrder,
        previousStatus: current.status,
      });

      return updatedOrder;
    });

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
    if (!current) return res.status(404).json({ error: 'OS nao encontrada.' });

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

const uploadPhotos = async (req, res) => {
  try {
    const order = await prisma.serviceOrder.findUnique({ where: { id: req.params.id }, select: { id: true } });
    if (!order) return res.status(404).json({ error: 'OS nao encontrada.' });
    if (!req.files || req.files.length === 0) return res.status(400).json({ error: 'Envie ao menos uma imagem.' });

    const allowed = ['GENERAL', 'PART', 'BEFORE', 'AFTER'];
    const category = allowed.includes(String(req.body.category || '').toUpperCase())
      ? String(req.body.category).toUpperCase()
      : 'GENERAL';

    const caption = req.body.caption ? String(req.body.caption).slice(0, 300) : null;

    const urls = await Promise.all(
      req.files.map((file) => uploadToCloudinary(file, 'jr-autoparts/service-orders'))
    );

    const created = await prisma.$transaction(async (tx) => {
      const rows = [];
      for (const url of urls) {
        const row = await tx.serviceOrderPhoto.create({
          data: {
            soId: req.params.id,
            url,
            category,
            caption,
          },
        });
        rows.push(row);
      }
      return rows;
    });

    return res.status(201).json(created);
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao enviar fotos da OS.' });
  }
};

const deletePhoto = async (req, res) => {
  try {
    const photo = await prisma.serviceOrderPhoto.findFirst({
      where: { id: req.params.photoId, soId: req.params.id },
    });
    if (!photo) return res.status(404).json({ error: 'Foto nao encontrada.' });

    const publicId = extractCloudinaryPublicId(photo.url);
    if (publicId) await deleteFromCloudinary(publicId).catch(() => {});

    await prisma.serviceOrderPhoto.delete({ where: { id: photo.id } });
    return res.json({ message: 'Foto removida com sucesso.' });
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao remover foto da OS.' });
  }
};

function buildWhatsAppMessage(clientName, plate, brand, model, status, number) {
  const statusLabel = STATUS_LABELS[status];
  const portalUrl = `${process.env.FRONTEND_URL}/portal`;
  const msgs = {
    STARTED: `Ola, ${clientName}! A manutencao do seu ${brand} ${model} (${plate}) foi iniciada. OS #${number}. Acompanhe pelo portal: ${portalUrl}`,
    IN_PROGRESS: `Ola, ${clientName}! Seu ${brand} ${model} (${plate}) esta em manutencao neste momento. OS #${number}. Status: ${statusLabel}.`,
    WAITING_PART: `Ola, ${clientName}! Seu ${brand} ${model} (${plate}) esta aguardando peca para continuidade do servico. OS #${number}.`,
    FINISHING: `Ola, ${clientName}! O servico do seu ${brand} ${model} (${plate}) esta em fase final. OS #${number}.`,
    DONE: `Ola, ${clientName}! O servico do seu ${brand} ${model} (${plate}) foi concluido. OS #${number}. Em breve faremos a liberacao/entrega.`,
    DELIVERED: `Ola, ${clientName}! Seu ${brand} ${model} (${plate}) foi entregue. Obrigado pela preferencia. Portal: ${portalUrl}`,
  };
  return msgs[status] || `Atualizacao da OS #${number}: status alterado para ${statusLabel}.`;
}

module.exports = { list, get, create, update, updateStatus, uploadPhotos, deletePhoto };



