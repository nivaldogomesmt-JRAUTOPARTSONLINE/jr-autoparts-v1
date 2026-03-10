const router = require('express').Router();
const c = require('../controllers/maintenanceController');
const { authenticate, requireEmployee, requireAction } = require('../middleware/auth');

router.use(authenticate, requireEmployee);
router.get('/alerts', c.alerts);
router.get('/vehicle/:vehicleId', c.byVehicle);
router.post('/vehicle/:vehicleId/initialize', requireAction('edit'), c.initializeVehicle);
router.post('/vehicle/:vehicleId/item', requireAction('edit'), c.upsertVehicleItem);
router.put('/:id', requireAction('edit'), c.update);
router.post('/vehicle/:vehicleId/mark-done', requireAction('edit'), c.markDone);

module.exports = router;
