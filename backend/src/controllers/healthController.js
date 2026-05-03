const svc = require('../services/healthService');
const prisma = require('../lib/prisma');

async function overview(_req, res) {
  try {
    const [services, ollama, dbCounts] = await Promise.all([
      svc.checkServices(),
      svc.ollamaStatus(),
      prisma.$queryRawUnsafe(`
        SELECT
          (SELECT count(*)::int FROM clients) as clientes,
          (SELECT count(*)::int FROM vehicles) as veiculos,
          (SELECT count(*)::int FROM products) as produtos,
          (SELECT count(*)::int FROM service_orders) as ordens_servico,
          (SELECT count(*)::int FROM service_orders WHERE status NOT IN ('DELIVERED','DONE')) as os_abertas,
          (SELECT count(*)::int FROM olx_ads) as olx_anuncios,
          (SELECT count(*)::int FROM olx_leads WHERE status='NEW') as olx_leads_novos
      `).catch(() => [{}]),
    ]);

    res.json({
      timestamp: new Date().toISOString(),
      services,
      ollama,
      database: dbCounts[0] || {},
      summary: {
        servicesOk: services.filter(s => s.ok).length,
        servicesTotal: services.length,
        avgLatencyMs: Math.round(services.reduce((s, x) => s + (x.latencyMs || 0), 0) / services.length),
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = { overview };
