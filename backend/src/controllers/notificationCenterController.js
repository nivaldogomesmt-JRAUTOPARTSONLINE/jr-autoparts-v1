const {
  loadNotificationCenter,
  updateNotificationCenter,
  resolveNotificationPayload,
  sortEvents,
} = require('../services/notificationCenterService');

const listCenter = async (req, res) => {
  try {
    const center = await loadNotificationCenter();
    return res.json({
      updatedAt: center.updatedAt,
      updatedBy: center.updatedBy,
      events: sortEvents(center.events),
    });
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao carregar central de notificacoes.' });
  }
};

const saveCenter = async (req, res) => {
  try {
    const events = req.body?.events;
    if (!Array.isArray(events) && (typeof events !== 'object' || events === null)) {
      return res.status(400).json({ error: 'Informe events como lista ou objeto.' });
    }

    const updated = await updateNotificationCenter({
      events,
      updatedBy: req.user?.name || req.user?.email || 'system',
    });

    return res.json({
      message: 'Central de notificacoes atualizada com sucesso.',
      updatedAt: updated.updatedAt,
      updatedBy: updated.updatedBy,
      events: sortEvents(updated.events),
    });
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao salvar central de notificacoes.' });
  }
};

const previewMessage = async (req, res) => {
  try {
    const {
      eventKey,
      variables = {},
      fallbackContent = '',
      fallbackDedupeHours = 24,
    } = req.body || {};

    if (!eventKey && !fallbackContent) {
      return res.status(400).json({ error: 'Informe eventKey ou fallbackContent para gerar previa.' });
    }

    const resolved = await resolveNotificationPayload({
      eventKey,
      variables,
      fallbackContent,
      fallbackDedupeHours,
    });

    return res.json(resolved);
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao gerar previa da notificacao.' });
  }
};

module.exports = {
  listCenter,
  saveCenter,
  previewMessage,
};
