const router = require('express').Router();
const c = require('../controllers/evolutionController');
const { authenticate, requireAdmin } = require('../middleware/auth');

router.use(authenticate, requireAdmin);

router.get('/status', c.getStatus);
router.post('/create-instance', c.createInstance);
router.get('/qrcode', c.getQrCode);
router.post('/set-webhook', c.setWebhook);
router.delete('/logout', c.logoutInstance);
router.post('/disconnect-reset', c.disconnectAndReset);

module.exports = router;
