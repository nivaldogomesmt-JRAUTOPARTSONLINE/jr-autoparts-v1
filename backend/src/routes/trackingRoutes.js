const router = require('express').Router();
const c = require('../controllers/trackingController');
const { authenticate, requireEmployee } = require('../middleware/auth');

router.use(authenticate, requireEmployee);

router.get('/summary', c.summary);

router.get('/devices', c.listDevices);
router.post('/devices', c.createDevice);
router.put('/devices/:id', c.updateDevice);

router.get('/contracts', c.listContracts);
router.post('/contracts', c.createContract);

router.get('/invoices', c.listInvoices);
router.post('/invoices', c.createInvoice);
router.post('/invoices/:id/pay', c.markInvoicePaid);

module.exports = router;
