const router = require('express').Router();
const c = require('../controllers/personalController');
const { authenticate, requireEmployee, requireManageUsers } = require('../middleware/auth');

// Webhook do Evolution NÃO tem auth (Evolution chama)
router.post('/webhook',           c.webhookEvolution);

router.use(authenticate, requireEmployee, requireManageUsers);

// Resto: só admin (Junior)
router.get('/summary',            c.summary);
router.get('/contacts',           c.listContacts);
router.post('/contacts',          c.createContact);
router.delete('/contacts/:id',    c.deleteContact);
router.get('/rules',              c.listRules);
router.put('/rules/:topic',       c.updateRule);
router.get('/messages',           c.listMessages);

module.exports = router;
