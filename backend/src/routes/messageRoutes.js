const router = require('express').Router();
const c = require('../controllers/messageController');
const { authenticate, requireEmployee } = require('../middleware/auth');

router.use(authenticate, requireEmployee);
router.get('/', c.list);
router.post('/send', c.send);
router.post('/:id/resend', c.resend);

module.exports = router;
