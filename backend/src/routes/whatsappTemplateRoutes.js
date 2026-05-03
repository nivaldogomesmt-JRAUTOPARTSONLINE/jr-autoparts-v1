const router = require('express').Router();
const c = require('../controllers/whatsappTemplateController');
const { authenticate, requireEmployee, requireModuleAction } = require('../middleware/auth');

router.use(authenticate, requireEmployee);
router.get('/',         requireModuleAction('integrations', 'view'), c.list);
router.get('/:id/preview', requireModuleAction('integrations', 'view'), c.preview);
router.put('/:id',      requireModuleAction('integrations', 'edit'), c.update);

module.exports = router;
