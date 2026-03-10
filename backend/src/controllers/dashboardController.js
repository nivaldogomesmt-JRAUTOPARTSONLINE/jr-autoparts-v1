const prisma = require('../lib/prisma');

function aggregateTopItems(items, limit = 8) {
  const map = new Map();

  for (const item of items) {
    const key = String(item.itemName || '').trim();
    if (!key) continue;

    const quantity = Number(item.quantity || 0);
    const unitPrice = Number(item.unitPrice || 0);
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

// GET /api/dashboard
const getDashboard = async (req, res) => {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const in30days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const [
      totalClients,
      totalVehicles,
      activeOS,
      monthlyOS,
      overdueMaintenances,
      recentOS,
      serviceItems,
      productItems,
    ] = await Promise.all([
      prisma.client.count({ where: { active: true } }),
      prisma.vehicle.count({ where: { active: true } }),
      prisma.serviceOrder.count({ where: { status: { notIn: ['DONE', 'DELIVERED', 'QUOTE'] } } }),
      prisma.serviceOrder.count({ where: { createdAt: { gte: startOfMonth } } }),
      prisma.preventiveMaintenance.count({
        where: {
          OR: [{ nextDate: { lt: now } }, { nextDate: { lte: in30days } }],
          vehicle: { active: true },
        },
      }),
      prisma.serviceOrder.findMany({
        where: { status: { notIn: ['DONE', 'DELIVERED'] } },
        include: {
          client: { select: { name: true } },
          vehicle: { select: { plate: true, brand: true, model: true } },
        },
        orderBy: { updatedAt: 'desc' },
        take: 8,
      }),
      prisma.soItem.findMany({
        where: {
          type: 'SERVICE',
          serviceOrder: { status: { in: ['DONE', 'DELIVERED'] } },
        },
        select: { itemName: true, quantity: true, unitPrice: true },
      }),
      prisma.soItem.findMany({
        where: {
          type: 'PRODUCT',
          serviceOrder: { status: { in: ['DONE', 'DELIVERED'] } },
        },
        select: { itemName: true, quantity: true, unitPrice: true },
      }),
    ]);

    const monthlyRevenue = await prisma.serviceOrder.aggregate({
      where: { status: { in: ['DONE', 'DELIVERED'] }, updatedAt: { gte: startOfMonth } },
      _sum: { totalPrice: true },
    });

    const STATUS_LABELS = {
      QUOTE: 'Orcamento', APPROVED: 'Aprovado', STARTED: 'Iniciado',
      IN_PROGRESS: 'Em Execucao', WAITING_PART: 'Aguardando Peca',
      FINISHING: 'Finalizando', DONE: 'Finalizado', DELIVERED: 'Entregue',
    };

    res.json({
      stats: {
        totalClients,
        totalVehicles,
        activeOS,
        monthlyOS,
        overdueMaintenances,
        monthlyRevenue: parseFloat(monthlyRevenue._sum.totalPrice || 0),
      },
      recentOS: recentOS.map(o => ({ ...o, statusLabel: STATUS_LABELS[o.status] })),
      rankings: {
        topServices: aggregateTopItems(serviceItems, 8),
        topProducts: aggregateTopItems(productItems, 8),
      },
    });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao carregar dashboard.' });
  }
};

module.exports = { getDashboard };
