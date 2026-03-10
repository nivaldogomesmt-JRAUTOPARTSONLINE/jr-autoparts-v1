const prisma = require('../lib/prisma');

// Calcula alertLevel de uma manutenção

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
const getAlertLevel = (m, currentKm) => {
  const now = new Date();
  const in30days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  // Prioridade: vencido > próximo
  if (m.nextDate && new Date(m.nextDate) < now) return 'OVERDUE';
  if (m.nextKm && currentKm && currentKm >= m.nextKm) return 'OVERDUE';
  if (m.nextDate && new Date(m.nextDate) <= in30days) return 'DUE_SOON';
  if (m.nextKm && currentKm && (m.nextKm - currentKm) <= 1000) return 'DUE_SOON';
  return null; // OK — sem alerta
};

// GET /api/portal/me — dados completos do cliente logado
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

    if (!client) return res.status(404).json({ error: 'Cliente não encontrado.' });

    // Montar veículos com alertas calculados
    const vehicles = client.vehicles.map(v => ({
      ...v,
      maintenances: v.maintenances.map(m => ({
        ...m,
        alertLevel: getAlertLevel(m, v.currentKm),
      })),
    }));

    // Lista plana de manutenções com alerta (para o banner do dashboard)
    const maintenances = vehicles.flatMap(v =>
      v.maintenances
        .filter(m => m.alertLevel)
        .map(m => ({ ...m, vehicle: { id: v.id, plate: v.plate, brand: v.brand, model: v.model } }))
    );

    // OS recentes do cliente (exceto or�amentos)
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
        device: { select: { id: true, model: true, imei: true, status: true } },
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

// GET /api/portal/vehicles/:vehicleId — detalhe de um veículo
const vehicleDetail = async (req, res) => {
  try {
    const vehicle = await prisma.vehicle.findFirst({
      where: { id: req.params.vehicleId, clientId: req.client.id, active: true },
      include: {
        maintenances: { orderBy: { type: 'asc' } },
        serviceOrders: {
          where: { status: { not: 'QUOTE' } },
          orderBy: { createdAt: 'desc' },
          include: { items: true },
        },
      },
    });

    if (!vehicle) return res.status(404).json({ error: 'Veículo não encontrado.' });

    const STATUS_LABELS = {
      QUOTE: 'Orçamento', APPROVED: 'Aprovado', STARTED: 'Iniciado',
      IN_PROGRESS: 'Em Execução', WAITING_PART: 'Aguardando Peça',
      FINISHING: 'Finalizando', DONE: 'Finalizado', DELIVERED: 'Entregue',
    };

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
      maintenances: vehicle.maintenances.map(m => ({
        ...m,
        alertLevel: getAlertLevel(m, vehicle.currentKm),
      })),
      serviceOrders: vehicle.serviceOrders.map(o => ({
        ...o,
        statusLabel: STATUS_LABELS[o.status] || o.status,
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar veículo.' });
  }
};

// GET /api/portal/so/:soId — detalhe de uma OS (confirma que pertence ao cliente)
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
    if (!order) return res.status(404).json({ error: 'OS não encontrada.' });
    res.json(order);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar OS.' });
  }
};

module.exports = { me, vehicleDetail, soDetail };

