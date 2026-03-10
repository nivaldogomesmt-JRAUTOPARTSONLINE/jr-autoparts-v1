const prisma = require('../lib/prisma');

const toDate = (v) => (v ? new Date(v) : null);

const calcDaysOverdue = (dueDate, paidAt) => {
  if (paidAt) return 0;
  const now = new Date();
  const due = new Date(dueDate);
  const ms = now.getTime() - due.getTime();
  if (ms <= 0) return 0;
  return Math.floor(ms / (1000 * 60 * 60 * 24));
};

const getDelinquencyBand = (days) => {
  if (days <= 0) return 'ON_TIME';
  if (days <= 30) return 'LIGHT';
  if (days <= 60) return 'INTENSIVE';
  if (days <= 90) return 'CRITICAL';
  return 'RECOVERY';
};

const normalizeInvoiceStatus = (invoice) => {
  const daysOverdue = calcDaysOverdue(invoice.dueDate, invoice.paidAt);
  const status = invoice.paidAt ? 'PAID' : daysOverdue > 0 ? 'OVERDUE' : invoice.status;
  return {
    ...invoice,
    status,
    daysOverdue,
    delinquencyBand: getDelinquencyBand(daysOverdue),
  };
};

const summary = async (req, res) => {
  try {
    const [deviceCount, activeContracts, invoices] = await Promise.all([
      prisma.trackingDevice.count(),
      prisma.trackingContract.count({ where: { status: 'ACTIVE' } }),
      prisma.trackingInvoice.findMany({ where: { status: { in: ['PENDING', 'OVERDUE'] } } }),
    ]);

    const normalized = invoices.map(normalizeInvoiceStatus);
    const buckets = {
      light: normalized.filter((i) => i.delinquencyBand === 'LIGHT').length,
      intensive: normalized.filter((i) => i.delinquencyBand === 'INTENSIVE').length,
      critical: normalized.filter((i) => i.delinquencyBand === 'CRITICAL').length,
      recovery: normalized.filter((i) => i.delinquencyBand === 'RECOVERY').length,
    };

    const openAmount = normalized.reduce((sum, i) => sum + Number(i.amount || 0), 0);

    return res.json({
      devices: deviceCount,
      activeContracts,
      openInvoices: normalized.length,
      openAmount,
      delinquency: buckets,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao gerar resumo de rastreamento.' });
  }
};

const listDevices = async (req, res) => {
  try {
    const devices = await prisma.trackingDevice.findMany({
      include: {
        client: { select: { id: true, name: true, whatsapp: true } },
        vehicle: { select: { id: true, plate: true, brand: true, model: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return res.json(devices);
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao listar rastreadores.' });
  }
};

const createDevice = async (req, res) => {
  try {
    const { clientId, vehicleId, model, imei, chipNumber, carrier, status, installedAt, notes } = req.body;
    if (!model || !imei) return res.status(400).json({ error: 'Modelo e IMEI sao obrigatorios.' });

    const created = await prisma.trackingDevice.create({
      data: {
        clientId: clientId || null,
        vehicleId: vehicleId || null,
        model,
        imei,
        chipNumber,
        carrier,
        status: status || 'STOCK',
        installedAt: toDate(installedAt),
        notes,
      },
    });

    return res.status(201).json(created);
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao cadastrar rastreador.' });
  }
};

const updateDevice = async (req, res) => {
  try {
    const { clientId, vehicleId, model, imei, chipNumber, carrier, status, installedAt, notes } = req.body;
    const updated = await prisma.trackingDevice.update({
      where: { id: req.params.id },
      data: {
        clientId: clientId || null,
        vehicleId: vehicleId || null,
        model,
        imei,
        chipNumber,
        carrier,
        status,
        installedAt: installedAt ? toDate(installedAt) : undefined,
        notes,
      },
    });
    return res.json(updated);
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao atualizar rastreador.' });
  }
};

const listContracts = async (req, res) => {
  try {
    const contracts = await prisma.trackingContract.findMany({
      include: {
        client: { select: { id: true, name: true, phone: true, whatsapp: true } },
        vehicle: { select: { id: true, plate: true, brand: true, model: true } },
        device: { select: { id: true, model: true, imei: true, status: true } },
        invoices: {
          orderBy: { dueDate: 'desc' },
          take: 4,
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return res.json(contracts.map((c) => ({
      ...c,
      invoices: c.invoices.map(normalizeInvoiceStatus),
    })));
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao listar contratos.' });
  }
};

const createContract = async (req, res) => {
  try {
    const { clientId, vehicleId, deviceId, monthlyAmount, dueDay, startDate, endDate, status, notes } = req.body;
    if (!clientId || !vehicleId || !deviceId || !monthlyAmount || !dueDay || !startDate) {
      return res.status(400).json({ error: 'Cliente, veiculo, rastreador, valor, vencimento e inicio sao obrigatorios.' });
    }

    const contract = await prisma.trackingContract.create({
      data: {
        clientId,
        vehicleId,
        deviceId,
        monthlyAmount: Number(monthlyAmount),
        dueDay: Number(dueDay),
        startDate: new Date(startDate),
        endDate: endDate ? new Date(endDate) : null,
        status: status || 'ACTIVE',
        notes,
      },
    });

    return res.status(201).json(contract);
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao criar contrato.' });
  }
};

const createInvoice = async (req, res) => {
  try {
    const { contractId, referenceMonth, dueDate, amount, notes } = req.body;
    if (!contractId || !referenceMonth || !dueDate || !amount) {
      return res.status(400).json({ error: 'Contrato, competencia, vencimento e valor sao obrigatorios.' });
    }

    const invoice = await prisma.trackingInvoice.create({
      data: {
        contractId,
        referenceMonth,
        dueDate: new Date(dueDate),
        amount: Number(amount),
        notes,
      },
    });

    return res.status(201).json(normalizeInvoiceStatus(invoice));
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao criar mensalidade.' });
  }
};

const listInvoices = async (req, res) => {
  try {
    const { contractId } = req.query;
    const invoices = await prisma.trackingInvoice.findMany({
      where: {
        ...(contractId && { contractId: String(contractId) }),
      },
      include: {
        contract: {
          include: {
            client: { select: { id: true, name: true, whatsapp: true } },
            vehicle: { select: { id: true, plate: true } },
            device: { select: { id: true, model: true, imei: true } },
          },
        },
      },
      orderBy: { dueDate: 'desc' },
    });

    return res.json(invoices.map(normalizeInvoiceStatus));
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao listar mensalidades.' });
  }
};

const markInvoicePaid = async (req, res) => {
  try {
    const paid = await prisma.trackingInvoice.update({
      where: { id: req.params.id },
      data: {
        paidAt: new Date(),
        status: 'PAID',
      },
    });

    return res.json(normalizeInvoiceStatus(paid));
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao baixar mensalidade.' });
  }
};

module.exports = {
  summary,
  listDevices,
  createDevice,
  updateDevice,
  listContracts,
  createContract,
  listInvoices,
  createInvoice,
  markInvoicePaid,
};
