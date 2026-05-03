const router = require('express').Router();
const c = require('../controllers/auditController');
const { authenticate, requireEmployee } = require('../middleware/auth');
router.use(authenticate, requireEmployee);
router.get('/log', c.list);
router.post('/digest-now', c.digest);
module.exports = router;
