const router = require('express').Router();
const c = require('../controllers/messageController');
const { authenticate, requireEmployee, requireAction } = require('../middleware/auth');

router.use(authenticate, requireEmployee);
router.get('/', c.list);
router.post('/send', requireAction('add'), c.send);
router.post('/:id/resend', requireAction('edit'), c.resend);

module.exports = router;
