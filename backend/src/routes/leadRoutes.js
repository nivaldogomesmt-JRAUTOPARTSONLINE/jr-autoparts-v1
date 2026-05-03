const router = require('express').Router();
const c = require('../controllers/leadController');
const { authenticate, requireEmployee, requireModuleAction } = require('../middleware/auth');

router.use(authenticate, requireEmployee);

router.get('/summary',          c.summary);              // kanban + stats
router.get('/followups',        c.followups);            // leads parados
router.get('/',                 c.list);                  // lista com filtros
router.post('/',                c.create);                // cadastro manual
router.get('/:id',              c.get);
router.put('/:id',              c.update);
router.post('/:id/move-stage',  c.moveStage);

module.exports = router;
