const router = require('express').Router();
const c = require('../controllers/integrationLogController');
const { authenticate, requireEmployee, requireModuleAction } = require('../middleware/auth');

router.use(authenticate, requireEmployee);
router.get('/logs', requireModuleAction('integrations', 'view'), c.listLogs);
router.post('/logs', requireModuleAction('integrations', 'add'), c.createLog);

module.exports = router;
