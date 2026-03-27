const router = require('express').Router();
const { aiChat } = require('../controllers/botWebhookController');
const { authenticate, requireEmployee } = require('../middleware/auth');
const bc = require('../services/botconversaService');
const prisma = require('../lib/prisma');

// ---------------------------------------------------------------------------
// PUBLIC webhook endpoint — no auth required (called by BotConversa)
// POST /api/botconversa/ai-chat
// Body: { phone, message }
// ---------------------------------------------------------------------------
router.post('/ai-chat', aiChat);

// Todas as rotas abaixo exigem autenticacao de funcionario/admin
router.use(authenticate, requireEmployee);

/**
 * GET /api/botconversa/status
 * Testa conexao e retorna flows, tags, sequences e custom fields disponiveis
 */
router.get('/status', async (req, res) => {
  try {
    const result = await bc.testConnection();
    const config = {
      enabled: bc.isEnabled(),
      envVars: {
        BOTCONVERSA_API_KEY: bc.isEnabled() ? '✓ configurada' : '✗ nao configurada',
        BOTCONVERSA_FLOW_OS_STARTED:       process.env.BOTCONVERSA_FLOW_OS_STARTED       || null,
        BOTCONVERSA_FLOW_OS_IN_PROGRESS:   process.env.BOTCONVERSA_FLOW_OS_IN_PROGRESS   || null,
        BOTCONVERSA_FLOW_OS_WAITING_PART:  process.env.BOTCONVERSA_FLOW_OS_WAITING_PART  || null,
        BOTCONVERSA_FLOW_OS_FINISHING:     process.env.BOTCONVERSA_FLOW_OS_FINISHING      || null,
        BOTCONVERSA_FLOW_OS_DONE:          process.env.BOTCONVERSA_FLOW_OS_DONE           || null,
        BOTCONVERSA_FLOW_OS_DELIVERED:     process.env.BOTCONVERSA_FLOW_OS_DELIVERED      || null,
        BOTCONVERSA_FLOW_PORTAL_ACCESS:    process.env.BOTCONVERSA_FLOW_PORTAL_ACCESS     || null,
        BOTCONVERSA_FLOW_MAINTENANCE_ALERT: process.env.BOTCONVERSA_FLOW_MAINTENANCE_ALERT || null,
        BOTCONVERSA_SEQUENCE_POST_SERVICE: process.env.BOTCONVERSA_SEQUENCE_POST_SERVICE  || null,
        BOTCONVERSA_SEQUENCE_MAINTENANCE:  process.env.BOTCONVERSA_SEQUENCE_MAINTENANCE   || null,
        BOTCONVERSA_TAG_CLIENT_PORTAL:     process.env.BOTCONVERSA_TAG_CLIENT_PORTAL      || null,
        BOTCONVERSA_TAG_MAINTENANCE_OVERDUE: process.env.BOTCONVERSA_TAG_MAINTENANCE_OVERDUE || null,
      },
    };
    res.json({ ...result, config });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao testar conexao BotConversa.' });
  }
});

/**
 * POST /api/botconversa/sync-all
 * Sincroniza todos os clientes ativos para o BotConversa
 * (cria assinantes para quem ainda nao tem)
 */
router.post('/sync-all', async (req, res) => {
  if (req.user?.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Apenas administradores podem sincronizar todos os clientes.' });
  }
  try {
    // Executa em background para nao segurar a requisicao
    res.json({ message: 'Sincronizacao iniciada em background. Acompanhe os logs do servidor.' });
    bc.syncAllClients().then((result) => {
      console.info('[BotConversa] Sync finalizado:', result);
    }).catch((err) => {
      console.error('[BotConversa] Sync error:', err.message);
    });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao iniciar sincronizacao.' });
  }
});

/**
 * POST /api/botconversa/test-message
 * Envia mensagem de teste para um numero especifico
 * Body: { phone, message }
 */
router.post('/test-message', async (req, res) => {
  if (req.user?.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Apenas administradores podem enviar mensagens de teste.' });
  }
  try {
    const { phone, message } = req.body;
    if (!phone || !message) {
      return res.status(400).json({ error: 'phone e message sao obrigatorios.' });
    }
    await bc.sendMessage({ phone, message, firstName: 'Teste' });
    res.json({ message: 'Mensagem enviada com sucesso.' });
  } catch (err) {
    res.status(500).json({ error: `Erro: ${err.message}` });
  }
});

/**
 * GET /api/botconversa/subscribers-synced
 * Retorna quantos clientes ja tem botconversa_subscriber_id salvo
 */
router.get('/subscribers-synced', async (req, res) => {
  try {
    const total = await prisma.client.count({ where: { active: true } });
    const synced = await prisma.client.count({
      where: { active: true, botconversaSubscriberId: { not: null } },
    });
    res.json({ total, synced, pending: total - synced });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar contagem.' });
  }
});

/**
 * POST /api/botconversa/sync-client/:id
 * Sincroniza um cliente especifico para o BotConversa
 */
router.post('/sync-client/:id', async (req, res) => {
  try {
    const client = await prisma.client.findUnique({ where: { id: req.params.id } });
    if (!client) return res.status(404).json({ error: 'Cliente nao encontrado.' });

    const phone = client.whatsapp || client.phone;
    if (!phone) return res.status(400).json({ error: 'Cliente nao tem telefone cadastrado.' });

    const nameParts = (client.name || '').split(' ');
    const subscriberId = await bc.findOrCreateSubscriber({
      clientId: client.id,
      phone,
      firstName: nameParts[0] || '',
      lastName: nameParts.slice(1).join(' ') || '',
    });

    res.json({ ok: true, subscriberId, clientId: client.id, name: client.name });
  } catch (err) {
    res.status(500).json({ error: `Erro: ${err.message}` });
  }
});

module.exports = router;
