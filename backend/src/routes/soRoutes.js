const router = require('express').Router();
const c = require('../controllers/soController');
const { authenticate, requireEmployee, requireModuleAction } = require('../middleware/auth');
const { upload } = require('../services/uploadService');

router.use(authenticate, requireEmployee);
router.get('/', requireModuleAction('serviceOrders', 'view'), c.list);
router.get('/overview', requireModuleAction('serviceOrders', 'view'), c.overview);
router.get('/export', requireModuleAction('serviceOrders', 'export'), c.exportOrders);
router.post('/', requireModuleAction('serviceOrders', 'add'), c.create);
router.get('/:id', requireModuleAction('serviceOrders', 'view'), c.get);
router.put('/:id', requireModuleAction('serviceOrders', 'edit'), c.update);
router.put('/:id/status', requireModuleAction('serviceOrders', 'changeStatus'), c.updateStatus);
router.put('/:id/delivery', requireModuleAction('serviceOrders', 'changeStatus'), c.sendDeliveryUpdate);
router.post('/:id/photos', requireModuleAction('serviceOrders', 'edit'), upload.array('photos', 8), c.uploadPhotos);
router.delete('/:id/photos/:photoId', requireModuleAction('serviceOrders', 'delete'), c.deletePhoto);
router.delete('/:id', requireModuleAction('serviceOrders', 'delete'), c.remove);

module.exports = router;
