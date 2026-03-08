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
