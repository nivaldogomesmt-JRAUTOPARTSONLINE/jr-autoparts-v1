const prisma = require('../lib/prisma');
const {
  computeMaintenanceForecast,
  getMaintenanceAlertLevel,
  toDateOrNull,
  toIntOrNull,
} = require('../utils/maintenance');
const { sendMaintenanceAlerts } = require('../services/maintenanceNotificationService');

const DEFAULT_MAINTENANCE_ITEMS = [
  { type: 'oil', label: 'Troca de Oleo', intervalKm: 10000, intervalMonths: 6 },
  { type: 'belt', label: 'Correia Dentada', intervalKm: 60000, intervalMonths: 48 },
  { type: 'air_filter', label: 'Filtro de Ar', intervalKm: 15000, intervalMonths: 12 },
  { type: 'fuel_filter', label: 'Filtro de Combustivel', intervalKm: 15000, intervalMonths: 12 },
  { type: 'brake', label: 'Pastilhas de Freio', intervalKm: 30000, intervalMonths: null },
  { type: 'battery', label: 'Bateria', intervalKm: null, intervalMonths: 36 },
  { type: 'coolant', label: 'Fluido de Arrefecimento', intervalKm: null, intervalMonths: 24 },
  { type: 'brake_fluid', label: 'Fluido de Freio', intervalKm: null, intervalMonths: 24 },
  { type: 'tires', label: 'Pneus', intervalKm: 40000, intervalMonths: null },
  { type: 'tracker_install', label: 'Instalacao de Rastreador', intervalKm: null, intervalMonths: null },
];

function intOrNull(value) {
  return toIntOrNull(value);
}

function dateOrNull(value) {
  return toDateOrNull(value);
}

function computeAlertLevel(maintenance, currentKm, options = {}) {
  return getMaintenanceAlertLevel(maintenance, currentKm, options);
}

function recalcNext({
  lastDate,
  lastKm,
  intervalMonths,
  intervalKm,
  currentNextDate,
  currentNextKm,
  baselineDate,
  baselineKm,
}) {
  return computeMaintenanceForecast(
    {
      lastDate,
      lastKm,
      intervalMonths,
      intervalKm,
      nextDate: currentNextDate,
      nextKm: currentNextKm,
    },
    { baselineDate, baselineKm }
  );
}

async function ensureVehicleExists(vehicleId) {
  const vehicle = await prisma.vehicle.findUnique({
    where: { id: vehicleId },
    select: { id: true, plate: true, brand: true, model: true, currentKm: true },
  });
  return vehicle;
}

// GET /api/maintenance/alerts
const alerts = async (req, res) => {
  try {
    const maintenances = await prisma.preventiveMaintenance.findMany({
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
            client: { select: { id: true, name: true, phone: true } },
          },
        },
      },
      orderBy: { label: 'asc' },
    });

    const result = maintenances
      .map((m) => {
        const forecast = computeMaintenanceForecast(m, {
          baselineDate: m.createdAt,
          baselineKm: m.vehicle?.currentKm,
        });

        const normalized = { ...m, ...forecast };

        return {
          ...normalized,
          alertLevel: computeAlertLevel(normalized, m.vehicle?.currentKm),
        };
      })
      .filter((m) => m.alertLevel !== 'OK')
      .sort((a, b) => {
        const order = { OVERDUE: 0, DUE_SOON: 1 };
        return (order[a.alertLevel] || 99) - (order[b.alertLevel] || 99);
      });

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar alertas de manutencao.' });
  }
};

// GET /api/maintenance/vehicle/:vehicleId
const byVehicle = async (req, res) => {
  try {
    const vehicle = await ensureVehicleExists(req.params.vehicleId);
    if (!vehicle) return res.status(404).json({ error: 'Veiculo nao encontrado.' });

    const maintenances = await prisma.preventiveMaintenance.findMany({
      where: { vehicleId: req.params.vehicleId },
      orderBy: { type: 'asc' },
    });

    const result = maintenances.map((m) => {
      const forecast = computeMaintenanceForecast(m, {
        baselineDate: m.createdAt,
        baselineKm: vehicle.currentKm,
      });
      const normalized = { ...m, ...forecast };

      return {
        ...normalized,
        alertLevel: computeAlertLevel(normalized, vehicle.currentKm),
      };
    });

    res.json({ vehicle, maintenances: result });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar manutencoes.' });
  }
};

// PUT /api/maintenance/:id
const update = async (req, res) => {
  try {
    const { intervalKm, intervalMonths, lastDate, lastKm, label } = req.body;

    const current = await prisma.preventiveMaintenance.findUnique({ where: { id: req.params.id } });
    if (!current) return res.status(404).json({ error: 'Manutencao nao encontrada.' });

    const vehicle = await prisma.vehicle.findUnique({
      where: { id: current.vehicleId },
      select: { currentKm: true },
    });

    const effIntervalKm = intervalKm !== undefined ? intOrNull(intervalKm) : current.intervalKm;
    const effIntervalMonths = intervalMonths !== undefined ? intOrNull(intervalMonths) : current.intervalMonths;
    const effLastDate = lastDate !== undefined ? dateOrNull(lastDate) : current.lastDate;
    const effLastKm = lastKm !== undefined ? intOrNull(lastKm) : current.lastKm;

    const { nextDate, nextKm } = recalcNext({
      lastDate: effLastDate,
      lastKm: effLastKm,
      intervalMonths: effIntervalMonths,
      intervalKm: effIntervalKm,
      currentNextDate: current.nextDate,
      currentNextKm: current.nextKm,
      baselineDate: current.createdAt,
      baselineKm: vehicle?.currentKm,
    });

    const maintenance = await prisma.preventiveMaintenance.update({
      where: { id: req.params.id },
      data: {
        label: label !== undefined ? String(label || '').trim() : undefined,
        intervalKm: effIntervalKm,
        intervalMonths: effIntervalMonths,
        lastDate: effLastDate,
        lastKm: effLastKm,
        nextDate,
        nextKm,
      },
    });

    res.json(maintenance);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao atualizar manutencao.' });
  }
};

// POST /api/maintenance/vehicle/:vehicleId/item
const upsertVehicleItem = async (req, res) => {
  try {
    const vehicle = await ensureVehicleExists(req.params.vehicleId);
    if (!vehicle) return res.status(404).json({ error: 'Veiculo nao encontrado.' });

    const { type, label, intervalKm, intervalMonths, lastDate, lastKm } = req.body;
    if (!type || !label) {
      return res.status(400).json({ error: 'type e label sao obrigatorios.' });
    }

    const intervalKmParsed = intOrNull(intervalKm);
    const intervalMonthsParsed = intOrNull(intervalMonths);
    const lastDateParsed = dateOrNull(lastDate);
    const lastKmParsed = intOrNull(lastKm);

    const existing = await prisma.preventiveMaintenance.findFirst({
      where: { vehicleId: vehicle.id, type: String(type).trim() },
    });

    if (!existing) {
      const { nextDate, nextKm } = recalcNext({
        lastDate: lastDateParsed,
        lastKm: lastKmParsed,
        intervalMonths: intervalMonthsParsed,
        intervalKm: intervalKmParsed,
        baselineDate: new Date(),
        baselineKm: vehicle.currentKm,
      });

      const created = await prisma.preventiveMaintenance.create({
        data: {
          vehicleId: vehicle.id,
          type: String(type).trim(),
          label: String(label).trim(),
          intervalKm: intervalKmParsed,
          intervalMonths: intervalMonthsParsed,
          lastDate: lastDateParsed,
          lastKm: lastKmParsed,
          nextDate,
          nextKm,
        },
      });

      return res.status(201).json(created);
    }

    const { nextDate, nextKm } = recalcNext({
      lastDate: lastDate !== undefined ? lastDateParsed : existing.lastDate,
      lastKm: lastKm !== undefined ? lastKmParsed : existing.lastKm,
      intervalMonths: intervalMonths !== undefined ? intervalMonthsParsed : existing.intervalMonths,
      intervalKm: intervalKm !== undefined ? intervalKmParsed : existing.intervalKm,
      currentNextDate: existing.nextDate,
      currentNextKm: existing.nextKm,
      baselineDate: existing.createdAt,
      baselineKm: vehicle.currentKm,
    });

    const updated = await prisma.preventiveMaintenance.update({
      where: { id: existing.id },
      data: {
        label: String(label).trim(),
        intervalKm: intervalKm !== undefined ? intervalKmParsed : existing.intervalKm,
        intervalMonths: intervalMonths !== undefined ? intervalMonthsParsed : existing.intervalMonths,
        lastDate: lastDate !== undefined ? lastDateParsed : existing.lastDate,
        lastKm: lastKm !== undefined ? lastKmParsed : existing.lastKm,
        nextDate,
        nextKm,
      },
    });

    return res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao salvar item de manutencao.' });
  }
};

// POST /api/maintenance/vehicle/:vehicleId/initialize
const initializeVehicle = async (req, res) => {
  try {
    const vehicle = await ensureVehicleExists(req.params.vehicleId);
    if (!vehicle) return res.status(404).json({ error: 'Veiculo nao encontrado.' });

    const existing = await prisma.preventiveMaintenance.findMany({
      where: { vehicleId: vehicle.id },
      select: { type: true },
    });
    const existingTypes = new Set(existing.map((i) => i.type));

    const missing = DEFAULT_MAINTENANCE_ITEMS.filter((item) => !existingTypes.has(item.type));
    if (!missing.length) {
      return res.json({ created: 0, message: 'Itens de manutencao ja estavam completos.' });
    }

    const now = new Date();

    await prisma.preventiveMaintenance.createMany({
      data: missing.map((item) => {
        const forecast = computeMaintenanceForecast(
          {
            intervalKm: item.intervalKm,
            intervalMonths: item.intervalMonths,
          },
          { baselineDate: now, baselineKm: vehicle.currentKm }
        );

        return {
          vehicleId: vehicle.id,
          type: item.type,
          label: item.label,
          intervalKm: item.intervalKm,
          intervalMonths: item.intervalMonths,
          nextDate: forecast.nextDate,
          nextKm: forecast.nextKm,
        };
      }),
      skipDuplicates: true,
    });

    return res.json({ created: missing.length, message: 'Itens de manutencao inicializados.' });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao inicializar manutencoes do veiculo.' });
  }
};

// POST /api/maintenance/vehicle/:vehicleId/mark-done
const markDone = async (req, res) => {
  try {
    const { type, doneDate, doneKm } = req.body;
    if (!type) return res.status(400).json({ error: 'Tipo de manutencao e obrigatorio.' });

    const maintenance = await prisma.preventiveMaintenance.findFirst({
      where: { vehicleId: req.params.vehicleId, type },
    });

    if (!maintenance) return res.status(404).json({ error: 'Manutencao nao encontrada para esse veiculo.' });

    const vehicle = await ensureVehicleExists(req.params.vehicleId);
    const doneDateParsed = doneDate ? new Date(doneDate) : new Date();
    const doneKmParsed = doneKm !== undefined && doneKm !== null && doneKm !== '' ? parseInt(doneKm, 10) : null;

    const { nextDate, nextKm } = recalcNext({
      lastDate: doneDateParsed,
      lastKm: doneKmParsed,
      intervalMonths: maintenance.intervalMonths,
      intervalKm: maintenance.intervalKm,
      currentNextDate: maintenance.nextDate,
      currentNextKm: maintenance.nextKm,
      baselineDate: maintenance.createdAt,
      baselineKm: vehicle?.currentKm,
    });

    const updated = await prisma.preventiveMaintenance.update({
      where: { id: maintenance.id },
      data: {
        lastDate: doneDateParsed,
        lastKm: doneKmParsed,
        nextDate,
        nextKm,
      },
    });

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao registrar manutencao.' });
  }
};


// POST /api/maintenance/notify-run
const notifyNow = async (req, res) => {
  try {
    const dryRun = String(req.query?.dryRun || req.body?.dryRun || '').toLowerCase();
    const dry = ['1', 'true', 'yes', 'sim', 's'].includes(dryRun);
    const limitRaw = req.query?.limit ?? req.body?.limit;
    const parsedLimit = Number.parseInt(String(limitRaw ?? ''), 10);
    const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 3000) : 500;

    const result = await sendMaintenanceAlerts({ dryRun: dry, limit });
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao enviar notificacoes de manutencao.' });
  }
};
module.exports = { alerts, byVehicle, update, upsertVehicleItem, initializeVehicle, markDone, notifyNow };
