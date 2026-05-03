const svc = require('../services/financeiroService');
async function overview(_req, res) {
  try { res.json(await svc.overview()); }
  catch (err) { res.status(500).json({ error: err.message }); }
}
module.exports = { overview };
