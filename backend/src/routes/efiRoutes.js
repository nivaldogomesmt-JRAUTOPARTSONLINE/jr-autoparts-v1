const router = require('express').Router();
const c = require('../controllers/efiController');
const { authenticate, requireEmployee, requireModuleAction } = require('../middleware/auth');

router.use(authenticate, requireEmployee);
router.get('/boletos', requireModuleAction('integrations', 'view'), c.listBoletos);

module.exports = router;
