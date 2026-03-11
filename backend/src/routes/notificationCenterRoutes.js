const router = require('express').Router();
const c = require('../controllers/notificationCenterController');
const { authenticate, requireEmployee, requireAdmin, requireModuleAction } = require('../middleware/auth');

router.use(authenticate, requireEmployee);
router.get('/center', requireModuleAction('integrations', 'view'), c.listCenter);
router.post('/preview', requireModuleAction('integrations', 'view'), c.previewMessage);
router.put('/center', requireAdmin, requireModuleAction('integrations', 'edit'), c.saveCenter);

module.exports = router;
