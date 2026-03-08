const prisma = require('../lib/prisma');

const MAINTENANCE_DEFAULTS = [
  { type: 'oil',         label: 'Troca de Óleo',             intervalKm: 5000,  intervalMonths: 6  },
  { type: 'belt',        label: 'Correia Dentada',           intervalKm: 60000, intervalMonths: 48 },
  { type: 'air_filter',  label: 'Filtro de Ar',              intervalKm: 15000, intervalMonths: 12 },
  { type: 'fuel_filter', label: 'Filtro de Combustível',     intervalKm: 15000, intervalMonths: 12 },
  { type: 'brake',       label: 'Pastilhas de Freio',        intervalKm: 30000, intervalMonths: null },
  { type: 'battery',     label: 'Bateria',                   intervalKm: null,  intervalMonths: 36 },
  { type: 'coolant',     label: 'Fluido de Arrefecimento',   intervalKm: null,  intervalMonths: 24 },
  { type: 'brake_fluid', label: 'Fluido de Freio',           intervalKm: null,  intervalMonths: 24 },
  { type: 'tires',       label: 'Pneus',                     intervalKm: 40000, intervalMonths: null },
];

// GET /api/vehicles
const list = async (req, res) => {
  try {
    const { search, clientId, page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
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
        take: parseInt(limit),
      }),
      prisma.vehicle.count({ where }),
    ]);

    res.json({ data: vehicles, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao listar veículos.' });
  }
};

// GET /api/vehicles/:id
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
    if (!vehicle) return res.status(404).json({ error: 'Veículo não encontrado.' });
    res.json(vehicle);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar veículo.' });
  }
};

// POST /api/vehicles
const create = async (req, res) => {
  try {
    const { clientId, plate, brand, model, year, color, fuel, currentKm, notes } = req.body;
    if (!clientId || !plate || !brand || !model) {
      return res.status(400).json({ error: 'Cliente, placa, marca e modelo são obrigatórios.' });
    }

    const vehicle = await prisma.vehicle.create({
      data: {
        clientId,
        plate: plate.toUpperCase().trim(),
        brand,
        model,
        year: year ? parseInt(year) : null,
        color,
        fuel,
        currentKm: currentKm ? parseInt(currentKm) : null,
        notes,
      },
    });

    // Criar manutenções preventivas padrão
    await prisma.preventiveMaintenance.createMany({
      data: MAINTENANCE_DEFAULTS.map(m => ({ vehicleId: vehicle.id, ...m })),
      skipDuplicates: true,
    });

    res.status(201).json(vehicle);
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'Placa já cadastrada.' });
    res.status(500).json({ error: 'Erro ao cadastrar veículo.' });
  }
};

// PUT /api/vehicles/:id
const update = async (req, res) => {
  try {
    const { plate, brand, model, year, color, fuel, currentKm, notes } = req.body;
    const vehicle = await prisma.vehicle.update({
      where: { id: req.params.id },
      data: {
        plate: plate?.toUpperCase().trim(),
        brand, model,
        year: year ? parseInt(year) : undefined,
        color, fuel,
        currentKm: currentKm ? parseInt(currentKm) : undefined,
        notes,
      },
    });
    res.json(vehicle);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao atualizar veículo.' });
  }
};

// DELETE /api/vehicles/:id
const remove = async (req, res) => {
  try {
    await prisma.vehicle.update({ where: { id: req.params.id }, data: { active: false } });
    res.json({ message: 'Veículo desativado.' });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao desativar veículo.' });
  }
};

// GET /api/vehicles/:id/history
const history = async (req, res) => {
  try {
    const orders = await prisma.serviceOrder.findMany({
      where: { vehicleId: req.params.id, status: { in: ['DONE', 'DELIVERED'] } },
      include: { items: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar histórico.' });
  }
};

module.exports = { list, get, create, update, remove, history };
