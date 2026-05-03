const router = require('express').Router();
const c = require('../controllers/botController');
const { authenticateBot } = require('../middleware/auth');
const { createRateLimit } = require('../middleware/rateLimit');

router.use(createRateLimit({
  windowMs: 60 * 1000,
  max: 60,
  keyPrefix: 'bot',
  message: 'Muitas consultas do bot. Aguarde alguns instantes.',
}));
router.use(authenticateBot);
router.get('/products', c.searchProducts);
router.get('/so', c.checkSO);
router.get('/portal-link', c.clientPortalLink);

module.exports = router;


// ── Bot webhook endpoints (added by bot-impl) ────────────────────────────────
const botWebhookController = require('../controllers/botWebhookController');

router.post('/triage',                botWebhookController.triage);
router.post('/boleto/resolve-client', botWebhookController.resolveClientForBoleto);
router.post('/boleto/open',           botWebhookController.openBoletos);
router.post('/service-intake',        botWebhookController.serviceIntake);
router.post('/towing-intake',         botWebhookController.towingIntake);
router.post('/tracking-install',      botWebhookController.trackingInstall);
router.post('/tracking-support',      botWebhookController.trackingSupport);
router.post('/handoff',               botWebhookController.handoff);
