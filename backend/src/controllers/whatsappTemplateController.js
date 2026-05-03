const prisma = require('../lib/prisma');
const tplService = require('../services/whatsappTemplateService');

async function list(_req, res) {
  try {
    const items = await prisma.whatsappTemplate.findMany({ orderBy: { eventKey: 'asc' } });
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function update(req, res) {
  try {
    const { id } = req.params;
    const { message, label, active } = req.body || {};
    const data = {};
    if (message !== undefined) data.message = String(message);
    if (label !== undefined) data.label = String(label);
    if (active !== undefined) data.active = !!active;
    const updated = await prisma.whatsappTemplate.update({ where: { id }, data });
    tplService.invalidate();
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function preview(req, res) {
  try {
    const { id } = req.params;
    const t = await prisma.whatsappTemplate.findUnique({ where: { id } });
    if (!t) return res.status(404).json({ error: 'Template não encontrado.' });
    const sampleVars = {
      firstName: 'João',
      number: '1234',
      veiculo: 'Fiat Uno',
      placa: ' (ABC-1234)',
      valorBlock: 'no valor de *R$ 350,00*',
      portalUrl: 'https://app.jrautopartsmt.com.br/portal',
      statusLabel: t.label,
    };
    res.json({ rendered: tplService.render(t.message, sampleVars) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = { list, update, preview };
