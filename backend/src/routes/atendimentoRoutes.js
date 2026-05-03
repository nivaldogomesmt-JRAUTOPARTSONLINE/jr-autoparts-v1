const router = require('express').Router();
const c = require('../controllers/atendimentoController');
const { authenticate, requireEmployee } = require('../middleware/auth');

// Webhook do BotConversa - publico (validado por secret no header se quiser)
router.post('/cliente', c.clienteMensagem);
router.post('/cliente-foto', c.clienteComFoto);

// Rotas administrativas
router.use(authenticate, requireEmployee);
router.get('/rascunhos', c.listarRascunhos);
router.post('/rascunhos/:id/aprovar', c.aprovarERevisar);
router.post('/rascunhos/:id/rejeitar', c.rejeitar);

module.exports = router;
