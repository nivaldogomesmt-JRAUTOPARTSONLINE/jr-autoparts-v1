const router = require('express').Router();
const { login, me, changePassword, createUser, updateUser, removeUser, listUsers } = require('../controllers/authController');
const { getUserAccessProfile, updateUserAccessProfile, listUserAccessHistory } = require('../controllers/accessProfileController');
const { authenticate, requireManageUsers } = require('../middleware/auth');
const { createRateLimit } = require('../middleware/rateLimit');

router.post('/login', createRateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyPrefix: 'auth-login',
  message: 'Muitas tentativas de login. Aguarde alguns minutos e tente novamente.',
}), login);

router.get('/me', authenticate, me);
router.put('/change-password', authenticate, changePassword);

router.post('/users', authenticate, requireManageUsers, createUser);
router.get('/users', authenticate, requireManageUsers, listUsers);
router.put('/users/:id', authenticate, requireManageUsers, updateUser);
router.delete('/users/:id', authenticate, requireManageUsers, removeUser);
router.get('/users/:id/access-profile', authenticate, requireManageUsers, getUserAccessProfile);
router.put('/users/:id/access-profile', authenticate, requireManageUsers, updateUserAccessProfile);
router.get('/users/:id/access-history', authenticate, requireManageUsers, listUserAccessHistory);

module.exports = router;
