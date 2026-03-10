const prisma = require('../lib/prisma');
const { uploadToCloudinary, deleteFromCloudinary } = require('../services/uploadService');

const MAINTENANCE_DEFAULTS = [
  { type: 'oil',         label: 'Troca de Oleo',             intervalKm: 10000, intervalMonths: 6  },
  { type: 'belt',        label: 'Correia Dentada',           intervalKm: 60000, intervalMonths: 48 },
  { type: 'air_filter',  label: 'Filtro de Ar',              intervalKm: 15000, intervalMonths: 12 },
  { type: 'fuel_filter', label: 'Filtro de Combustivel',     intervalKm: 15000, intervalMonths: 12 },
  { type: 'brake',       label: 'Pastilhas de Freio',        intervalKm: 30000, intervalMonths: null },
  { type: 'battery',     label: 'Bateria',                   intervalKm: null,  intervalMonths: 36 },
  { type: 'coolant',     label: 'Fluido de Arrefecimento',   intervalKm: null,  intervalMonths: 24 },
  { type: 'brake_fluid', label: 'Fluido de Freio',           intervalKm: null,  intervalMonths: 24 },
  { type: 'tires',       label: 'Pneus',                     intervalKm: 40000, intervalMonths: null },
];

function intOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = parseInt(value, 10);
  return Number.isNaN(n) ? null : n;
}

function parseMaintenanceConfig(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return {};
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

function buildMaintenanceDefaults(config = {}) {
  const oilKm = intOrNull(config.oilIntervalKm);
  const oilMonths = intOrNull(config.oilIntervalMonths);
  const beltKm = intOrNull(config.beltIntervalKm);
  const beltMonths = intOrNull(config.beltIntervalMonths);

  return MAINTENANCE_DEFAULTS.map((m) => {
    if (m.type === 'oil') {
      return {
        ...m,
        intervalKm: oilKm ?? m.intervalKm,
        intervalMonths: oilMonths ?? m.intervalMonths,
      };
    }
    if (m.type === 'belt') {
      return {
        ...m,
        intervalKm: beltKm ?? m.intervalKm,
        intervalMonths: beltMonths ?? m.intervalMonths,
      };
    }
    return m;
  });
}

async function applyMaintenanceConfig(tx, vehicleId, config = {}) {
  const oilKm = intOrNull(config.oilIntervalKm);
  const oilMonths = intOrNull(config.oilIntervalMonths);
  const beltKm = intOrNull(config.beltIntervalKm);
  const beltMonths = intOrNull(config.beltIntervalMonths);

  const updates = [];

  if (oilKm !== null || oilMonths !== null) {
    updates.push(
      tx.preventiveMaintenance.findFirst({ where: { vehicleId, type: 'oil' } }).then(async (row) => {
        if (!row) return;
        const nextKm = oilKm !== null && row.lastKm !== null ? row.lastKm + oilKm : row.nextKm;
        let nextDate = row.nextDate;
        if (oilMonths !== null && row.lastDate) {
          const d = new Date(row.lastDate);
          d.setMonth(d.getMonth() + oilMonths);
          nextDate = d;
        }
        await tx.preventiveMaintenance.update({
          where: { id: row.id },
          data: {
            intervalKm: oilKm !== null ? oilKm : row.intervalKm,
            intervalMonths: oilMonths !== null ? oilMonths : row.intervalMonths,
            nextKm,
            nextDate,
          },
        });
      })
    );
  }

  if (beltKm !== null || beltMonths !== null) {
    updates.push(
      tx.preventiveMaintenance.findFirst({ where: { vehicleId, type: 'belt' } }).then(async (row) => {
        if (!row) return;
        const nextKm = beltKm !== null && row.lastKm !== null ? row.lastKm + beltKm : row.nextKm;
        let nextDate = row.nextDate;
        if (beltMonths !== null && row.lastDate) {
          const d = new Date(row.lastDate);
          d.setMonth(d.getMonth() + beltMonths);
          nextDate = d;
        }
        await tx.preventiveMaintenance.update({
          where: { id: row.id },
          data: {
            intervalKm: beltKm !== null ? beltKm : row.intervalKm,
            intervalMonths: beltMonths !== null ? beltMonths : row.intervalMonths,
            nextKm,
            nextDate,
          },
        });
      })
    );
  }

  await Promise.all(updates);
}

const list = async (req, res) => {
  try {
    const { search, clientId, page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const where = {
      active: true,
      ...(clientId && { clientId }),
      ...(search && {
        OR: [
          { plate: { contains: search.toUpperCase() } },
          { brand: { contains: search, mode: 'insensitive' } },
          { model: { contains: search, mode: 'insensitive' } },
          { client: { name: { contains: search, mode: 'insensitive' } } },
        ],
      }),
    };

    const [vehicles, total] = await Promise.all([
      prisma.vehicle.findMany({
        where,
        include: {
          client: { select: { id: true, name: true, phone: true } },
          _count: { select: { serviceOrders: true } },
        },
        orderBy: { plate: 'asc' },
        skip,
        take: parseInt(limit, 10),
      }),
      prisma.vehicle.count({ where }),
    ]);

    res.json({ data: vehicles, total, page: parseInt(page, 10), pages: Math.ceil(total / parseInt(limit, 10)) });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao listar veiculos.' });
  }
};

const get = async (req, res) => {
  try {
    const vehicle = await prisma.vehicle.findUnique({
      where: { id: req.params.id },
      include: {
        client: true,
        maintenances: { orderBy: { type: 'asc' } },
        serviceOrders: {
          where: { status: { not: 'QUOTE' } },
          orderBy: { createdAt: 'desc' },
          take: 20,
          include: {
            items: true,
            statusLogs: { orderBy: { createdAt: 'asc' } },
          },
        },
      },
    });
    if (!vehicle) return res.status(404).json({ error: 'Veiculo nao encontrado.' });
    res.json(vehicle);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar veiculo.' });
  }
};

const create = async (req, res) => {
  try {
    const { clientId, plate, brand, model, year, color, fuel, currentKm, notes } = req.body;
    const maintenanceConfig = parseMaintenanceConfig(req.body.maintenanceConfig);

    if (!clientId || !plate || !brand || !model) {
      return res.status(400).json({ error: 'Cliente, placa, marca e modelo sao obrigatorios.' });
    }

    const vehicle = await prisma.$transaction(async (tx) => {
      const created = await tx.vehicle.create({
        data: {
          clientId,
          plate: plate.toUpperCase().trim(),
          brand,
          model,
          year: year ? parseInt(year, 10) : null,
          color,
          fuel,
          currentKm: currentKm ? parseInt(currentKm, 10) : null,
          notes,
        },
      });

      const defaults = buildMaintenanceDefaults(maintenanceConfig || {});
      await tx.preventiveMaintenance.createMany({
        data: defaults.map((m) => ({ vehicleId: created.id, ...m })),
        skipDuplicates: true,
      });

      return created;
    });

    res.status(201).json(vehicle);
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'Placa ja cadastrada.' });
    res.status(500).json({ error: 'Erro ao cadastrar veiculo.' });
  }
};

const update = async (req, res) => {
  try {
    const { plate, brand, model, year, color, fuel, currentKm, notes } = req.body;
    const maintenanceConfig = parseMaintenanceConfig(req.body.maintenanceConfig);

    const vehicle = await prisma.$transaction(async (tx) => {
      const updated = await tx.vehicle.update({
        where: { id: req.params.id },
        data: {
          plate: plate?.toUpperCase().trim(),
          brand,
          model,
          year: year ? parseInt(year, 10) : undefined,
          color,
          fuel,
          currentKm: currentKm ? parseInt(currentKm, 10) : undefined,
          notes,
        },
      });

      if (maintenanceConfig && Object.keys(maintenanceConfig).length) {
        await applyMaintenanceConfig(tx, req.params.id, maintenanceConfig);
      }

      return updated;
    });

    res.json(vehicle);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao atualizar veiculo.' });
  }
};

const uploadPhoto = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Envie uma imagem do veiculo.' });

    const current = await prisma.vehicle.findUnique({ where: { id: req.params.id }, select: { id: true, photoUrl: true } });
    if (!current) return res.status(404).json({ error: 'Veiculo nao encontrado.' });

    const photoUrl = await uploadToCloudinary(req.file, 'jr-autoparts/vehicles');

    if (current.photoUrl) {
      const publicId = extractCloudinaryPublicId(current.photoUrl);
      if (publicId) await deleteFromCloudinary(publicId).catch(() => {});
    }

    const vehicle = await prisma.vehicle.update({
      where: { id: req.params.id },
      data: { photoUrl },
      select: { id: true, photoUrl: true },
    });

    return res.json(vehicle);
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao enviar foto do veiculo.' });
  }
};

const remove = async (req, res) => {
  try {
    await prisma.vehicle.update({ where: { id: req.params.id }, data: { active: false } });
    res.json({ message: 'Veiculo desativado.' });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao desativar veiculo.' });
  }
};

const history = async (req, res) => {
  try {
    const orders = await prisma.serviceOrder.findMany({
      where: { vehicleId: req.params.id, status: { in: ['DONE', 'DELIVERED'] } },
      include: { items: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar historico.' });
  }
};

module.exports = { list, get, create, update, uploadPhoto, remove, history };
