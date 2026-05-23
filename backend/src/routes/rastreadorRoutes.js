const router = require('express').Router();
const c = require('../controllers/rastreadorController');
const { authenticate, requireEmployee, requireModuleAction } = require('../middleware/auth');

// Reutiliza as permissoes do modulo de rastreamento ("tracking").
router.use(authenticate, requireEmployee);

router.get('/status', requireModuleAction('tracking', 'view'), c.status);
router.post('/enviar', requireModuleAction('tracking', 'edit'), c.enviar);

module.exports = router;
