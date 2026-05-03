const svc = require('../services/leadService');
const prisma = require('../lib/prisma');

async function summary(_req, res) {
  try {
    res.json(await svc.summary());
  } catch (err) { res.status(500).json({ error: err.message }); }
}

async function list(req, res) {
  try {
    res.json(await svc.listLeads(req.query));
  } catch (err) { res.status(500).json({ error: err.message }); }
}

async function get(req, res) {
  try {
    const lead = await prisma.lead.findUnique({ where: { id: req.params.id } });
    if (!lead) return res.status(404).json({ error: 'Lead não encontrado.' });
    res.json(lead);
  } catch (err) { res.status(500).json({ error: err.message }); }
}

async function create(req, res) {
  try {
    const { phone, name, source = 'manual', notes, intentJson, estimatedValue } = req.body || {};
    if (!phone) return res.status(400).json({ error: 'Telefone obrigatório' });
    const lead = await prisma.lead.create({
      data: {
        phone,
        name: name || null,
        source,
        stage: 'NEW',
        score: 5,
        lastContact: new Date(),
        notes: notes || null,
        intentJson: intentJson || null,
        estimatedValue: estimatedValue || null,
      },
    });
    res.status(201).json(lead);
  } catch (err) { res.status(500).json({ error: err.message }); }
}

async function moveStage(req, res) {
  try {
    const { stage } = req.body || {};
    if (!stage) return res.status(400).json({ error: 'stage obrigatório' });
    const lead = await svc.moveStage(req.params.id, stage, req.user?.email);
    res.json(lead);
  } catch (err) { res.status(400).json({ error: err.message }); }
}

async function update(req, res) {
  try {
    const lead = await svc.update(req.params.id, req.body || {});
    res.json(lead);
  } catch (err) { res.status(500).json({ error: err.message }); }
}

async function followups(_req, res) {
  try {
    const leads = await svc.leadsParados(2);
    res.json({ count: leads.length, leads });
  } catch (err) { res.status(500).json({ error: err.message }); }
}

module.exports = { summary, list, get, create, moveStage, update, followups };
