const prisma = require('../lib/prisma');

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

const getAlertLevel = (maintenance, currentKm) => {
  const now = new Date();
  const in30days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  if (maintenance.nextDate && new Date(maintenance.nextDate) < now) return 'OVERDUE';
  if (maintenance.nextKm && currentKm && currentKm >= maintenance.nextKm) return 'OVERDUE';
  if (maintenance.nextDate && new Date(maintenance.nextDate) <= in30days) return 'DUE_SOON';
  if (maintenance.nextKm && currentKm && maintenance.nextKm - currentKm <= 1000) return 'DUE_SOON';
  return null;
};

const getMaintenancePriority = (maintenance, currentKm) => {
  const alertLevel = getAlertLevel(maintenance, currentKm);
  if (alertLevel === 'OVERDUE') return 0;
  if (alertLevel === 'DUE_SOON') return 1;
  return 2;
};

const toStatusLabel = (alertLevel) => {
  if (alertLevel === 'OVERDUE') return 'Vencido';
  if (alertLevel === 'DUE_SOON') return 'Proximo';
  return 'Em dia';
};

const getMaintenanceSortWeight = (maintenance, currentKm) => {
  const priority = getMaintenancePriority(maintenance, currentKm);
  const nextDate = maintenance.nextDate ? new Date(maintenance.nextDate).getTime() : Number.MAX_SAFE_INTEGER;
  const nextKm = maintenance.nextKm || Number.MAX_SAFE_INTEGER;
  return [priority, nextDate, nextKm];
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
          },
        },
      },
    });

    if (!client) return res.status(404).json({ error: 'Cliente nao encontrado.' });

    const vehicles = client.vehicles.map((v) => {
      const enrichedMaintenances = v.maintenances.map((m) => {
        const alertLevel = getAlertLevel(m, v.currentKm);
        return {
          ...m,
          alertLevel,
          statusLabel: toStatusLabel(alertLevel),
        };
      });

      const sortedMaintenances = [...enrichedMaintenances].sort((a, b) => {
        const [pa, da, ka] = getMaintenanceSortWeight(a, v.currentKm);
        const [pb, db, kb] = getMaintenanceSortWeight(b, v.currentKm);
        if (pa !== pb) return pa - pb;
        if (da !== db) return da - db;
        return ka - kb;
      });

      const nextMaintenance = sortedMaintenances.length ? sortedMaintenances[0] : null;
      const overdueCount = enrichedMaintenances.filter((m) => m.alertLevel === 'OVERDUE').length;
      const dueSoonCount = enrichedMaintenances.filter((m) => m.alertLevel === 'DUE_SOON').length;

      return {
        ...v,
        maintenances: enrichedMaintenances,
        nextMaintenance,
        overdueCount,
        dueSoonCount,
      };
    });

    const maintenances = vehicles.flatMap((v) =>
      v.maintenances
        .filter((m) => m.alertLevel)
        .map((m) => ({ ...m, vehicle: { id: v.id, plate: v.plate, brand: v.brand, model: v.model } }))
    );

    const recentOrders = await prisma.serviceOrder.findMany({
      where: { clientId: client.id, status: { not: 'QUOTE' } },
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: { vehicle: { select: { plate: true, brand: true, model: true } } },
    });

    const trackingContracts = await prisma.trackingContract.findMany({
      where: { clientId: client.id },
      orderBy: { createdAt: 'desc' },
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

    res.json({
      client: {
        id: client.id,
        name: client.name,
        email: client.email,
        phone: client.phone,
      },
      vehicles,
      maintenances,
      recentOrders,
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

const vehicleDetail = async (req, res) => {
  try {
    const vehicle = await prisma.vehicle.findFirst({
      where: { id: req.params.vehicleId, clientId: req.client.id, active: true },
      include: {
        maintenances: { orderBy: { type: 'asc' } },
        trackingDevices: { orderBy: [{ installedAt: 'desc' }, { createdAt: 'desc' }] },
        serviceOrders: {
          where: { status: { not: 'QUOTE' } },
          orderBy: { createdAt: 'desc' },
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

    const maintenances = vehicle.maintenances.map((m) => {
      const alertLevel = getAlertLevel(m, vehicle.currentKm);
      return {
        ...m,
        alertLevel,
        statusLabel: toStatusLabel(alertLevel),
      };
    });

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
      serviceOrders: vehicle.serviceOrders.map((order) => ({
        ...order,
        statusLabel: STATUS_LABELS[order.status] || order.status,
      })),
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
    res.json(order);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar OS.' });
  }
};

module.exports = { me, vehicleDetail, soDetail };
