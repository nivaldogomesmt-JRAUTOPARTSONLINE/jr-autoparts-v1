const router = require('express').Router();
const c = require('../controllers/vehicleController');
const { authenticate, requireEmployee, requireAction } = require('../middleware/auth');

router.use(authenticate, requireEmployee);
router.get('/', c.list);
router.post('/', requireAction('add'), c.create);
router.get('/:id', c.get);
router.put('/:id', requireAction('edit'), c.update);
router.delete('/:id', requireAction('delete'), c.remove);
router.get('/:id/history', c.history);

module.exports = router;
