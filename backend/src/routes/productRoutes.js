const router = require('express').Router();
const c = require('../controllers/productController');
const { authenticate, requireEmployee } = require('../middleware/auth');
const { upload } = require('../services/uploadService');

router.get('/', authenticate, requireEmployee, c.list);
router.post('/', authenticate, requireEmployee, upload.single('photo'), c.create);
router.get('/:id', authenticate, requireEmployee, c.get);
router.put('/:id', authenticate, requireEmployee, upload.single('photo'), c.update);
router.delete('/:id', authenticate, requireEmployee, c.remove);

module.exports = router;
