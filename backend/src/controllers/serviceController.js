const prisma = require('../lib/prisma');
const { normalizeSearchToken, normalizedSqlExpr } = require('../utils/search');

function parseSearchTokens(search) {
  return String(search || '')
    .trim()
    .split(/\s+/)
    .map((v) => v.trim())
    .filter(Boolean)
    .slice(0, 6);
}

function buildServiceSearchWhere(search) {
  const tokens = parseSearchTokens(search);
  if (!tokens.length) return {};

  return {
    AND: tokens.map((token) => ({
      OR: [
        { name: { contains: token, mode: 'insensitive' } },
        { description: { contains: token, mode: 'insensitive' } },
      ],
    })),
  };
}

async function findServiceIdsByAccentSearch(search) {
  const tokens = parseSearchTokens(search)
    .map((token) => normalizeSearchToken(token))
    .filter(Boolean);

  if (!tokens.length) return null;

  const fields = [
    normalizedSqlExpr('s.name'),
    normalizedSqlExpr('s.description'),
  ];

  const params = tokens.map((token) => `%${token}%`);
  const conditions = tokens
    .map((_, idx) => `(${fields.map((field) => `${field} LIKE $${idx + 1}`).join(' OR ')})`)
    .join(' AND ');

  const sql = `
    SELECT s.id
    FROM services s
    WHERE ${conditions}
    LIMIT 12000
  `;

  try {
    const rows = await prisma.$queryRawUnsafe(sql, ...params);
    return rows.map((row) => row.id);
  } catch {
    return null;
  }
}

function aggregateTop(items, mode = 'revenue', limit = 8) {
  const map = new Map();

  for (const item of items) {
    const key = item.serviceId || String(item.itemName || '').trim();
    if (!key) continue;

    const qty = Number(item.quantity || 0);
    const unitPrice = Number(item.unitPrice || 0);
    const revenue = qty * unitPrice;
    const name = String(item.itemName || '').trim() || 'Servico';

    if (!map.has(key)) {
      map.set(key, { key, name, quantity: 0, revenue: 0, count: 0 });
    }

    const row = map.get(key);
    row.quantity += qty;
    row.revenue += revenue;
    row.count += 1;
  }

  return [...map.values()]
    .sort((a, b) => {
      if (mode === 'quantity') {
        if (b.quantity !== a.quantity) return b.quantity - a.quantity;
        return b.revenue - a.revenue;
      }
      if (b.revenue !== a.revenue) return b.revenue - a.revenue;
      return b.quantity - a.quantity;
    })
    .slice(0, limit)
    .map((row, idx) => ({
      rank: idx + 1,
      id: row.key,
      name: row.name,
      quantity: Number(row.quantity.toFixed(3)),
      revenue: Number(row.revenue.toFixed(2)),
      count: row.count,
    }));
}

const list = async (req, res) => {
  try {
    const { search, active } = req.query;
    const accentIds = await findServiceIdsByAccentSearch(search);
    if (Array.isArray(accentIds) && !accentIds.length) {
      return res.json([]);
    }

    const where = {
      ...(active !== undefined ? { active: active === 'true' } : { active: true }),
      ...(Array.isArray(accentIds) ? { id: { in: accentIds } } : buildServiceSearchWhere(search)),
    };
    const services = await prisma.service.findMany({ where, orderBy: { name: 'asc' } });
    return res.json(services);
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao listar servicos.' });
  }
};

const overview = async (req, res) => {
  try {
    const [services, serviceItems] = await Promise.all([
      prisma.service.findMany({ where: { active: true }, orderBy: { name: 'asc' } }),
      prisma.soItem.findMany({
        where: {
          type: 'SERVICE',
          serviceOrder: { status: { in: ['DONE', 'DELIVERED'] } },
        },
        select: {
          serviceId: true,
          itemName: true,
          quantity: true,
          unitPrice: true,
        },
      }),
    ]);

    const usedServiceIds = new Set(serviceItems.map((item) => item.serviceId).filter(Boolean));

    const noSalesRows = services
      .filter((service) => !usedServiceIds.has(service.id))
      .slice(0, 8)
      .map((service) => ({ id: service.id, name: service.name }));

    const slowRows = [...services]
      .filter((service) => Number(service.estimatedTime || 0) > 0)
      .sort((a, b) => Number(b.estimatedTime || 0) - Number(a.estimatedTime || 0))
      .slice(0, 8)
      .map((service) => ({
        id: service.id,
        name: service.name,
        estimatedTime: Number(service.estimatedTime || 0),
        price: Number(service.price || 0),
      }));

    const topByRevenue = aggregateTop(serviceItems, 'revenue', 8);
    const topByQuantity = aggregateTop(serviceItems, 'quantity', 8);

    return res.json({
      totals: {
        services: services.length,
        noSales: noSalesRows.length,
        averagePrice: services.length
          ? Number((services.reduce((sum, s) => sum + Number(s.price || 0), 0) / services.length).toFixed(2))
          : 0,
      },
      rankings: {
        topByRevenue,
        topByQuantity,
      },
      noSalesRows,
      slowRows,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao montar painel gerencial de servicos.' });
  }
};

const get = async (req, res) => {
  try {
    const service = await prisma.service.findUnique({ where: { id: req.params.id } });
    if (!service) return res.status(404).json({ error: 'Servico nao encontrado.' });
    return res.json(service);
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao buscar servico.' });
  }
};

const create = async (req, res) => {
  try {
    const { name, description, price, estimatedTime } = req.body;
    if (!name || !price) return res.status(400).json({ error: 'Nome e preco sao obrigatorios.' });
    const service = await prisma.service.create({
      data: { name, description, price: parseFloat(price), estimatedTime: estimatedTime ? parseInt(estimatedTime, 10) : null },
    });
    return res.status(201).json(service);
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao criar servico.' });
  }
};

const update = async (req, res) => {
  try {
    const { name, description, price, estimatedTime, active } = req.body;
    const service = await prisma.service.update({
      where: { id: req.params.id },
      data: {
        name,
        description,
        price: price ? parseFloat(price) : undefined,
        estimatedTime: estimatedTime ? parseInt(estimatedTime, 10) : undefined,
        active: active !== undefined ? Boolean(active) : undefined,
      },
    });
    return res.json(service);
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao atualizar servico.' });
  }
};

const remove = async (req, res) => {
  try {
    await prisma.service.update({ where: { id: req.params.id }, data: { active: false } });
    return res.json({ message: 'Servico desativado.' });
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao desativar servico.' });
  }
};

module.exports = { list, overview, get, create, update, remove };
