const router = require('express').Router();
const c = require('../controllers/evolutionWebhookController');

router.post('/', c.receive);

module.exports = router;
