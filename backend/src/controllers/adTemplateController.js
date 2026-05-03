const svc = require('../services/adTemplateService');

async function search(req, res) {
  try {
    const q = String(req.query.q || '').trim();
    const limit = Math.min(parseInt(req.query.limit) || 5, 20);
    if (!q) return res.json([]);
    res.json(await svc.findSimilar(q, limit));
  } catch (err) { res.status(500).json({ error: err.message }); }
}

async function get(req, res) {
  try {
    const t = await svc.getById(req.params.id);
    if (!t) return res.status(404).json({ error: 'Template nao encontrado.' });
    res.json(t);
  } catch (err) { res.status(500).json({ error: err.message }); }
}

async function listByBrand(req, res) {
  try { res.json(await svc.listByBrand(req.params.brand)); }
  catch (err) { res.status(500).json({ error: err.message }); }
}

async function categories(_req, res) {
  try { res.json(await svc.categories()); }
  catch (err) { res.status(500).json({ error: err.message }); }
}

module.exports = { search, get, listByBrand, categories };
