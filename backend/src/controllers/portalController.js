const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');
const { sendWhatsAppMessageWithDedupe } = require('../services/whatsappService');
const {
  computeMaintenanceForecast,
  getMaintenanceAlertLevel,
  toIntOrNull,
} = require('../utils/maintenance');

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

const parseDeliveryMetaFromNotes = (notes) => {
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
};

const normalizeDeliveryMeta = (meta) => {
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
    };
  }

  return {
    status: meta.status || null,
    statusLabel: meta.statusLabel || (meta.status ? DELIVERY_STATUS_LABELS[meta.status] : null),
    orderPhase: meta.orderPhase || null,
    orderPhaseLabel: meta.orderPhaseLabel || (meta.orderPhase ? ORDER_PHASE_LABELS[meta.orderPhase] : null),
    locationUrl: meta.locationUrl ? String(meta.locationUrl) : null,
    note: meta.note ? String(meta.note) : null,
    updatedAt: meta.updatedAt || null,
    updatedBy: meta.updatedBy || null,
  };
};

const getInvoiceBand = (daysOverdue) => {
  if (daysOverdue <= 0) return 'ON_TIME';
  if (daysOverdue <= 30) return 'LIGHT';
  if (daysOverdue <= 60) return 'INTENSIVE';
  if (daysOverdue <= 90) return 'CRITICAL';
  return 'RECOVERY';
};

const normalizeTrackingInvoice = (invoice) => {
  const now = new Date();
  const due = new Date(invoice.dueDate);
  const diff = now.getTime() - due.getTime();
  const daysOverdue = diff > 0 ? Math.floor(diff / (1000 * 60 * 60 * 24)) : 0;
  return {
    ...invoice,
    effectiveStatus: invoice.paidAt ? 'PAID' : daysOverdue > 0 ? 'OVERDUE' : invoice.status,
    daysOverdue,
    delinquencyBand: getInvoiceBand(daysOverdue),
  };
};

const getAlertLevel = (maintenance, currentKm, options = {}) => {
  const level = getMaintenanceAlertLevel(maintenance, currentKm, options);
  return level === 'OK' ? null : level;
};

const getMaintenancePriority = (maintenance, currentKm, options = {}) => {
  const alertLevel = getAlertLevel(maintenance, currentKm, options);
  if (alertLevel === 'OVERDUE') return 0;
  if (alertLevel === 'DUE_SOON') return 1;
  return 2;
};

const toStatusLabel = (alertLevel) => {
  if (alertLevel === 'OVERDUE') return 'Urgencia';
  if (alertLevel === 'DUE_SOON') return 'Atencao';
  return 'OK';
};

const buildDueMeta = (maintenance, currentKm) => {
  const now = new Date();
  const dayMs = 1000 * 60 * 60 * 24;

  const daysUntil = maintenance.nextDate
    ? Math.floor((new Date(maintenance.nextDate).getTime() - now.getTime()) / dayMs)
    : null;

  const currentKmNumber = toIntOrNull(currentKm);
  const nextKmNumber = toIntOrNull(maintenance.nextKm);
  const remainingKm = nextKmNumber !== null && currentKmNumber !== null
    ? nextKmNumber - currentKmNumber
    : null;

  let dueBy = 'NONE';
  if (daysUntil !== null && remainingKm !== null) {
    if (daysUntil <= 0 && remainingKm <= 0) dueBy = 'DATE_OR_KM';
    else if (daysUntil <= 0) dueBy = 'DATE';
    else if (remainingKm <= 0) dueBy = 'KM';
    else {
      const dateScore = daysUntil / 30;
      const kmScore = remainingKm / 1000;
      dueBy = dateScore <= kmScore ? 'DATE' : 'KM';
    }
  } else if (daysUntil !== null) {
    dueBy = 'DATE';
  } else if (remainingKm !== null) {
    dueBy = 'KM';
  }

  return { dueBy, daysUntil, remainingKm };
};

const getMaintenanceSortWeight = (maintenance, currentKm) => {
  const priority = getMaintenancePriority(maintenance, currentKm);
  const nextDate = maintenance.nextDate ? new Date(maintenance.nextDate).getTime() : Number.MAX_SAFE_INTEGER;
  const nextKm = maintenance.nextKm || Number.MAX_SAFE_INTEGER;
  return [priority, nextDate, nextKm];
};

const normalizeText = (value) => (
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
);

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const buildItemsWithTotals = (items) => {
  const rows = Array.isArray(items) ? items : [];

  const enriched = rows.map((item) => {
    const quantity = toNumber(item.quantity);
    const unitPrice = toNumber(item.unitPrice);
    const lineTotal = quantity * unitPrice;

    return {
      ...item,
      quantityNumber: quantity,
      unitPriceNumber: unitPrice,
      lineTotal,
    };
  });

  const calculatedTotal = enriched.reduce((sum, item) => sum + toNumber(item.lineTotal), 0);
  return { enriched, calculatedTotal };
};

const getClosedAtFromStatus = (order) => {
  const logs = Array.isArray(order?.statusLogs) ? order.statusLogs : [];
  const closedLog = [...logs]
    .reverse()
    .find((log) => ['DONE', 'DELIVERED'].includes(log?.newStatus));

  if (closedLog?.createdAt) return new Date(closedLog.createdAt);
  if (order?.updatedAt) return new Date(order.updatedAt);
  if (order?.createdAt) return new Date(order.createdAt);
  return new Date();
};

const getMaintenanceResponse = ({ maintenance, type, label, currentKm, source, performedInThisOrder }) => {
  if (!maintenance) {
    return {
      type,
      label,
      source: source || 'NOT_AVAILABLE',
      performedInThisOrder: !!performedInThisOrder,
      alertLevel: null,
      statusLabel: source === 'PENDING_EXECUTION' ? 'Aguardando conclusao' : 'Nao configurado',
      dueBy: 'NONE',
      daysUntil: null,
      remainingKm: null,
      nextDate: null,
      nextKm: null,
    };
  }

  const alertLevel = getAlertLevel(maintenance, currentKm);
  const dueMeta = buildDueMeta(maintenance, currentKm);

  return {
    ...maintenance,
    source,
    performedInThisOrder: !!performedInThisOrder,
    alertLevel,
    statusLabel: toStatusLabel(alertLevel),
    ...dueMeta,
  };
};

const buildProjectedMaintenance = ({ existing, rule, doneDate, doneKm }) => {
  const intervalKm = toIntOrNull(existing?.intervalKm) ?? rule.intervalKm;
  const intervalMonths = toIntOrNull(existing?.intervalMonths) ?? rule.intervalMonths;

  const projected = computeMaintenanceForecast(
    {
      type: rule.type,
      label: existing?.label || rule.label,
      intervalKm,
      intervalMonths,
      lastDate: doneDate,
      lastKm: doneKm,
      nextDate: null,
      nextKm: null,
    },
    { baselineDate: doneDate, baselineKm: doneKm }
  );

  return {
    type: rule.type,
    label: existing?.label || rule.label,
    intervalKm,
    intervalMonths,
    lastDate: doneDate,
    lastKm: doneKm,
    nextDate: projected.nextDate,
    nextKm: projected.nextKm,
  };
};

const COMPLETED_ORDER_STATUSES = new Set(['DONE', 'DELIVERED']);
const OPEN_ORDER_STATUSES = new Set(['APPROVED', 'STARTED', 'IN_PROGRESS', 'WAITING_PART', 'FINISHING']);

const getOrderText = (order) => normalizeText(
  (Array.isArray(order?.items) ? order.items : [])
    .map((item) => item?.itemName || item?.description || '')
    .filter(Boolean)
    .join(' ')
);

const buildVehicleMaintenanceInsights = ({ maintenances, serviceOrders, currentKm }) => {
  const rows = Array.isArray(maintenances) ? maintenances : [];
  const orders = Array.isArray(serviceOrders) ? serviceOrders : [];
  const normalizedMaintenances = rows.map((m) => {
    const forecast = computeMaintenanceForecast(m, {
      baselineDate: m.createdAt,
      baselineKm: currentKm,
    });
    const normalized = { ...m, nextDate: forecast.nextDate, nextKm: forecast.nextKm };
    const alertLevel = getAlertLevel(normalized, currentKm);
    const dueMeta = buildDueMeta(normalized, currentKm);
    return {
      ...normalized,
      alertLevel,
      statusLabel: toStatusLabel(alertLevel),
      ...dueMeta,
    };
  });

  const maintenanceByType = new Map(normalizedMaintenances.map((row) => [row.type, row]));
  const completedOrders = orders.filter((order) => COMPLETED_ORDER_STATUSES.has(String(order?.status || '').toUpperCase()));

  const getByRule = (rule) => {
    const existing = maintenanceByType.get(rule.type) || null;
    if (existing) {
      return getMaintenanceResponse({
        maintenance: existing,
        type: rule.type,
        label: existing.label || rule.label,
        currentKm,
        source: 'CURRENT_PLAN',
        performedInThisOrder: false,
      });
    }

    const matchedOrder = completedOrders.find((order) => rule.match(getOrderText(order)));
    if (!matchedOrder) {
      return getMaintenanceResponse({
        maintenance: null,
        type: rule.type,
        label: rule.label,
        currentKm,
        source: 'NOT_AVAILABLE',
        performedInThisOrder: false,
      });
    }

    const doneDate = getClosedAtFromStatus(matchedOrder);
    const doneKm = toIntOrNull(matchedOrder?.entryKm) ?? toIntOrNull(currentKm);
    const projected = buildProjectedMaintenance({ existing: null, rule, doneDate, doneKm });
    return getMaintenanceResponse({
      maintenance: projected,
      type: rule.type,
      label: projected.label,
      currentKm,
      source: 'ORDER_HISTORY',
      performedInThisOrder: false,
    });
  };

  const nextOilChange = getByRule(MAINTENANCE_RULES[0]);
  const nextBeltChange = getByRule(MAINTENANCE_RULES[1]);

  const candidates = [
    ...normalizedMaintenances,
    ...(nextOilChange?.nextDate || nextOilChange?.nextKm ? [nextOilChange] : []),
    ...(nextBeltChange?.nextDate || nextBeltChange?.nextKm ? [nextBeltChange] : []),
  ];

  const dedup = new Map();
  for (const item of candidates) {
    const key = `${item.type || 'unknown'}:${item.label || ''}`;
    if (!dedup.has(key)) dedup.set(key, item);
  }
  const ranked = [...dedup.values()].sort((a, b) => {
    const [pa, da, ka] = getMaintenanceSortWeight(a, currentKm);
    const [pb, db, kb] = getMaintenanceSortWeight(b, currentKm);
    if (pa !== pb) return pa - pb;
    if (da !== db) return da - db;
    return ka - kb;
  });

  const overdueCount = normalizedMaintenances.filter((m) => m.alertLevel === 'OVERDUE').length;
  const dueSoonCount = normalizedMaintenances.filter((m) => m.alertLevel === 'DUE_SOON').length;

  return {
    maintenances: normalizedMaintenances,
    nextMaintenance: ranked[0] || null,
    nextOilChange,
    nextBeltChange,
    overdueCount,
    dueSoonCount,
  };
};


async function notifyPortalProfileChange({ before, after }) {
  const phone = String(after?.whatsapp || after?.phone || '').trim();
  if (!phone) return;

  const clientName = after?.name || before?.name || 'Cliente';
  const portalUrl = `${process.env.FRONTEND_URL || ''}/portal`;

  const whatsappChanged = String(before?.whatsapp || '') !== String(after?.whatsapp || '');
  const emailChanged = String(before?.email || '') !== String(after?.email || '');

  if (whatsappChanged && String(after?.whatsapp || '').trim()) {
    const msg = `Ola, ${clientName}! Confirmamos a atualizacao do seu WhatsApp para ${after.whatsapp}.`;
    await sendWhatsAppMessageWithDedupe({
      clientId: after.id,
      soId: null,
      phone,
      content: msg,
      dedupeHours: 12,
      eventKey: 'PROFILE_WHATSAPP_UPDATED',
      templateVariables: {
        clientName,
        newWhatsapp: after.whatsapp,
        portalUrl,
      },
    }).catch(() => {});
  }

  if (emailChanged && String(after?.email || '').trim()) {
    const msg = `Ola, ${clientName}! Confirmamos a atualizacao do seu email para ${after.email}.`;
    await sendWhatsAppMessageWithDedupe({
      clientId: after.id,
      soId: null,
      phone,
      content: msg,
      dedupeHours: 12,
      eventKey: 'PROFILE_EMAIL_UPDATED',
      templateVariables: {
        clientName,
        newEmail: after.email,
        portalUrl,
      },
    }).catch(() => {});
  }

  if (!whatsappChanged && !emailChanged) {
    const msg = `Ola, ${clientName}! Seu cadastro foi atualizado com sucesso na JR Auto Parts. Portal: ${portalUrl}`;
    await sendWhatsAppMessageWithDedupe({
      clientId: after.id,
      soId: null,
      phone,
      content: msg,
      dedupeHours: 12,
      eventKey: 'PROFILE_UPDATED',
      templateVariables: {
        clientName,
        portalUrl,
      },
    }).catch(() => {});
  }
}
const portalLogin = async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');

    if (!email || !password) {
      return res.status(400).json({ error: 'Email e senha sao obrigatorios.' });
    }

    const user = await prisma.user.findFirst({
      where: { email, role: 'CLIENT', active: true },
      include: { client: true },
    });

    if (!user || !user.client) {
      return res.status(401).json({ error: 'Credenciais invalidas.' });
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      return res.status(423).json({ error: 'Conta temporariamente bloqueada por tentativas invalidas. Tente novamente mais tarde.' });
    }

    const validPassword = await bcrypt.compare(password, user.passwordHash);
    if (!validPassword) {
      const MAX_FAILED = parseInt(process.env.MAX_FAILED_LOGINS || '5', 10);
      const LOCK_MINUTES = parseInt(process.env.LOGIN_LOCK_MINUTES || '15', 10);
      const failedCount = (user.failedLoginCount || 0) + 1;
      const updateData = { failedLoginCount: failedCount };
      if (failedCount >= MAX_FAILED) {
        updateData.lockedUntil = new Date(Date.now() + LOCK_MINUTES * 60 * 1000);
      }
      await prisma.user.update({ where: { id: user.id }, data: updateData });
      return res.status(401).json({ error: 'Credenciais invalidas.' });
    }

    const token = jwt.sign(
      { userId: user.id, role: 'CLIENT' },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '12h' }
    );

    await prisma.user.update({
      where: { id: user.id },
      data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
    });

    return res.json({
      token,
      client: {
        id: user.client.id,
        name: user.client.name,
        email: user.client.email,
      },
    });
  } catch (err) {
    console.error('[portalLogin] error:', err);
    return res.status(500).json({ error: 'Erro ao fazer login.' });
  }
};

const me = async (req, res) => {
  try {
    const client = await prisma.client.findUnique({
      where: { id: req.client.id },
      include: {
        vehicles: {
          where: { active: true },
          include: {
            maintenances: true,
            serviceOrders: {
              where: { status: { not: 'QUOTE' } },
              select: {
                id: true,
                status: true,
                createdAt: true,
                updatedAt: true,
                entryKm: true,
                totalPrice: true,
                items: {
                  select: {
                    itemName: true,
                    type: true,
                  },
                },
              },
              orderBy: { updatedAt: 'desc' },
              take: 25,
            },
          },
        },
      },
    });

    if (!client) return res.status(404).json({ error: 'Cliente nao encontrado.' });

    const vehicles = client.vehicles.map((v) => {
      const insights = buildVehicleMaintenanceInsights({
        maintenances: v.maintenances,
        serviceOrders: v.serviceOrders,
        currentKm: v.currentKm,
      });

      const latestMaintenanceUpdate = insights.maintenances.reduce((latest, m) => {
        const t = m.updatedAt ? new Date(m.updatedAt).getTime() : 0;
        return t > latest ? t : latest;
      }, 0);

      const latestOrderUpdate = (v.serviceOrders || []).reduce((latest, order) => {
        const t = order?.updatedAt ? new Date(order.updatedAt).getTime() : 0;
        return t > latest ? t : latest;
      }, 0);

      const latestVehicleUpdate = v.updatedAt ? new Date(v.updatedAt).getTime() : 0;
      const latestActivityAt = new Date(Math.max(latestVehicleUpdate, latestMaintenanceUpdate, latestOrderUpdate || 0));

      const openOsCount = (v.serviceOrders || []).filter((order) => OPEN_ORDER_STATUSES.has(String(order.status || '').toUpperCase())).length;
      const completedOrders = (v.serviceOrders || []).filter((order) => COMPLETED_ORDER_STATUSES.has(String(order.status || '').toUpperCase()));
      const lastServiceOrder = completedOrders[0] || null;

      return {
        ...v,
        maintenances: insights.maintenances,
        nextMaintenance: insights.nextMaintenance,
        nextOilChange: insights.nextOilChange,
        nextBeltChange: insights.nextBeltChange,
        overdueCount: insights.overdueCount,
        dueSoonCount: insights.dueSoonCount,
        openOsCount,
        totalOsCount: (v.serviceOrders || []).length,
        lastServiceOrder,
        latestActivityAt,
      };
    }).sort((a, b) => new Date(b.latestActivityAt).getTime() - new Date(a.latestActivityAt).getTime());

    const maintenances = vehicles.flatMap((v) =>
      v.maintenances
        .filter((m) => m.alertLevel)
        .map((m) => ({ ...m, vehicle: { id: v.id, plate: v.plate, brand: v.brand, model: v.model } }))
    );

    const recentOrders = await prisma.serviceOrder.findMany({
      where: { clientId: client.id, status: { not: 'QUOTE' } },
      orderBy: { updatedAt: 'desc' },
      take: 10,
      include: { vehicle: { select: { plate: true, brand: true, model: true } } },
    });

    const trackingContracts = await prisma.trackingContract.findMany({
      where: { clientId: client.id },
      orderBy: { updatedAt: 'desc' },
      include: {
        vehicle: { select: { id: true, plate: true, brand: true, model: true } },
        device: { select: { id: true, model: true, imei: true, status: true, installedAt: true } },
        invoices: {
          orderBy: { dueDate: 'desc' },
          take: 6,
        },
      },
    });

    const trackingInvoices = trackingContracts.flatMap((contract) =>
      contract.invoices.map((invoice) => ({
        ...normalizeTrackingInvoice(invoice),
        contract: {
          id: contract.id,
          vehicle: contract.vehicle,
          device: contract.device,
        },
      }))
    );

    const pendingTrackingInvoices = trackingInvoices.filter((i) => i.effectiveStatus !== 'PAID');
    const trackingOpenAmount = pendingTrackingInvoices.reduce((sum, i) => sum + Number(i.amount || 0), 0);
    const recentVehicleServices = vehicles
      .filter((vehicle) => vehicle.lastServiceOrder)
      .slice(0, 6)
      .map((vehicle) => ({
        id: vehicle.id,
        plate: vehicle.plate,
        brand: vehicle.brand,
        model: vehicle.model,
        lastServiceOrder: {
          id: vehicle.lastServiceOrder.id,
          status: vehicle.lastServiceOrder.status,
          updatedAt: vehicle.lastServiceOrder.updatedAt,
          totalPrice: vehicle.lastServiceOrder.totalPrice,
        },
      }));

    res.json({
      client: {
        id: client.id,
        name: client.name,
        email: client.email,
        phone: client.phone,
        whatsapp: client.whatsapp,
      },
      vehicles,
      maintenances,
      recentOrders,
      recentVehicleServices,
      tracking: {
        contracts: trackingContracts,
        invoices: trackingInvoices,
        pendingInvoices: pendingTrackingInvoices,
        openAmount: trackingOpenAmount,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar dados do cliente.' });
  }
};

const updateMe = async (req, res) => {
  try {
    const whatsapp = req.body?.whatsapp !== undefined ? String(req.body.whatsapp || '').trim() : undefined;
    const phone = req.body?.phone !== undefined ? String(req.body.phone || '').trim() : undefined;
    const email = req.body?.email !== undefined ? String(req.body.email || '').trim().toLowerCase() : undefined;

    if (email !== undefined && email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Email invalido.' });
    }

    const before = await prisma.client.findUnique({
      where: { id: req.client.id },
      select: { id: true, name: true, email: true, phone: true, whatsapp: true },
    });

    if (!before) return res.status(404).json({ error: 'Cliente nao encontrado.' });

    const updated = await prisma.client.update({
      where: { id: req.client.id },
      data: {
        ...(whatsapp !== undefined ? { whatsapp: whatsapp || null } : {}),
        ...(phone !== undefined ? { phone: phone || null } : {}),
        ...(email !== undefined ? { email: email || null } : {}),
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        whatsapp: true,
      },
    });

    await notifyPortalProfileChange({ before, after: updated });

    return res.json({
      message: 'Dados atualizados com sucesso.',
      client: updated,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Erro ao atualizar dados do cliente.' });
  }
};
const vehicleDetail = async (req, res) => {
  try {
    const vehicle = await prisma.vehicle.findFirst({
      where: { id: req.params.vehicleId, clientId: req.client.id, active: true },
      include: {
        maintenances: { orderBy: { type: 'asc' } },
        trackingDevices: { orderBy: [{ installedAt: 'desc' }, { createdAt: 'desc' }] },
        serviceOrders: {
          where: { status: { not: 'QUOTE' } },
          orderBy: { updatedAt: 'desc' },
          include: { items: true },
        },
      },
    });

    if (!vehicle) return res.status(404).json({ error: 'Veiculo nao encontrado.' });

    const STATUS_LABELS = {
      QUOTE: 'Orcamento',
      APPROVED: 'Aprovado',
      STARTED: 'Iniciado',
      IN_PROGRESS: 'Em execucao',
      WAITING_PART: 'Aguardando peca',
      FINISHING: 'Finalizando',
      DONE: 'Finalizado',
      DELIVERED: 'Entregue',
    };

    const insights = buildVehicleMaintenanceInsights({
      maintenances: vehicle.maintenances,
      serviceOrders: vehicle.serviceOrders,
      currentKm: vehicle.currentKm,
    });
    const maintenances = insights.maintenances;

    const upcomingMaintenances = [...maintenances]
      .sort((a, b) => {
        const pa = getMaintenancePriority(a, vehicle.currentKm);
        const pb = getMaintenancePriority(b, vehicle.currentKm);
        if (pa !== pb) return pa - pb;

        const ad = a.nextDate ? new Date(a.nextDate).getTime() : Number.MAX_SAFE_INTEGER;
        const bd = b.nextDate ? new Date(b.nextDate).getTime() : Number.MAX_SAFE_INTEGER;
        if (ad !== bd) return ad - bd;

        const ak = a.nextKm || Number.MAX_SAFE_INTEGER;
        const bk = b.nextKm || Number.MAX_SAFE_INTEGER;
        return ak - bk;
      })
      .slice(0, 6);

    const serviceOrders = vehicle.serviceOrders.map((order) => {
      const { enriched: items, calculatedTotal } = buildItemsWithTotals(order.items);
      const persistedTotal = Number(order.totalPrice);
      const displayTotal = Number.isFinite(persistedTotal) ? persistedTotal : calculatedTotal;
      return {
        ...order,
        items,
        calculatedTotal,
        displayTotal,
        statusLabel: STATUS_LABELS[order.status] || order.status,
      };
    });

    res.json({
      vehicle: {
        id: vehicle.id,
        plate: vehicle.plate,
        brand: vehicle.brand,
        model: vehicle.model,
        year: vehicle.year,
        color: vehicle.color,
        fuel: vehicle.fuel,
        currentKm: vehicle.currentKm,
        notes: vehicle.notes,
      },
      maintenances,
      maintenanceSummary: {
        nextMaintenance: insights.nextMaintenance,
        nextOilChange: insights.nextOilChange,
        nextBeltChange: insights.nextBeltChange,
        overdueCount: insights.overdueCount,
        dueSoonCount: insights.dueSoonCount,
      },
      upcomingMaintenances,
      trackingDevices: vehicle.trackingDevices.map((device) => ({
        id: device.id,
        model: device.model,
        imei: device.imei,
        chipNumber: device.chipNumber,
        carrier: device.carrier,
        status: device.status,
        installedAt: device.installedAt,
        notes: device.notes,
      })),
      serviceOrders,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar veiculo.' });
  }
};

const soDetail = async (req, res) => {
  try {
    const order = await prisma.serviceOrder.findFirst({
      where: { id: req.params.soId, clientId: req.client.id },
      include: {
        vehicle: true,
        items: true,
        statusLogs: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!order) return res.status(404).json({ error: 'OS nao encontrada.' });

    const { enriched: itemsWithTotals, calculatedTotal } = buildItemsWithTotals(order.items);
    const persistedTotal = Number(order.totalPrice);
    const displayTotal = Number.isFinite(persistedTotal) ? persistedTotal : calculatedTotal;

    const serviceItems = itemsWithTotals.filter((item) => item.type === 'SERVICE');
    const productItems = itemsWithTotals.filter((item) => item.type === 'PRODUCT');

    const subtotalServices = serviceItems.reduce((sum, item) => sum + toNumber(item.lineTotal), 0);
    const subtotalProducts = productItems.reduce((sum, item) => sum + toNumber(item.lineTotal), 0);
    const subtotalBase = subtotalServices + subtotalProducts;

    const adjustment = displayTotal - subtotalBase;
    const additional = adjustment > 0 ? adjustment : 0;
    const discount = adjustment < 0 ? Math.abs(adjustment) : 0;

    const deliveredLog = (order.statusLogs || []).find((log) => String(log.newStatus || '').toUpperCase() === 'DELIVERED');
    const deliveryMeta = normalizeDeliveryMeta(parseDeliveryMetaFromNotes(order.notes));

    const financialSummary = {
      subtotalServices,
      subtotalProducts,
      discount,
      additional,
      totalCalculated: calculatedTotal,
      totalFinal: displayTotal,
    };

    const maintenances = await prisma.preventiveMaintenance.findMany({
      where: {
        vehicleId: order.vehicleId,
        type: { in: MAINTENANCE_RULES.map((rule) => rule.type) },
      },
    });

    const maintenanceByType = new Map(maintenances.map((row) => [row.type, row]));
    const joinedOrderText = normalizeText(
      itemsWithTotals
        .map((item) => item.itemName || item.description || item.service?.name || item.product?.name)
        .filter(Boolean)
        .join(' ')
    );
    const orderStatus = String(order.status || '').toUpperCase();
    const orderCompleted = ['DONE', 'DELIVERED'].includes(orderStatus);
    const doneDate = getClosedAtFromStatus(order);
    const doneKm = toIntOrNull(order.entryKm) ?? toIntOrNull(order.vehicle?.currentKm);
    const referenceCurrentKm = toIntOrNull(order.vehicle?.currentKm) ?? doneKm;

    const maintenanceProjection = {};

    for (const rule of MAINTENANCE_RULES) {
      const existing = maintenanceByType.get(rule.type) || null;
      const hasMaintenanceInThisOrder = rule.match(joinedOrderText);
      const performedInThisOrder = hasMaintenanceInThisOrder && orderCompleted;

      if (performedInThisOrder) {
        const projected = buildProjectedMaintenance({
          existing,
          rule,
          doneDate,
          doneKm,
        });

        maintenanceProjection[rule.type] = getMaintenanceResponse({
          maintenance: projected,
          type: rule.type,
          label: projected.label,
          currentKm: referenceCurrentKm,
          source: 'ORDER_EXECUTION',
          performedInThisOrder: true,
        });
        continue;
      }

      if (hasMaintenanceInThisOrder && !orderCompleted && !existing) {
        maintenanceProjection[rule.type] = getMaintenanceResponse({
          maintenance: null,
          type: rule.type,
          label: rule.label,
          currentKm: referenceCurrentKm,
          source: 'PENDING_EXECUTION',
          performedInThisOrder: false,
        });
        continue;
      }

      if (existing) {
        const forecast = computeMaintenanceForecast(existing, {
          baselineDate: existing.createdAt,
          baselineKm: referenceCurrentKm,
        });

        maintenanceProjection[rule.type] = getMaintenanceResponse({
          maintenance: {
            ...existing,
            nextDate: forecast.nextDate,
            nextKm: forecast.nextKm,
          },
          type: rule.type,
          label: existing.label || rule.label,
          currentKm: referenceCurrentKm,
          source: 'CURRENT_PLAN',
          performedInThisOrder: false,
        });
        continue;
      }

      maintenanceProjection[rule.type] = getMaintenanceResponse({
        maintenance: null,
        type: rule.type,
        label: rule.label,
        currentKm: referenceCurrentKm,
        source: 'NOT_AVAILABLE',
        performedInThisOrder: false,
      });
    }

    res.json({
      ...order,
      items: itemsWithTotals,
      serviceItems,
      productItems,
      calculatedTotal,
      displayTotal,
      financialSummary,
      deliveryDate: deliveredLog?.createdAt || null,
      deliveryMeta,
      maintenanceProjection,
      maintenanceProjectionContext: {
        doneDate,
        doneKm,
        status: order.status,
        orderCompleted,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar OS.' });
  }
};

module.exports = { portalLogin, me, updateMe, vehicleDetail, soDetail };







