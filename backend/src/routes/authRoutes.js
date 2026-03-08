const router = require('express').Router();
const { login, me, changePassword, createUser, listUsers } = require('../controllers/authController');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { createRateLimit } = require('../middleware/rateLimit');

router.post('/login', createRateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyPrefix: 'auth-login',
  message: 'Muitas tentativas de login. Aguarde alguns minutos e tente novamente.',
}), login);
router.get('/me', authenticate, me);
router.put('/change-password', authenticate, changePassword);
router.post('/users', authenticate, requireAdmin, createUser);
router.get('/users', authenticate, requireAdmin, listUsers);

module.exports = router;
