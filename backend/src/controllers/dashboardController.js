const prisma = require('../lib/prisma');

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
    ]);

    // Revenue this month
    const monthlyRevenue = await prisma.serviceOrder.aggregate({
      where: { status: { in: ['DONE', 'DELIVERED'] }, updatedAt: { gte: startOfMonth } },
      _sum: { totalPrice: true },
    });

    const STATUS_LABELS = {
      QUOTE: 'Orçamento', APPROVED: 'Aprovado', STARTED: 'Iniciado',
      IN_PROGRESS: 'Em Execução', WAITING_PART: 'Aguardando Peça',
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
    });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao carregar dashboard.' });
  }
};

module.exports = { getDashboard };
