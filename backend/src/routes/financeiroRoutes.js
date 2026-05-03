const router = require('express').Router();
const c = require('../controllers/financeiroController');
const { authenticate, requireEmployee, requireModuleAction } = require('../middleware/auth');
router.use(authenticate, requireEmployee);
router.get('/overview', requireModuleAction('billing', 'view'), c.overview);
module.exports = router;
