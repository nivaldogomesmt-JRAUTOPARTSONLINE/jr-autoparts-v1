const router = require('express').Router();
const c = require('../controllers/productController');
const { authenticate, requireEmployee, requireAction } = require('../middleware/auth');
const { upload } = require('../services/uploadService');
const multer = require('multer');

const uploadXml = multer({ storage: multer.memoryStorage() });

router.get('/', authenticate, requireEmployee, c.list);
router.post('/import/xml', authenticate, requireEmployee, requireAction('add'), uploadXml.single('xml'), c.importXml);
router.post('/', authenticate, requireEmployee, requireAction('add'), upload.single('photo'), c.create);
router.get('/:id', authenticate, requireEmployee, c.get);
router.put('/:id', authenticate, requireEmployee, requireAction('edit'), upload.single('photo'), c.update);
router.delete('/:id', authenticate, requireEmployee, requireAction('delete'), c.remove);

module.exports = router;
