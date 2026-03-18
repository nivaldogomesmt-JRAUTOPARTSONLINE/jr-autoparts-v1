const router = require('express').Router();
const c = require('../controllers/portalController');
const { authenticateClient } = require('../middleware/auth');
const { createRateLimit } = require('../middleware/rateLimit');

// Rota publica de login do portal (sem autenticacao)
router.post('/auth/login', createRateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyPrefix: 'portal-login',
  message: 'Muitas tentativas de login. Aguarde alguns minutos e tente novamente.',
}), c.portalLogin);

// Rotas protegidas - requerem token de cliente
router.use(authenticateClient);
router.get('/me', c.me);
router.put('/me', c.updateMe);
router.get('/vehicles/:vehicleId', c.vehicleDetail);
router.get('/so/:soId', c.soDetail);

module.exports = router;

