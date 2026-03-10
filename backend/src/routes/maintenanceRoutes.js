const router = require('express').Router();
const c = require('../controllers/maintenanceController');
const { authenticate, requireEmployee } = require('../middleware/auth');

router.use(authenticate, requireEmployee);
router.get('/alerts', c.alerts);
router.get('/vehicle/:vehicleId', c.byVehicle);
router.post('/vehicle/:vehicleId/initialize', c.initializeVehicle);
router.post('/vehicle/:vehicleId/item', c.upsertVehicleItem);
router.put('/:id', c.update);
router.post('/vehicle/:vehicleId/mark-done', c.markDone);

module.exports = router;
