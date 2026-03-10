const { runTrackingDailyJobs, generateInvoicesForReference, sendCollectionNotices, getReferenceMonth } = require('../services/trackingBillingService');
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

router.post('/jobs/generate', async (req, res) => {
  try {
    const referenceMonth = req.body?.referenceMonth || getReferenceMonth(new Date());
    const result = await generateInvoicesForReference(referenceMonth);
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Erro ao gerar mensalidades.' });
  }
});

router.post('/jobs/collect', async (req, res) => {
  try {
    const result = await sendCollectionNotices();
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Erro ao enviar cobrancas.' });
  }
});

router.post('/jobs/run', async (req, res) => {
  try {
    const referenceMonth = req.body?.referenceMonth;
    const result = await runTrackingDailyJobs(referenceMonth);
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Erro ao executar rotinas de rastreamento.' });
  }
});

module.exports = router;


