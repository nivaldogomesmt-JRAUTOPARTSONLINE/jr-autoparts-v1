const router = require('express').Router();
const c = require('../controllers/serviceController');
const { authenticate, requireEmployee, requireModuleAction } = require('../middleware/auth');

router.use(authenticate, requireEmployee);
router.get('/', requireModuleAction('services', 'view'), c.list);
router.get('/overview', requireModuleAction('services', 'view'), c.overview);
router.post('/', requireModuleAction('services', 'add'), c.create);
router.get('/:id', requireModuleAction('services', 'view'), c.get);
router.put('/:id', requireModuleAction('services', 'edit'), c.update);
router.delete('/:id', requireModuleAction('services', 'delete'), c.remove);

module.exports = router;
