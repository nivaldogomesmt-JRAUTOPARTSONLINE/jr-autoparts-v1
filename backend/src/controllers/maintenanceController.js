const prisma = require('../lib/prisma');

// GET /api/maintenance/alerts — painel geral de alertas
const alerts = async (req, res) => {
  try {
    const now = new Date();
    const in30days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const maintenances = await prisma.preventiveMaintenance.findMany({
      where: {
        vehicle: { active: true },
        OR: [
          { nextDate: { lte: in30days } },
          { nextKm: { lte: { /* handled in JS */ } } },
        ],
      },
      include: {
        vehicle: {
          include: { client: { select: { id: true, name: true, phone: true } } },
        },
      },
    });

    // Classifica em: VENCIDO, PRÓXIMO (30 dias), OK
    const result = maintenances.map(m => {
      let alertLevel = 'OK';
      if (m.nextDate && m.nextDate < now) alertLevel = 'OVERDUE';
      else if (m.nextDate && m.nextDate <= in30days) alertLevel = 'DUE_SOON';
      if (m.nextKm && m.vehicle.currentKm && m.vehicle.currentKm >= m.nextKm) alertLevel = 'OVERDUE';

      return { ...m, alertLevel };
    }).filter(m => m.alertLevel !== 'OK');

    result.sort((a, b) => {
      const order = { OVERDUE: 0, DUE_SOON: 1 };
      return order[a.alertLevel] - order[b.alertLevel];
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar alertas de manutenção.' });
  }
};

// GET /api/maintenance/vehicle/:vehicleId
const byVehicle = async (req, res) => {
  try {
    const vehicle = await prisma.vehicle.findUnique({
      where: { id: req.params.vehicleId },
      select: { id: true, plate: true, brand: true, model: true, currentKm: true },
    });
    if (!vehicle) return res.status(404).json({ error: 'Veículo não encontrado.' });

    const now = new Date();
    const in30days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const maintenances = await prisma.preventiveMaintenance.findMany({
      where: { vehicleId: req.params.vehicleId },
      orderBy: { type: 'asc' },
    });

    const result = maintenances.map(m => {
      let alertLevel = 'OK';
      if (m.nextDate && m.nextDate < now) alertLevel = 'OVERDUE';
      else if (m.nextDate && m.nextDate <= in30days) alertLevel = 'DUE_SOON';
      if (m.nextKm && vehicle.currentKm && vehicle.currentKm >= m.nextKm) alertLevel = 'OVERDUE';
      else if (m.nextKm && vehicle.currentKm && (m.nextKm - vehicle.currentKm) <= 1000) alertLevel = 'DUE_SOON';

      return { ...m, alertLevel };
    });

    res.json({ vehicle, maintenances: result });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar manutenções.' });
  }
};

// PUT /api/maintenance/:id — atualiza intervalo ou marca como feito
const update = async (req, res) => {
  try {
    const { intervalKm, intervalMonths, lastDate, lastKm } = req.body;

    const current = await prisma.preventiveMaintenance.findUnique({ where: { id: req.params.id } });
    if (!current) return res.status(404).json({ error: 'Manutenção não encontrada.' });

    // Calcula próximas datas/km
    let nextDate = current.nextDate;
    let nextKm = current.nextKm;

    const effIntervalMonths = intervalMonths ?? current.intervalMonths;
    const effIntervalKm = intervalKm ?? current.intervalKm;

    if (lastDate && effIntervalMonths) {
      const d = new Date(lastDate);
      d.setMonth(d.getMonth() + parseInt(effIntervalMonths));
      nextDate = d;
    }
    if (lastKm && effIntervalKm) {
      nextKm = parseInt(lastKm) + parseInt(effIntervalKm);
    }

    const maintenance = await prisma.preventiveMaintenance.update({
      where: { id: req.params.id },
      data: {
        intervalKm: effIntervalKm ? parseInt(effIntervalKm) : undefined,
        intervalMonths: effIntervalMonths ? parseInt(effIntervalMonths) : undefined,
        lastDate: lastDate ? new Date(lastDate) : undefined,
        lastKm: lastKm ? parseInt(lastKm) : undefined,
        nextDate,
        nextKm,
      },
    });

    res.json(maintenance);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao atualizar manutenção.' });
  }
};

// POST /api/maintenance/vehicle/:vehicleId/mark-done
const markDone = async (req, res) => {
  try {
    const { type, doneDate, doneKm } = req.body;
    if (!type) return res.status(400).json({ error: 'Tipo de manutenção é obrigatório.' });

    const maintenance = await prisma.preventiveMaintenance.findFirst({
      where: { vehicleId: req.params.vehicleId, type },
    });

    if (!maintenance) return res.status(404).json({ error: 'Manutenção não encontrada para esse veículo.' });

    let nextDate = null;
    let nextKm = null;

    if (doneDate && maintenance.intervalMonths) {
      const d = new Date(doneDate);
      d.setMonth(d.getMonth() + maintenance.intervalMonths);
      nextDate = d;
    }
    if (doneKm && maintenance.intervalKm) {
      nextKm = parseInt(doneKm) + maintenance.intervalKm;
    }

    const updated = await prisma.preventiveMaintenance.update({
      where: { id: maintenance.id },
      data: {
        lastDate: doneDate ? new Date(doneDate) : new Date(),
        lastKm: doneKm ? parseInt(doneKm) : undefined,
        nextDate,
        nextKm,
      },
    });

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao registrar manutenção.' });
  }
};

module.exports = { alerts, byVehicle, update, markDone };
