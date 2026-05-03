const svc = require('../services/auditService');
const prisma = require('../lib/prisma');

async function list(req, res) {
  try {
    const where = {};
    if (req.query.eventType) where.eventType = req.query.eventType;
    if (req.query.severity) where.severity = req.query.severity;
    const items = await prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, take: 200 });
    res.json(items);
  } catch (err) { res.status(500).json({ error: err.message }); }
}

async function digest(req, res) {
  try {
    const min = parseInt(req.query.minutos) || 30;
    res.json(await svc.notifyDigest(min));
  } catch (err) { res.status(500).json({ error: err.message }); }
}

module.exports = { list, digest };
