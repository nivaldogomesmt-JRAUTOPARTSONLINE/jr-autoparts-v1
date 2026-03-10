const router = require('express').Router();
const c = require('../controllers/soController');
const { authenticate, requireEmployee, requireAction } = require('../middleware/auth');

router.use(authenticate, requireEmployee);
router.get('/', c.list);
router.post('/', requireAction('add'), c.create);
router.get('/:id', c.get);
router.put('/:id', requireAction('edit'), c.update);
router.put('/:id/status', requireAction('edit'), c.updateStatus);

module.exports = router;
