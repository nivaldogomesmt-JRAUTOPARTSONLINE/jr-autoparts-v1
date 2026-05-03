// src/controllers/messagingController.js
const router = require('../services/messageRouterService');
const complaints = require('../services/complaintClassifierService');
const prisma = require('../lib/prisma');

// ─── Routing rules ────────────────────────────────────────────────────────
async function listRoutes(_req, res) {
  try { res.json(await router.listRoutes()); }
  catch (e) { res.status(500).json({ error: e.message }); }
}

async function updateRoute(req, res) {
  try {
    const r = await router.updateRoute(req.params.eventType, req.body);
    res.json(r);
  } catch (e) { res.status(500).json({ error: e.message }); }
}

async function testRoute(req, res) {
  try {
    const { eventType, text, customerPhone } = req.body || {};
    if (!eventType || !text) return res.status(400).json({ error: 'eventType e text obrigatórios' });
    const r = await router.route(eventType, { text: '🧪 *TESTE* — ' + text, customerPhone });
    res.json(r);
  } catch (e) { res.status(500).json({ error: e.message }); }
}

// ─── Customer Complaints ──────────────────────────────────────────────────
async function listComplaints(req, res) {
  try { res.json(await complaints.listComplaints(req.query)); }
  catch (e) { res.status(500).json({ error: e.message }); }
}

async function complaintsSummary(_req, res) {
  try { res.json(await complaints.summary()); }
  catch (e) { res.status(500).json({ error: e.message }); }
}

async function updateComplaintStatus(req, res) {
  try {
    const { status, notes } = req.body || {};
    const r = await complaints.updateStatus(req.params.id, status, req.user?.email || 'admin', notes);
    res.json(r);
  } catch (e) { res.status(500).json({ error: e.message }); }
}

async function classifyMessage(req, res) {
  try {
    const { text, customerName } = req.body || {};
    if (!text) return res.status(400).json({ error: 'text obrigatório' });
    const r = await complaints.classify(text, { customerName });
    res.json(r);
  } catch (e) { res.status(500).json({ error: e.message }); }
}

// ─── Internal Alerts ──────────────────────────────────────────────────────
async function listInternalAlerts(req, res) {
  try {
    const alerts = await prisma.$queryRawUnsafe(`
      SELECT * FROM internal_alerts
      ORDER BY created_at DESC LIMIT 100
    `);
    res.json(alerts);
  } catch (e) { res.status(500).json({ error: e.message }); }
}

module.exports = {
  listRoutes, updateRoute, testRoute,
  listComplaints, complaintsSummary, updateComplaintStatus, classifyMessage,
  listInternalAlerts,
};
