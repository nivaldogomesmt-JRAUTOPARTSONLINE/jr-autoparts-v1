const { appendIntegrationLog, listIntegrationLogs } = require('../services/integrationLogService');

const listLogs = async (req, res) => {
  try {
    const { search = '', page = 1, limit = 50 } = req.query;
    const result = await listIntegrationLogs({ search, page, limit });
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao listar logs de integracoes.' });
  }
};

const createLog = async (req, res) => {
  try {
    const { area, user, quantity, failures, reason, meta } = req.body || {};
    if (!String(area || '').trim()) {
      return res.status(400).json({ error: 'Campo area e obrigatorio.' });
    }

    const entry = await appendIntegrationLog(
      { area, user, quantity, failures, reason, meta },
      req.user?.name || req.user?.email || 'system'
    );

    return res.status(201).json({ message: 'Log registrado.', entry });
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao registrar log de integracoes.' });
  }
};

module.exports = {
  listLogs,
  createLog,
};
