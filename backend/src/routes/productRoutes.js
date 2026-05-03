const router = require('express').Router();
const c = require('../controllers/productController');
const { authenticate, requireEmployee, requireModuleAction } = require('../middleware/auth');
const { upload } = require('../services/uploadService');
const photoCtrl = require('../controllers/productPhotoController');
const { upload: photoUpload, bulkUpload } = require('../services/uploadService');

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


// ─── Foto pública (servida com cache) ────────────────────────────────────
router.get('/foto/:filename', photoCtrl.servePhoto);

// ─── Upload single ────────────────────────────────────────────────────────
router.post('/:id/photo', authenticate, requireEmployee, requireModuleAction('products', 'edit'),
  photoUpload.single('photo'), photoCtrl.uploadSingle);
router.delete('/:id/photo', authenticate, requireEmployee, requireModuleAction('products', 'edit'),
  photoCtrl.removeSingle);

// ─── Upload em massa ──────────────────────────────────────────────────────
router.post('/bulk-photo-upload', authenticate, requireEmployee, requireModuleAction('products', 'edit'),
  bulkUpload.array('photos', 200), photoCtrl.bulkPhotoUpload);

module.exports = router;
