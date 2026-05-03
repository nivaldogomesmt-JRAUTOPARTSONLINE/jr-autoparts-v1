const router = require('express').Router();
const c = require('../controllers/productController');
const { authenticate, requireEmployee, requireModuleAction } = require('../middleware/auth');
const { upload } = require('../services/uploadService');
const multer = require('multer');

const uploadXml = multer({ storage: multer.memoryStorage() });

router.get('/', authenticate, requireEmployee, requireModuleAction('products', 'view'), c.list);
router.get('/overview', authenticate, requireEmployee, requireModuleAction('products', 'view'), c.overview);
router.get('/export', authenticate, requireEmployee, requireModuleAction('products', 'export'), c.exportProducts);
router.post('/import/xml', authenticate, requireEmployee, requireModuleAction('products', 'add'), uploadXml.single('xml'), c.importXml);
router.post('/import/xml-text', authenticate, requireEmployee, requireModuleAction('products', 'add'), c.importXmlText);
router.post('/inventory/reconcile', authenticate, requireEmployee, requireModuleAction('products', 'edit'), c.reconcileInventory);
router.post('/', authenticate, requireEmployee, requireModuleAction('products', 'add'), upload.single('photo'), c.create);
router.get('/:id', authenticate, requireEmployee, requireModuleAction('products', 'view'), c.get);
router.put('/:id', authenticate, requireEmployee, requireModuleAction('products', 'edit'), upload.single('photo'), c.update);
router.delete('/:id', authenticate, requireEmployee, requireModuleAction('products', 'delete'), c.remove);

module.exports = router;
