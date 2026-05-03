const router = require('express').Router();
const c = require('../controllers/iaController');
const { authenticate, requireEmployee, requireModuleAction } = require('../middleware/auth');

router.use(authenticate, requireEmployee);

// OLX (mantém compat)
router.post('/olx-ad',         requireModuleAction('olx', 'edit'), c.generateOlxAd);
router.post('/olx-category',   requireModuleAction('olx', 'view'), c.classifyCategory);

// Novos canais
router.post('/instagram-ad',   requireModuleAction('products', 'edit'), c.generateInstagramAd);
router.post('/facebook-ad',    requireModuleAction('products', 'edit'), c.generateFacebookAd);
router.post('/whatsapp-ad',    requireModuleAction('products', 'edit'), c.generateWhatsappCatalogAd);

// Multi-canal: gera os 4 de uma vez (mais eficiente)
router.post('/multi-channel',  requireModuleAction('products', 'edit'), c.generateMultiChannel);

module.exports = router;
