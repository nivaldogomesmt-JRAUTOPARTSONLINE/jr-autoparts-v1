const router = require('express').Router();
const c = require('../controllers/healthController');
const { authenticate, requireEmployee } = require('../middleware/auth');

router.use(authenticate, requireEmployee);
router.get('/overview', c.overview);

module.exports = router;
