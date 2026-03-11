const prisma = require('../lib/prisma');
const { computeMaintenanceForecast, getMaintenanceAlertLevel } = require('../utils/maintenance');

const DELIVERY_META_PREFIX = '[DELIVERY_META]';

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

const ACTIVE_OS_STATUS = ['APPROVED', 'STARTED', 'IN_PROGRESS', 'WAITING_PART', 'FINISHING'];

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

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function aggregateTopItems(items, limit = 8) {
  const map = new Map();

  for (const item of items) {
    const key = String(item.itemName || '').trim();
    if (!key) continue;

    const quantity = toNumber(item.quantity);
    const unitPrice = toNumber(item.unitPrice);
    const revenue = quantity * unitPrice;

    if (!map.has(key)) {
      map.set(key, { name: key, quantity: 0, revenue: 0, count: 0 });
    }

    const acc = map.get(key);
    acc.quantity += quantity;
    acc.revenue += revenue;
    acc.count += 1;
  }

  return [...map.values()]
    .sort((a, b) => {
      if (b.quantity !== a.quantity) return b.quantity - a.quantity;
      return b.revenue - a.revenue;
    })
    .slice(0, limit)
    .map((item, idx) => ({
      rank: idx + 1,
      name: item.name,
      quantity: Number(item.quantity.toFixed(3)),
      revenue: Number(item.revenue.toFixed(2)),
      count: item.count,
    }));
}

function aggregateTopVehicles(orders, limit = 8) {
  const map = new Map();

  for (const order of orders) {
    const id = order.vehicle?.id || `plate:${order.vehicle?.plate || '-'}`;
    const plate = order.vehicle?.plate || '-';
    const model = `${order.vehicle?.brand || ''} ${order.vehicle?.model || ''}`.trim();
    const value = toNumber(order.totalPrice);

    if (!map.has(id)) {
      map.set(id, {
        vehicleId: id,
        plate,
        model,
        quantity: 0,
        revenue: 0,
      });
    }

    const row = map.get(id);
    row.quantity += 1;
    row.revenue += value;
  }

  return [...map.values()]
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, limit)
    .map((row, idx) => ({
      rank: idx + 1,
      name: `${row.plate}${row.model ? ` - ${row.model}` : ''}`,
      plate: row.plate,
      model: row.model,
      quantity: row.quantity,
      revenue: Number(row.revenue.toFixed(2)),
    }));
}

function mapOrderRow(order) {
  return {
    id: order.id,
    number: order.number,
    status: order.status,
    statusLabel: STATUS_LABELS[order.status] || order.status,
    totalPrice: Number(toNumber(order.totalPrice).toFixed(2)),
    updatedAt: order.updatedAt,
    createdAt: order.createdAt,
    client: order.client,
    vehicle: order.vehicle,
  };
}

function isOilMaintenance(item) {
  const text = `${normalizeText(item.type)} ${normalizeText(item.label)}`;
  return text.includes('OIL') || text.includes('OLEO') || text.includes('LUBRIFIC');
}

function isBeltMaintenance(item) {
  const text = `${normalizeText(item.type)} ${normalizeText(item.label)}`;
  return text.includes('BELT') || (text.includes('CORREIA') && (text.includes('DENTADA') || text.includes('SINCRONIZ') || text.includes('DISTRIBUICAO')));
}

// GET /api/dashboard
const getDashboard = async (req, res) => {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const staleOrderDate = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
    const staleDeliveryDate = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);

    const [
      totalClients,
      totalVehicles,
      monthlyOS,
      monthlyRevenueAgg,
      maintenanceRows,
      activeOrders,
      completedOrders,
      statusCounts,
      serviceItems,
      productItems,
    ] = await Promise.all([
      prisma.client.count({ where: { active: true } }),
      prisma.vehicle.count({ where: { active: true } }),
      prisma.serviceOrder.count({ where: { createdAt: { gte: startOfMonth } } }),
      prisma.serviceOrder.aggregate({
        where: { status: { in: ['DONE', 'DELIVERED'] }, updatedAt: { gte: startOfMonth } },
        _sum: { totalPrice: true },
      }),
      prisma.preventiveMaintenance.findMany({
        where: {
          vehicle: { active: true },
          OR: [
            { nextDate: { not: null } },
            { nextKm: { not: null } },
            { intervalMonths: { not: null } },
            { intervalKm: { not: null } },
          ],
        },
        include: {
          vehicle: {
            select: {
              id: true,
              plate: true,
              brand: true,
              model: true,
              currentKm: true,
              client: { select: { id: true, name: true } },
            },
          },
        },
      }),
      prisma.serviceOrder.findMany({
        where: { status: { in: ACTIVE_OS_STATUS } },
        include: {
          client: { select: { id: true, name: true, phone: true, whatsapp: true } },
          vehicle: { select: { id: true, plate: true, brand: true, model: true } },
        },
        orderBy: { updatedAt: 'desc' },
        take: 250,
      }),
      prisma.serviceOrder.findMany({
        where: { status: { in: ['DONE', 'DELIVERED'] } },
        include: {
          client: { select: { id: true, name: true } },
          vehicle: { select: { id: true, plate: true, brand: true, model: true } },
        },
        orderBy: { updatedAt: 'desc' },
        take: 1200,
      }),
      prisma.serviceOrder.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.soItem.findMany({
        where: { type: 'SERVICE', serviceOrder: { status: { in: ['DONE', 'DELIVERED'] } } },
        select: { itemName: true, quantity: true, unitPrice: true },
      }),
      prisma.soItem.findMany({
        where: { type: 'PRODUCT', serviceOrder: { status: { in: ['DONE', 'DELIVERED'] } } },
        select: { itemName: true, quantity: true, unitPrice: true },
      }),
    ]);

    const maintenanceEnriched = maintenanceRows.map((m) => {
      const forecast = computeMaintenanceForecast(m, {
        baselineDate: m.createdAt,
        baselineKm: m.vehicle?.currentKm,
      });

      const merged = { ...m, ...forecast };
      const alertLevel = getMaintenanceAlertLevel(merged, m.vehicle?.currentKm);

      return {
        ...merged,
        alertLevel,
      };
    });

    const maintenanceOverdueRows = maintenanceEnriched.filter((row) => row.alertLevel === 'OVERDUE');
    const maintenanceDueSoonRows = maintenanceEnriched.filter((row) => row.alertLevel === 'DUE_SOON');

    const oilOverdue = maintenanceOverdueRows.filter(isOilMaintenance).length;
    const oilDueSoon = maintenanceDueSoonRows.filter(isOilMaintenance).length;
    const beltOverdue = maintenanceOverdueRows.filter(isBeltMaintenance).length;
    const beltDueSoon = maintenanceDueSoonRows.filter(isBeltMaintenance).length;

    const priorityMaintenance = [...maintenanceOverdueRows, ...maintenanceDueSoonRows]
      .sort((a, b) => {
        const pa = a.alertLevel === 'OVERDUE' ? 0 : 1;
        const pb = b.alertLevel === 'OVERDUE' ? 0 : 1;
        if (pa !== pb) return pa - pb;

        const ad = toDate(a.nextDate)?.getTime() ?? Number.MAX_SAFE_INTEGER;
        const bd = toDate(b.nextDate)?.getTime() ?? Number.MAX_SAFE_INTEGER;
        if (ad !== bd) return ad - bd;

        return (a.nextKm ?? Number.MAX_SAFE_INTEGER) - (b.nextKm ?? Number.MAX_SAFE_INTEGER);
      })
      .slice(0, 12)
      .map((row) => ({
        id: row.id,
        label: row.label,
        type: row.type,
        alertLevel: row.alertLevel,
        nextDate: row.nextDate,
        nextKm: row.nextKm,
        vehicle: row.vehicle,
      }));

    const activeRows = activeOrders.map(mapOrderRow);
    const completedRows = completedOrders.map(mapOrderRow);

    const overdueOS = activeRows.filter((row) => new Date(row.updatedAt) < staleOrderDate).length;

    const deliveryRows = activeOrders
      .map((order) => {
        const deliveryMeta = parseDeliveryMetaFromNotes(order.notes) || null;
        const status = deliveryMeta?.status || 'AWAITING_DISPATCH';
        const updatedAt = toDate(deliveryMeta?.updatedAt) || toDate(order.updatedAt) || now;

        return {
          id: order.id,
          number: order.number,
          status,
          updatedAt,
          client: order.client,
          vehicle: order.vehicle,
        };
      });

    const pendingDeliveriesRows = deliveryRows.filter((row) => ['AWAITING_DISPATCH', 'OUT_FOR_DELIVERY', 'DELIVERY_FAILED'].includes(row.status));
    const delayedDeliveriesRows = pendingDeliveriesRows.filter((row) => row.updatedAt < staleDeliveryDate);

    const byStatus = statusCounts.reduce((acc, row) => {
      acc[row.status] = row._count?._all || 0;
      return acc;
    }, {});

    const totalFinishedValue = completedRows.reduce((sum, row) => sum + toNumber(row.totalPrice), 0);
    const avgTicketFinished = completedRows.length ? totalFinishedValue / completedRows.length : 0;

    const inProgressRows = activeRows
      .filter((row) => ['STARTED', 'IN_PROGRESS', 'FINISHING'].includes(row.status))
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
      .slice(0, 8);

    const waitingPartRows = activeRows
      .filter((row) => row.status === 'WAITING_PART')
      .sort((a, b) => new Date(a.updatedAt) - new Date(b.updatedAt))
      .slice(0, 8);

    const stalledRows = activeRows
      .filter((row) => new Date(row.updatedAt) < staleOrderDate)
      .sort((a, b) => new Date(a.updatedAt) - new Date(b.updatedAt))
      .slice(0, 8);

    const readyRows = completedRows
      .filter((row) => row.status === 'DONE')
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
      .slice(0, 8);

    const topRevenueOS = [...completedRows]
      .sort((a, b) => toNumber(b.totalPrice) - toNumber(a.totalPrice))
      .slice(0, 8);

    const campaigns = [
      {
        id: 'dashboard-retorno',
        name: 'Retorno Preventivo 30 dias',
        objective: 'Reativar clientes com manutenção pendente',
        period: 'Mensal',
        owner: 'Atendimento',
        target: 30,
        achieved: maintenanceDueSoonRows.length,
        status: maintenanceDueSoonRows.length >= 30 ? 'EM META' : 'ACOMPANHAR',
      },
    ];

    return res.json({
      stats: {
        totalClients,
        totalVehicles,
        activeOS: activeRows.length,
        monthlyOS,
        overdueMaintenances: maintenanceOverdueRows.length + maintenanceDueSoonRows.length,
        maintenanceOverdue: maintenanceOverdueRows.length,
        maintenanceDueSoon: maintenanceDueSoonRows.length,
        oilOverdue,
        oilDueSoon,
        beltOverdue,
        beltDueSoon,
        overdueOS,
        pendingDeliveries: pendingDeliveriesRows.length,
        delayedDeliveries: delayedDeliveriesRows.length,
        monthlyRevenue: parseFloat(monthlyRevenueAgg._sum.totalPrice || 0),
        avgTicket: Number(avgTicketFinished.toFixed(2)),
      },
      priorities: {
        maintenance: priorityMaintenance,
        deliveries: delayedDeliveriesRows.slice(0, 8),
      },
      operation: {
        byStatus,
        inProgress: inProgressRows,
        waitingPart: waitingPartRows,
        ready: readyRows,
        stalled: stalledRows,
      },
      recentOS: inProgressRows,
      rankings: {
        topServices: aggregateTopItems(serviceItems, 8),
        topProducts: aggregateTopItems(productItems, 8),
        topVehicles: aggregateTopVehicles(completedRows, 8),
        topRevenueOS,
      },
      campaigns,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao carregar dashboard.' });
  }
};

module.exports = { getDashboard };
