const router = require('express').Router();
const c = require('../controllers/maintenanceController');
const { authenticate, requireEmployee, requireModuleAction } = require('../middleware/auth');

router.use(authenticate, requireEmployee);
router.get('/alerts', requireModuleAction('serviceOrders', 'view'), c.alerts);
router.get('/vehicle/:vehicleId', requireModuleAction('serviceOrders', 'view'), c.byVehicle);
router.post('/vehicle/:vehicleId/initialize', requireModuleAction('serviceOrders', 'edit'), c.initializeVehicle);
router.post('/vehicle/:vehicleId/item', requireModuleAction('serviceOrders', 'edit'), c.upsertVehicleItem);
router.put('/:id', requireModuleAction('serviceOrders', 'edit'), c.update);
router.post('/vehicle/:vehicleId/mark-done', requireModuleAction('serviceOrders', 'edit'), c.markDone);
router.post('/notify-run', requireModuleAction('serviceOrders', 'edit'), c.notifyNow);

module.exports = router;
