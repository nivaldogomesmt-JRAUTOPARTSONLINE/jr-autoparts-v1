const prisma = require('../lib/prisma');
const { sendWhatsAppMessageWithDedupe } = require('../services/whatsappService');
const olxSync = require('../services/olxSyncService');
const whatsappTemplate = require('../services/whatsappTemplateService');
const botconversa = require('../services/botconversaService');
const { uploadToCloudinary, deleteFromCloudinary } = require('../services/uploadService');
const { computeMaintenanceForecast } = require('../utils/maintenance');
const { normalizeSearchToken, normalizedSqlExpr } = require('../utils/search');
const XLSX = require('xlsx');
const { appendIntegrationLog } = require('../services/integrationLogService');

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

const NOTIFY_ON_STATUS = ['QUOTE', 'APPROVED', 'STARTED', 'IN_PROGRESS', 'WAITING_PART', 'FINISHING', 'DONE', 'DELIVERED'];
const STATUS_CLOSE_FLOW = ['DONE', 'DELIVERED'];
const DELIVERY_META_PREFIX = '[DELIVERY_META]';
const DELIVERY_STATUS_LABELS = {
  AWAITING_DISPATCH: 'Aguardando envio',
  OUT_FOR_DELIVERY: 'Saiu para entrega',
  DELIVERED: 'Entregue',
  DELIVERY_FAILED: 'Tentativa sem sucesso',
};
const ORDER_PHASE_LABELS = {
  CONFIRMED: 'Pedido confirmado',
  PAYMENT_APPROVED: 'Pagamento aprovado',
  IN_SEPARATION: 'Em separacao',
  SHIPPED: 'Enviado',
  DELIVERED: 'Entregue',
  CANCELED: 'Cancelado',
};
const DELIVERY_HISTORY_LIMIT = 40;

const MAINTENANCE_RULES = [
  {
    type: 'oil',
    label: 'Troca de Oleo',
    intervalKm: 10000,
    intervalMonths: 6,
    match: (text) => (
      text.includes('OLEO')
      || text.includes('LUBRIFICANTE')
      || text.includes('LUBRIFICACAO')
    ),
  },
  {
    type: 'belt',
    label: 'Correia Dentada',
    intervalKm: 60000,
    intervalMonths: 48,
    match: (text) => (
      text.includes('CORREIA')
      && (
        text.includes('DENTADA')
        || text.includes('SINCRONIZADORA')
        || text.includes('DISTRIBUICAO')
      )
    ),
  },
];

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
}

function parseSearchTokens(search) {
  return String(search || '')
    .trim()
    .split(/\s+/)
    .map((v) => v.trim())
    .filter(Boolean)
    .slice(0, 6);
}

function buildSoSearchWhere(search) {
  const tokens = parseSearchTokens(search);
  if (!tokens.length) return {};

  return {
    AND: tokens.map((token) => ({
      OR: [
        ...(Number.isFinite(parseInt(token, 10)) ? [{ number: { equals: parseInt(token, 10) } }] : []),
        { client: { name: { contains: token, mode: 'insensitive' } } },
        { vehicle: { plate: { contains: String(token).toUpperCase(), mode: 'insensitive' } } },
        { vehicle: { model: { contains: token, mode: 'insensitive' } } },
        { vehicle: { brand: { contains: token, mode: 'insensitive' } } },
      ],
    })),
  };
}

async function findSoIdsByAccentSearch(search) {
  const tokens = parseSearchTokens(search)
    .map((token) => normalizeSearchToken(token))
    .filter(Boolean);

  if (!tokens.length) return null;

  const fields = [
    normalizedSqlExpr('CAST(so.number AS TEXT)'),
    normalizedSqlExpr('c.name'),
    normalizedSqlExpr('v.plate'),
    normalizedSqlExpr('v.model'),
    normalizedSqlExpr('v.brand'),
  ];

  const params = tokens.map((token) => `%${token}%`);
  const conditions = tokens
    .map((_, idx) => `(${fields.map((field) => `${field} LIKE $${idx + 1}`).join(' OR ')})`)
    .join(' AND ');

  const sql = `
    SELECT so.id
    FROM service_orders so
    LEFT JOIN clients c ON c.id = so.client_id
    LEFT JOIN vehicles v ON v.id = so.vehicle_id
    WHERE ${conditions}
    LIMIT 15000
  `;

  try {
    const rows = await prisma.$queryRawUnsafe(sql, ...params);
    return rows.map((row) => row.id);
  } catch {
    return null;
  }
}

function deriveDeliveryStatus(order, deliveryMeta) {
  if (deliveryMeta?.status) return deliveryMeta.status;
  if (order?.status === 'DELIVERED') return 'DELIVERED';
  return 'AWAITING_DISPATCH';
}

function deriveOrderPhase(order, deliveryMeta) {
  if (deliveryMeta?.orderPhase) return deliveryMeta.orderPhase;
  if (order?.status === 'CANCELED') return 'CANCELED';
  if (order?.status === 'DELIVERED') return 'DELIVERED';
  if (order?.status === 'DONE') return 'SHIPPED';
  if (['WAITING_PART', 'FINISHING', 'STARTED', 'IN_PROGRESS'].includes(order?.status)) return 'IN_SEPARATION';
  return 'CONFIRMED';
}

function parseDeliveryMetaFromNotes(notes) {
  const text = String(notes || '');
  const idx = text.lastIndexOf(DELIVERY_META_PREFIX);
  if (idx === -1) return null;
  const raw = text.slice(idx + DELIVERY_META_PREFIX.length).trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
function normalizeDeliveryMeta(meta) {
  if (!meta || typeof meta !== 'object') {
    return {
      status: null,
      statusLabel: null,
      orderPhase: null,
      orderPhaseLabel: null,
      locationUrl: null,
      note: null,
      updatedAt: null,
      updatedBy: null,
      history: [],
    };
  }

  const history = Array.isArray(meta.history)
    ? meta.history
      .filter((row) => row && typeof row === 'object')
      .map((row) => ({
        status: row.status || null,
        statusLabel: row.statusLabel || (row.status ? DELIVERY_STATUS_LABELS[row.status] : null),
        orderPhase: row.orderPhase || null,
        orderPhaseLabel: row.orderPhaseLabel || (row.orderPhase ? ORDER_PHASE_LABELS[row.orderPhase] : null),
        locationUrl: row.locationUrl ? String(row.locationUrl) : null,
        note: row.note ? String(row.note) : null,
        updatedAt: row.updatedAt || null,
        updatedBy: row.updatedBy || null,
      }))
      .filter((row) => row.status || row.orderPhase || row.updatedAt)
      .slice(0, DELIVERY_HISTORY_LIMIT)
    : [];

  return {
    status: meta.status || null,
    statusLabel: meta.statusLabel || (meta.status ? DELIVERY_STATUS_LABELS[meta.status] : null),
    orderPhase: meta.orderPhase || null,
    orderPhaseLabel: meta.orderPhaseLabel || (meta.orderPhase ? ORDER_PHASE_LABELS[meta.orderPhase] : null),
    locationUrl: meta.locationUrl ? String(meta.locationUrl) : null,
    note: meta.note ? String(meta.note) : null,
    updatedAt: meta.updatedAt || null,
    updatedBy: meta.updatedBy || null,
    history,
  };
}

function buildDeliveryMetaWithHistory(currentMeta, nextFields) {
  const base = normalizeDeliveryMeta(currentMeta);
  const entry = {
    status: nextFields.status || null,
    statusLabel: nextFields.statusLabel || (nextFields.status ? DELIVERY_STATUS_LABELS[nextFields.status] : null),
    orderPhase: nextFields.orderPhase || null,
    orderPhaseLabel: nextFields.orderPhaseLabel || (nextFields.orderPhase ? ORDER_PHASE_LABELS[nextFields.orderPhase] : null),
    locationUrl: nextFields.locationUrl ? String(nextFields.locationUrl) : null,
    note: nextFields.note ? String(nextFields.note) : null,
    updatedAt: nextFields.updatedAt || new Date().toISOString(),
    updatedBy: nextFields.updatedBy || 'Sistema',
  };

  const signature = [
    entry.status || '',
    entry.orderPhase || '',
    entry.locationUrl || '',
    entry.note || '',
  ].join('|');

  const nextHistory = [
    entry,
    ...base.history.filter((row) => [
      row.status || '',
      row.orderPhase || '',
      row.locationUrl || '',
      row.note || '',
    ].join('|') !== signature),
  ].slice(0, DELIVERY_HISTORY_LIMIT);

  return {
    status: entry.status,
    statusLabel: entry.statusLabel,
    orderPhase: entry.orderPhase,
    orderPhaseLabel: entry.orderPhaseLabel,
    locationUrl: entry.locationUrl,
    note: entry.note,
    updatedAt: entry.updatedAt,
    updatedBy: entry.updatedBy,
    history: nextHistory,
  };
}
function mergeDeliveryMetaIntoNotes(notes, deliveryMeta) {
  const text = String(notes || '');
  const idx = text.lastIndexOf(DELIVERY_META_PREFIX);
  const cleanNotes = idx === -1 ? text.trimEnd() : text.slice(0, idx).trimEnd();
  const payload = DELIVERY_META_PREFIX + JSON.stringify(deliveryMeta);
  return cleanNotes ? (cleanNotes + '\n' + payload) : payload;
}
function recalcNextMaintenance({ doneDate, doneKm, intervalMonths, intervalKm, currentNextDate, currentNextKm }) {
  return computeMaintenanceForecast(
    {
      lastDate: doneDate,
      lastKm: doneKm,
      intervalMonths,
      intervalKm,
      nextDate: currentNextDate,
      nextKm: currentNextKm,
    },
    { baselineDate: doneDate, baselineKm: doneKm }
  );
}

async function syncVehicleMaintenancesFromOrder(tx, order) {
  const shouldSync = STATUS_CLOSE_FLOW.includes(order.status) && !STATUS_CLOSE_FLOW.includes(order.previousStatus);
  if (!shouldSync) return;

  const doneDate = new Date();
  const doneKm = Number.isInteger(order.entryKm) ? order.entryKm : (Number.isInteger(order.vehicle?.currentKm) ? order.vehicle.currentKm : null);

  const joinedOrderText = normalizeText(
    (order.items || [])
      .map((item) => item.itemName || item.service?.name || item.product?.name)
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

async function safeLogIntegration(entry, actor = 'Sistema') {
  try {
    await appendIntegrationLog(entry, actor);
  } catch {
    // nao bloqueia o fluxo principal
  }
}

const list = async (req, res) => {
  try {
    const {
      status,
      clientId,
      vehicleId,
      search,
      sort = 'created',
      page = 1,
      limit = 20,
      dateFrom,
      dateTo,
      includeDeliveryDetails,
      deliveryStatus,
      orderPhase,
    } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(1000, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;
    const withDeliveryDetails = String(includeDeliveryDetails || '').toLowerCase() === 'true';

    let createdAt = undefined;
    if (dateFrom || dateTo) {
      const from = dateFrom ? new Date(`${dateFrom}T00:00:00`) : null;
      const to = dateTo ? new Date(`${dateTo}T23:59:59.999`) : null;
      createdAt = {
        ...(from && !Number.isNaN(from.getTime()) ? { gte: from } : {}),
        ...(to && !Number.isNaN(to.getTime()) ? { lte: to } : {}),
      };
    }

    const accentIds = await findSoIdsByAccentSearch(search);
    if (Array.isArray(accentIds) && !accentIds.length) {
      return res.json({ data: [], total: 0, page: pageNum, pages: 0 });
    }

    const where = {
      ...(status && { status }),
      ...(clientId && { clientId }),
      ...(vehicleId && { vehicleId }),
      ...(createdAt && Object.keys(createdAt).length ? { createdAt } : {}),
      ...(Array.isArray(accentIds) ? { id: { in: accentIds } } : buildSoSearchWhere(search)),
    };

    const orderBy = sort === 'updated' ? { updatedAt: 'desc' } : { createdAt: 'desc' };
    const include = {
      client: { select: { id: true, name: true, phone: true, whatsapp: true, address: true, city: true } },
      vehicle: { select: { id: true, plate: true, brand: true, model: true } },
      _count: { select: { items: true } },
      ...(withDeliveryDetails
        ? { items: { select: { id: true, type: true, itemName: true, quantity: true, unitPrice: true } } }
        : {}),
    };

    const hasDeliveryFilters = Boolean(deliveryStatus || orderPhase);

    if (!hasDeliveryFilters) {
      const [orders, total] = await Promise.all([
        prisma.serviceOrder.findMany({
          where,
          include,
          orderBy,
          skip,
          take: limitNum,
        }),
        prisma.serviceOrder.count({ where }),
      ]);

      return res.json({
        data: orders.map((o) => {
          const deliveryMeta = normalizeDeliveryMeta(parseDeliveryMetaFromNotes(o.notes));
          return {
            ...o,
            total: o.totalPrice,
            deliveryMeta,
            deliveryHistory: deliveryMeta.history,
          };
        }),
        total,
        page: pageNum,
        pages: Math.ceil(total / limitNum),
      });
    }

    // Em plano free mantemos o filtro de entrega/fase no servidor sem SQL complexo:
    // carregamos a base principal e refinamos em memoria para manter total/paginacao corretos.
    const baseOrders = await prisma.serviceOrder.findMany({
      where,
      include,
      orderBy,
      take: 5000,
    });

    const refined = baseOrders
      .map((o) => {
        const parsedMeta = normalizeDeliveryMeta(parseDeliveryMetaFromNotes(o.notes));
        return {
          ...o,
          total: o.totalPrice,
          deliveryMeta: parsedMeta,
          deliveryHistory: parsedMeta.history,
        };
      })
      .filter((o) => {
        const currentDeliveryStatus = deriveDeliveryStatus(o, o.deliveryMeta);
        const currentOrderPhase = deriveOrderPhase(o, o.deliveryMeta);
        if (deliveryStatus && currentDeliveryStatus !== deliveryStatus) return false;
        if (orderPhase && currentOrderPhase !== orderPhase) return false;
        return true;
      });

    const total = refined.length;
    const data = refined.slice(skip, skip + limitNum);

    return res.json({
      data,
      total,
      page: pageNum,
      pages: Math.ceil(total / limitNum),
    });
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao listar ordens de servico.' });
  }
};

const exportOrders = async (req, res) => {
  try {
    const {
      status,
      clientId,
      vehicleId,
      search,
      dateFrom,
      dateTo,
      deliveryStatus,
      orderPhase,
    } = req.query;

    let createdAt = undefined;
    if (dateFrom || dateTo) {
      const from = dateFrom ? new Date(`${dateFrom}T00:00:00`) : null;
      const to = dateTo ? new Date(`${dateTo}T23:59:59.999`) : null;
      createdAt = {
        ...(from && !Number.isNaN(from.getTime()) ? { gte: from } : {}),
        ...(to && !Number.isNaN(to.getTime()) ? { lte: to } : {}),
      };
    }

    const accentIds = await findSoIdsByAccentSearch(search);
    if (Array.isArray(accentIds) && !accentIds.length) {
      const workbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.json_to_sheet([], {
        header: ['number', 'status', 'statusLabel', 'openedAt', 'client', 'plate', 'vehicle', 'entryKm', 'itemsCount', 'total', 'orderPhase', 'deliveryStatus', 'deliveryUpdatedAt'],
      });
      XLSX.utils.book_append_sheet(workbook, worksheet, 'OrdensServico');
      const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
      const now = new Date().toISOString().slice(0, 10);
      const filename = `os_export_${now}.xlsx`;

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.send(buffer);
    }

    const where = {
      ...(status && { status }),
      ...(clientId && { clientId }),
      ...(vehicleId && { vehicleId }),
      ...(createdAt && Object.keys(createdAt).length ? { createdAt } : {}),
      ...(Array.isArray(accentIds) ? { id: { in: accentIds } } : buildSoSearchWhere(search)),
    };

    const orders = await prisma.serviceOrder.findMany({
      where,
      include: {
        client: { select: { name: true } },
        vehicle: { select: { plate: true, brand: true, model: true } },
        _count: { select: { items: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 20000,
    });

    const rowsAll = orders.map((o) => {
      const deliveryMeta = normalizeDeliveryMeta(parseDeliveryMetaFromNotes(o.notes));
      return {
        number: o.number,
        status: o.status,
        statusLabel: STATUS_LABELS[o.status] || o.status,
        openedAt: o.createdAt ? new Date(o.createdAt).toISOString() : '',
        client: o.client?.name || '',
        plate: o.vehicle?.plate || '',
        vehicle: [o.vehicle?.brand, o.vehicle?.model].filter(Boolean).join(' '),
        entryKm: Number(o.entryKm || 0),
        itemsCount: Number(o._count?.items || 0),
        total: Number(o.totalPrice || 0),
        orderPhaseCode: deliveryMeta.orderPhase || '',
        orderPhase: deliveryMeta.orderPhaseLabel || '-',
        deliveryStatusCode: deliveryMeta.status || '',
        deliveryStatus: deliveryMeta.statusLabel || '-',
        deliveryUpdatedAt: deliveryMeta.updatedAt || '',
      };
    });

    const rows = rowsAll
      .filter((row) => (!deliveryStatus || row.deliveryStatusCode === deliveryStatus))
      .filter((row) => (!orderPhase || row.orderPhaseCode === orderPhase))
      .map(({ orderPhaseCode, deliveryStatusCode, ...row }) => row);

    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(rows, {
      header: ['number', 'status', 'statusLabel', 'openedAt', 'client', 'plate', 'vehicle', 'entryKm', 'itemsCount', 'total', 'orderPhase', 'deliveryStatus', 'deliveryUpdatedAt'],
    });
    XLSX.utils.book_append_sheet(workbook, worksheet, 'OrdensServico');

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    const now = new Date().toISOString().slice(0, 10);
    const filename = `os_export_${now}.xlsx`;

    await safeLogIntegration({
      area: 'Exportacao OS',
      user: req.user?.name || 'Operacao Manual',
      quantity: rows.length,
      failures: 0,
      reason: '-',
      meta: {
        search: search || '',
        status: status || '',
        clientId: clientId || '',
        vehicleId: vehicleId || '',
        dateFrom: dateFrom || '',
        dateTo: dateTo || '',
        deliveryStatus: deliveryStatus || '',
        orderPhase: orderPhase || '',
        filename,
      },
    }, req.user?.name || req.user?.email || 'Sistema');

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(buffer);
  } catch (err) {
    await safeLogIntegration({
      area: 'Exportacao OS',
      user: req.user?.name || 'Operacao Manual',
      quantity: 0,
      failures: 1,
      reason: err?.message || 'Falha ao exportar OS.',
    }, req.user?.name || req.user?.email || 'Sistema');
    return res.status(500).json({ error: 'Erro ao exportar ordens de servico.' });
  }
};
const overview = async (req, res) => {
  try {
    const { dateFrom, dateTo } = req.query;

    let createdAt = undefined;
    if (dateFrom || dateTo) {
      const from = dateFrom ? new Date(`${dateFrom}T00:00:00`) : null;
      const to = dateTo ? new Date(`${dateTo}T23:59:59.999`) : null;
      createdAt = {
        ...(from && !Number.isNaN(from.getTime()) ? { gte: from } : {}),
        ...(to && !Number.isNaN(to.getTime()) ? { lte: to } : {}),
      };
    }

    const baseWhere = {
      ...(createdAt && Object.keys(createdAt).length ? { createdAt } : {}),
    };

    const [
      allOrders,
      statusCounts,
      overdueCount,
      inProgress,
      topRevenue,
      waitingPart,
      ready,
      stalled,
    ] = await Promise.all([
      prisma.serviceOrder.findMany({
        where: baseWhere,
        select: {
          id: true,
          number: true,
          status: true,
          totalPrice: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.serviceOrder.groupBy({
        by: ['status'],
        where: baseWhere,
        _count: { _all: true },
      }),
      prisma.serviceOrder.count({
        where: {
          ...baseWhere,
          status: { notIn: ['DONE', 'DELIVERED'] },
          createdAt: { lt: new Date(Date.now() - (3 * 24 * 60 * 60 * 1000)) },
        },
      }),
      prisma.serviceOrder.findMany({
        where: {
          ...baseWhere,
          status: { in: ['STARTED', 'IN_PROGRESS', 'FINISHING'] },
        },
        include: {
          client: { select: { id: true, name: true } },
          vehicle: { select: { id: true, plate: true, brand: true, model: true } },
        },
        orderBy: { updatedAt: 'desc' },
        take: 8,
      }),
      prisma.serviceOrder.findMany({
        where: {
          ...baseWhere,
          status: { in: ['DONE', 'DELIVERED'] },
        },
        include: {
          client: { select: { id: true, name: true } },
          vehicle: { select: { id: true, plate: true, brand: true, model: true } },
        },
        orderBy: { totalPrice: 'desc' },
        take: 8,
      }),
      prisma.serviceOrder.findMany({
        where: { ...baseWhere, status: 'WAITING_PART' },
        include: {
          client: { select: { id: true, name: true } },
          vehicle: { select: { id: true, plate: true, brand: true, model: true } },
        },
        orderBy: { updatedAt: 'asc' },
        take: 8,
      }),
      prisma.serviceOrder.findMany({
        where: { ...baseWhere, status: 'DONE' },
        include: {
          client: { select: { id: true, name: true } },
          vehicle: { select: { id: true, plate: true, brand: true, model: true } },
        },
        orderBy: { updatedAt: 'desc' },
        take: 8,
      }),
      prisma.serviceOrder.findMany({
        where: {
          ...baseWhere,
          status: { notIn: ['DONE', 'DELIVERED'] },
          updatedAt: { lt: new Date(Date.now() - (4 * 24 * 60 * 60 * 1000)) },
        },
        include: {
          client: { select: { id: true, name: true } },
          vehicle: { select: { id: true, plate: true, brand: true, model: true } },
        },
        orderBy: { updatedAt: 'asc' },
        take: 8,
      }),
    ]);

    const totals = {
      totalOrders: allOrders.length,
      revenue: Number(allOrders.reduce((sum, os) => sum + Number(os.totalPrice || 0), 0).toFixed(2)),
      avgTicket: allOrders.length ? Number((allOrders.reduce((sum, os) => sum + Number(os.totalPrice || 0), 0) / allOrders.length).toFixed(2)) : 0,
      overdueCount,
    };

    const byStatus = statusCounts.reduce((acc, row) => {
      acc[row.status] = row._count?._all || 0;
      return acc;
    }, {});

    return res.json({
      totals,
      byStatus,
      rankings: {
        inProgress,
        topRevenue,
        waitingPart,
        ready,
        stalled,
      },
    });
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao montar visao gerencial de OS.' });
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
    const deliveryMeta = normalizeDeliveryMeta(parseDeliveryMetaFromNotes(order.notes));
    return res.json({ ...order, total: order.totalPrice, deliveryMeta, deliveryHistory: deliveryMeta.history });
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
        include: {
        client: true,
        vehicle: true,
        items: {
          include: {
            service: { select: { name: true } },
            product: { select: { name: true } },
          },
        },
      },
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
      include: {
        client: true,
        vehicle: true,
        items: {
          include: {
            service: { select: { name: true } },
            product: { select: { name: true } },
          },
        },
      },
    });
    if (!current) return res.status(404).json({ error: 'OS nao encontrada.' });

    // Evita gerar logs/mensagens duplicadas quando o status ja e o mesmo.
    if (current.status === status) {
      if (notes !== undefined && String(notes || '') !== String(current.notes || '')) {
        const updatedOnlyNotes = await prisma.serviceOrder.update({
          where: { id: req.params.id },
          data: { notes },
          include: {
            client: true,
            vehicle: true,
            items: {
              include: {
                service: { select: { name: true } },
                product: { select: { name: true } },
              },
            },
          },
        });

        return res.json({
          ...updatedOnlyNotes,
          skipped: true,
          message: 'Status ja estava aplicado; apenas as observacoes foram atualizadas.',
        });
      }

      return res.json({
        ...current,
        skipped: true,
        message: 'Status ja estava aplicado. Nenhuma nova notificacao foi enviada.',
      });
    }

    const currentDeliveryMeta = normalizeDeliveryMeta(parseDeliveryMetaFromNotes(current.notes));
    const deliveryAutoMeta = status === 'DELIVERED'
      ? buildDeliveryMetaWithHistory(currentDeliveryMeta, {
        status: 'DELIVERED',
        statusLabel: DELIVERY_STATUS_LABELS.DELIVERED,
        orderPhase: 'DELIVERED',
        orderPhaseLabel: ORDER_PHASE_LABELS.DELIVERED,
        locationUrl: null,
        note: 'Entrega confirmada no fechamento da OS.',
        updatedAt: new Date().toISOString(),
        updatedBy: req.user?.name || 'Sistema',
      })
      : null;

    const nextNotes = deliveryAutoMeta
      ? mergeDeliveryMetaIntoNotes(notes !== undefined ? notes : current.notes, deliveryAutoMeta)
      : (notes !== undefined ? notes : undefined);

    const order = await prisma.$transaction(async (tx) => {
      const updatedOrder = await tx.serviceOrder.update({
        where: { id: req.params.id },
        data: {
          status,
          ...(nextNotes !== undefined && { notes: nextNotes }),
          statusLogs: {
            create: {
              oldStatus: current.status,
              newStatus: status,
              userId: req.user.id,
            },
          },
        },
        include: {
          client: true,
          vehicle: true,
          items: {
            include: {
              service: { select: { name: true } },
              product: { select: { name: true } },
            },
          },
        },
      });

      await syncVehicleMaintenancesFromOrder(tx, {
        ...updatedOrder,
        previousStatus: current.status,
      });

      return updatedOrder;
    });

    // Sincroniza com OLX quando OS fecha (DELIVERED/DONE)
    olxSync.onOsStatusChanged(current, status).then(r => {
      if (r.sold && r.sold.length) console.log('[olxSync] OS', current.id, 'fechou:', r.sold.length, 'anuncios OLX marcados SOLD');
    }).catch(e => console.log('[olxSync] erro:', e.message));
    
    if (NOTIFY_ON_STATUS.includes(status)) {
      const phone = current.client.whatsapp || current.client.phone;
      if (phone) {
        const msg = await buildWhatsAppMessage(current.client.name, current.vehicle.plate, current.vehicle.brand, current.vehicle.model, status, current.number, current.totalPrice);
        await sendWhatsAppMessageWithDedupe({
          clientId: current.clientId,
          soId: current.id,
          phone,
          content: msg,
          dedupeHours: 48,
          eventKey: `OS_STATUS_${status}`,
          templateVariables: {
            clientName: current.client.name,
            plate: current.vehicle.plate,
            brand: current.vehicle.brand,
            model: current.vehicle.model,
            status,
            statusLabel: STATUS_LABELS[status] || status,
            soNumber: current.number,
            portalUrl: `${process.env.FRONTEND_URL}/portal`,
          },
        }).catch((error) => {
          console.error('WhatsApp error:', error.message);
        });
      }
    }

    // BotConversa: notificacao de status (fire-and-forget, nao bloqueia resposta)
    botconversa.notifyOSStatusChange({
      client: current.client,
      vehicle: current.vehicle,
      status,
      soNumber: current.number,
      portalUrl: `${process.env.FRONTEND_URL || ''}/portal`,
    }).catch((err) => console.error('[BotConversa] notifyOSStatusChange error:', err.message));

    // BotConversa: pos-servico ao entregar
    if (status === 'DELIVERED') {
      botconversa.startPostServiceSequence({
        client: current.client,
        vehicle: current.vehicle,
      }).catch((err) => console.error('[BotConversa] startPostServiceSequence error:', err.message));
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
        include: {
          client: true,
          vehicle: true,
          items: {
            include: {
              service: { select: { name: true } },
              product: { select: { name: true } },
            },
          },
        },
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

async function buildWhatsAppMessage(clientName, plate, brand, model, status, number, totalPrice) {
  // Tenta carregar do DB primeiro (editavel)
  const firstName = String(clientName || '').trim().split(/\s+/)[0] || 'cliente';
  const veiculo = [brand, model].filter(Boolean).join(' ').trim() || 'veiculo';
  const placa = plate ? ` (${plate})` : '';
  const valorFmt = totalPrice ? `R$ ${Number(totalPrice).toFixed(2).replace('.', ',')}` : null;
  const valorBlock = valorFmt ? `no valor de *${valorFmt}*` : '';
  const portalUrl = `${process.env.FRONTEND_URL || ''}/portal`;
  const fromDb = await whatsappTemplate.buildMessage(`OS_${status}`, {
    firstName, veiculo, placa, valorBlock, valorFmt: valorFmt || '', portalUrl,
    number, status, statusLabel: STATUS_LABELS[status] || status,
  }).catch(() => null);
  if (fromDb) return fromDb;
  // Fallback hardcoded (caso DB indisponivel)
  return _buildWhatsAppMessageFallback(clientName, plate, brand, model, status, number, totalPrice);
}

function _buildWhatsAppMessageFallback(clientName, plate, brand, model, status, number, totalPrice) {
  const statusLabel = STATUS_LABELS[status];
  const portalUrl = `${process.env.FRONTEND_URL}/portal`;
  // Pega so primeiro nome pra ficar mais pessoal
  const firstName = String(clientName || '').trim().split(/\s+/)[0] || 'cliente';
  const veic = [brand, model].filter(Boolean).join(' ').trim() || 'veiculo';
  const placa = plate ? ` (${plate})` : '';
  const valorFmt = totalPrice ? `R$ ${Number(totalPrice).toFixed(2).replace('.', ',')}` : null;

  const msgs = {
    QUOTE: `Oi ${firstName}! 👋 Aqui é da JR Auto Parts. Seu orçamento da OS *#${number}* (${veic}${placa})${valorFmt ? ` no valor de *${valorFmt}*` : ''} está pronto. Pode dar uma olhada e me confirmar se aprova? 🙌\n\nPortal: ${portalUrl}`,
    APPROVED: `Show, ${firstName}! ✅ Orçamento aprovado, vamos iniciar o serviço do seu ${veic}${placa}. OS *#${number}*. Te aviso aqui quando for evoluindo. 🛠️`,
    STARTED: `Oi ${firstName}! 🚗 A manutenção do seu ${veic}${placa} foi *iniciada* agora. OS #${number}. Acompanhe: ${portalUrl}`,
    IN_PROGRESS: `${firstName}, seu ${veic}${placa} está em *execução* neste momento. OS #${number}.`,
    WAITING_PART: `Oi ${firstName}, seu ${veic}${placa} está aguardando uma *peça* para continuar. OS #${number}. Te aviso assim que chegar! 📦`,
    FINISHING: `${firstName}, o serviço do seu ${veic}${placa} está em *fase final*. OS #${number}. Já já te aviso pra retirada! ⏳`,
    DONE: `🎉 ${firstName}, o serviço do seu ${veic}${placa} foi *concluído*! OS #${number}. Pode vir buscar quando puder. 🚙`,
    DELIVERED: `✅ ${firstName}, seu ${veic}${placa} foi *entregue*. Muito obrigado pela preferência! 🤝\n\nPortal: ${portalUrl}`,
  };
  return msgs[status] || `Atualização da OS #${number}: status alterado para ${statusLabel}.`;
}


const sendDeliveryUpdate = async (req, res) => {
  try {
    const { deliveryStatus, orderPhase, locationUrl, note } = req.body;

    if (!deliveryStatus && !orderPhase) {
      return res.status(400).json({ error: 'Informe ao menos status da entrega ou status do pedido.' });
    }

    if (deliveryStatus && !DELIVERY_STATUS_LABELS[deliveryStatus]) {
      return res.status(400).json({ error: 'Status de entrega invalido.' });
    }

    if (orderPhase && !ORDER_PHASE_LABELS[orderPhase]) {
      return res.status(400).json({ error: 'Status de pedido invalido.' });
    }

    if (locationUrl && !/^https?:\/\//i.test(String(locationUrl))) {
      return res.status(400).json({ error: 'URL de localizacao invalida. Use http(s)://...' });
    }

    const order = await prisma.serviceOrder.findUnique({
      where: { id: req.params.id },
      include: { client: true, vehicle: true },
    });

    if (!order) return res.status(404).json({ error: 'OS nao encontrada.' });

    const currentMeta = normalizeDeliveryMeta(parseDeliveryMetaFromNotes(order.notes));
    const nextDeliveryStatus = deliveryStatus || currentMeta.status || 'AWAITING_DISPATCH';

    let nextOrderPhase = orderPhase || currentMeta.orderPhase || null;
    if (!nextOrderPhase) {
      if (order.status === 'DELIVERED') nextOrderPhase = 'DELIVERED';
      else if (order.status === 'DONE') nextOrderPhase = 'SHIPPED';
      else if (order.status === 'WAITING_PART' || order.status === 'FINISHING') nextOrderPhase = 'IN_SEPARATION';
      else if (order.status === 'CANCELED') nextOrderPhase = 'CANCELED';
      else nextOrderPhase = 'CONFIRMED';
    }

    const nextLocation = locationUrl ? String(locationUrl).trim() : null;
    const nextNote = note ? String(note).trim() : null;

    if (
      currentMeta.status === nextDeliveryStatus
      && currentMeta.orderPhase === nextOrderPhase
      && String(currentMeta.locationUrl || '') === String(nextLocation || '')
      && String(currentMeta.note || '') === String(nextNote || '')
    ) {
      return res.json({
        message: 'Atualizacao de entrega/pedido ja estava aplicada. Nenhum novo envio foi realizado.',
        deliveryMeta: currentMeta,
        history: currentMeta.history || [],
        skipped: true,
      });
    }

    const deliveryMeta = buildDeliveryMetaWithHistory(currentMeta, {
      status: nextDeliveryStatus,
      statusLabel: DELIVERY_STATUS_LABELS[nextDeliveryStatus],
      orderPhase: nextOrderPhase,
      orderPhaseLabel: ORDER_PHASE_LABELS[nextOrderPhase],
      locationUrl: nextLocation,
      note: nextNote,
      updatedAt: new Date().toISOString(),
      updatedBy: req.user?.name || 'Sistema',
    });

    const nextNotes = mergeDeliveryMetaIntoNotes(order.notes, deliveryMeta);

    await prisma.serviceOrder.update({
      where: { id: order.id },
      data: { notes: nextNotes },
    });

    const phone = order.client.whatsapp || order.client.phone;
    if (phone) {
      const locationText = deliveryMeta.locationUrl ? ('\nLocalizacao da entrega: ' + deliveryMeta.locationUrl) : '';
      const noteText = deliveryMeta.note ? ('\nObs: ' + deliveryMeta.note) : '';

      if (currentMeta.orderPhase !== deliveryMeta.orderPhase) {
        const orderPhaseMsg = 'Ola, ' + order.client.name + '! Atualizacao do pedido da OS #' + order.number + ' (' + order.vehicle.plate + '): ' + deliveryMeta.orderPhaseLabel + '.' + noteText;

        await sendWhatsAppMessageWithDedupe({
          clientId: order.clientId,
          soId: order.id,
          phone,
          content: orderPhaseMsg,
          dedupeHours: 24,
          eventKey: `ORDER_PHASE_${deliveryMeta.orderPhase}`,
          templateVariables: {
            clientName: order.client.name,
            soNumber: order.number,
            plate: order.vehicle.plate,
            orderPhase: deliveryMeta.orderPhase,
            orderPhaseLabel: deliveryMeta.orderPhaseLabel,
            note: deliveryMeta.note || '',
            noteLine: deliveryMeta.note ? `\nObs: ${deliveryMeta.note}` : '',
          },
        }).catch((error) => {
          console.error('WhatsApp order phase error:', error.message);
        });
      }

      if (currentMeta.status !== deliveryMeta.status || currentMeta.locationUrl !== deliveryMeta.locationUrl || currentMeta.note !== deliveryMeta.note) {
        const msg = 'Ola, ' + order.client.name + '! Atualizacao de entrega da OS #' + order.number + ' (' + order.vehicle.plate + '): ' + deliveryMeta.statusLabel + '.' + locationText + noteText;

        await sendWhatsAppMessageWithDedupe({
          clientId: order.clientId,
          soId: order.id,
          phone,
          content: msg,
          dedupeHours: 24,
          eventKey: `DELIVERY_STATUS_${deliveryMeta.status}`,
          templateVariables: {
            clientName: order.client.name,
            soNumber: order.number,
            plate: order.vehicle.plate,
            deliveryStatus: deliveryMeta.status,
            deliveryStatusLabel: deliveryMeta.statusLabel,
            orderPhase: deliveryMeta.orderPhase,
            orderPhaseLabel: deliveryMeta.orderPhaseLabel,
            locationUrl: deliveryMeta.locationUrl || '',
            note: deliveryMeta.note || '',
            locationLine: deliveryMeta.locationUrl ? `\nLocalizacao da entrega: ${deliveryMeta.locationUrl}` : '',
            noteLine: deliveryMeta.note ? `\nObs: ${deliveryMeta.note}` : '',
          },
        }).catch((error) => {
          console.error('WhatsApp delivery error:', error.message);
        });
      }
    }

    return res.json({
      message: 'Atualizacao de entrega/pedido registrada com sucesso.',
      deliveryMeta,
      history: deliveryMeta.history || [],
    });
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao atualizar entrega.' });
  }
};

const remove = async (req, res) => {
  try {
    const order = await prisma.serviceOrder.findUnique({
      where: { id: req.params.id },
      select: { id: true, number: true },
    });

    if (!order) return res.status(404).json({ error: 'OS nao encontrada.' });

    await prisma.$transaction(async (tx) => {
      await tx.soStatusLog.deleteMany({ where: { soId: order.id } });
      await tx.whatsappMessage.deleteMany({ where: { soId: order.id } });
      await tx.soItem.deleteMany({ where: { soId: order.id } });
      await tx.serviceOrderPhoto.deleteMany({ where: { soId: order.id } });
      await tx.serviceOrder.delete({ where: { id: order.id } });
    });

    return res.json({ message: 'OS #' + order.number + ' excluida com sucesso.' });
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao excluir OS.' });
  }
};

module.exports = { list, exportOrders, overview, get, create, update, updateStatus, sendDeliveryUpdate, remove, uploadPhotos, deletePhoto };

