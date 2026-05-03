const router = require('express').Router();
const c = require('../controllers/vehicleController');
const { authenticate, requireEmployee, requireModuleAction } = require('../middleware/auth');
const { upload } = require('../services/uploadService');

router.use(authenticate, requireEmployee);
router.get('/', requireModuleAction('vehicles', 'view'), c.list);
router.get('/export', requireModuleAction('vehicles', 'export'), c.exportVehicles);
router.get('/lookup/:plate', requireModuleAction('vehicles', 'view'), c.lookupByPlate);
router.post('/enrich-plate/batch', requireModuleAction('vehicles', 'edit'), c.enrichBatchByPlate);
router.post('/', requireModuleAction('vehicles', 'add'), c.create);
router.get('/:id/history', requireModuleAction('vehicles', 'view'), c.history);
router.post('/:id/enrich-plate', requireModuleAction('vehicles', 'edit'), c.enrichByPlate);
router.post('/:id/photo', requireModuleAction('vehicles', 'edit'), upload.single('photo'), c.uploadPhoto);
router.get('/:id', requireModuleAction('vehicles', 'view'), c.get);
router.put('/:id', requireModuleAction('vehicles', 'edit'), c.update);
router.delete('/:id', requireModuleAction('vehicles', 'delete'), c.remove);

module.exports = router;
