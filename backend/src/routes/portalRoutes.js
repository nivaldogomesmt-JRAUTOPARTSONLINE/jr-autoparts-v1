const router = require('express').Router();
const c = require('../controllers/portalController');
const { authenticateClient } = require('../middleware/auth');

router.use(authenticateClient);
router.get('/me', c.me);
router.get('/vehicles/:vehicleId', c.vehicleDetail);
router.get('/so/:soId', c.soDetail);

module.exports = router;
