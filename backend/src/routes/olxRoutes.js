const router = require('express').Router();
const c = require('../controllers/olxController');
const { authenticate, requireEmployee, requireModuleAction } = require('../middleware/auth');

router.use(authenticate, requireEmployee);

// Visualizar (admin sempre, ou modulo olx.view)
router.get('/status',          requireModuleAction('olx', 'view'), c.status);
router.get('/ads',             requireModuleAction('olx', 'view'), c.listAds);
router.get('/ads/:productId',  requireModuleAction('olx', 'view'), c.getAd);
router.get('/leads',           requireModuleAction('olx', 'view'), c.listLeads);

// Ações (admin sempre, ou modulo olx.edit)
router.post('/ads/:productId/publish',   requireModuleAction('olx', 'edit'), c.publishAd);
router.post('/ads/:productId/renew',     requireModuleAction('olx', 'edit'), c.renewAd);
router.delete('/ads/:productId',         requireModuleAction('olx', 'delete'), c.unpublishAd);

module.exports = router;
