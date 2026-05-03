const svc = require('../services/cobrancaService');

const list = async (req, res) => {
  try {
    const data = await svc.listar({ status: req.query.status, leva: req.query.leva });
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: 'Falha ao consultar webhook', detalhe: err?.response?.data || err.message });
  }
};

const summary = async (_req, res) => {
  try { res.json(await svc.resumo()); }
  catch (err) { res.status(502).json({ error: err.message }); }
};

const events = async (req, res) => {
  try { res.json(await svc.eventos(req.params.id)); }
  catch (err) { res.status(502).json({ error: err.message }); }
};

const markNegotiated = async (req, res) => {
  try {
    const { id } = req.params;
    const { observacao } = req.body || {};
    const data = await svc.marcarNegociada(id, observacao);
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
};

const resendMessage = async (req, res) => {
  try {
    const { id } = req.params;
    const { msg } = req.body || {};
    if (!msg) return res.status(400).json({ error: 'msg obrigatorio' });
    const data = await svc.reenviar(id, msg);
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
};

module.exports = { list, summary, events, markNegotiated, resendMessage };
