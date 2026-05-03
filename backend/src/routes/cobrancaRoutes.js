const router = require('express').Router();
const c = require('../controllers/cobrancaController');
const { authenticate, requireEmployee, requireModuleAction } = require('../middleware/auth');

// Todas as rotas exigem login
router.use(authenticate, requireEmployee);

// Visualizar (admin sempre, ou modulo billing.view)
router.get('/',          requireModuleAction('billing', 'view'), c.list);
router.get('/resumo',    requireModuleAction('billing', 'view'), c.summary);
router.get('/:id/eventos', requireModuleAction('billing', 'view'), c.events);

// Acoes (admin sempre, ou modulo billing.edit)
router.post('/:id/negociada', requireModuleAction('billing', 'edit'), c.markNegotiated);
router.post('/:id/reenviar',  requireModuleAction('billing', 'edit'), c.resendMessage);

module.exports = router;
