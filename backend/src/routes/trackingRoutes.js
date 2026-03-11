const router = require('express').Router();
const c = require('../controllers/trackingController');
const { authenticate, requireEmployee, requireModuleAction } = require('../middleware/auth');
const { safeCompare } = require('../utils/security');
const {
  runTrackingDailyJobs,
  generateInvoicesForReference,
  sendCollectionNotices,
  getReferenceMonth,
} = require('../services/trackingBillingService');

function allowJobTokenOrEmployee(req, res, next) {
  const providedToken = String(req.headers['x-job-token'] || req.query.token || '');
  const expectedToken = String(process.env.TRACKING_JOB_TOKEN || process.env.BOT_SECRET_TOKEN || '');

  if (expectedToken && providedToken && safeCompare(providedToken, expectedToken)) {
    return next();
  }

  return authenticate(req, res, () => requireEmployee(req, res, () => requireModuleAction('tracking', 'edit')(req, res, next)));
}

router.post('/jobs/generate', allowJobTokenOrEmployee, async (req, res) => {
  try {
    const referenceMonth = req.body?.referenceMonth || getReferenceMonth(new Date());
    const result = await generateInvoicesForReference(referenceMonth);
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Erro ao gerar mensalidades.' });
  }
});

router.post('/jobs/collect', allowJobTokenOrEmployee, async (req, res) => {
  try {
    const result = await sendCollectionNotices();
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Erro ao enviar cobrancas.' });
  }
});

router.post('/jobs/run', allowJobTokenOrEmployee, async (req, res) => {
  try {
    const referenceMonth = req.body?.referenceMonth;
    const result = await runTrackingDailyJobs(referenceMonth || getReferenceMonth(new Date()));
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Erro ao executar rotinas de rastreamento.' });
  }
});

router.use(authenticate, requireEmployee);

router.get('/summary', requireModuleAction('tracking', 'view'), c.summary);

router.get('/devices', requireModuleAction('tracking', 'view'), c.listDevices);
router.post('/devices', requireModuleAction('tracking', 'add'), c.createDevice);
router.put('/devices/:id', requireModuleAction('tracking', 'edit'), c.updateDevice);

router.get('/contracts', requireModuleAction('tracking', 'view'), c.listContracts);
router.post('/contracts', requireModuleAction('tracking', 'add'), c.createContract);

router.get('/invoices', requireModuleAction('tracking', 'view'), c.listInvoices);
router.post('/invoices', requireModuleAction('tracking', 'add'), c.createInvoice);
router.post('/invoices/:id/pay', requireModuleAction('tracking', 'changeStatus'), c.markInvoicePaid);

module.exports = router;
