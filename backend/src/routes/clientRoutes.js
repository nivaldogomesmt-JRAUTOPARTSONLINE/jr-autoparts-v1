const router = require('express').Router();
const c = require('../controllers/clientController');
const { authenticate, requireEmployee, requireModuleAction } = require('../middleware/auth');
const multer = require('multer');
const { importClients, importRastrek, downloadImportTemplate } = require('../controllers/clientImportController');

const upload = multer({ storage: multer.memoryStorage() });

router.use(authenticate, requireEmployee);
router.get('/', requireModuleAction('clients', 'view'), c.list);
router.post('/', requireModuleAction('clients', 'add'), c.create);
router.get('/import/template', requireModuleAction('clients', 'view'), downloadImportTemplate);
router.post('/import', requireModuleAction('clients', 'add'), upload.single('file'), importClients);
router.post('/import/rastrek', requireModuleAction('clients', 'add'), upload.fields([{ name: 'clients', maxCount: 1 }, { name: 'vehicles', maxCount: 1 }]), importRastrek);
router.get('/export/consolidated', requireModuleAction('clients', 'export'), c.exportClientsConsolidated);
router.get('/export', requireModuleAction('clients', 'export'), c.exportClients);
router.get('/:id', requireModuleAction('clients', 'view'), c.get);
router.put('/:id', requireModuleAction('clients', 'edit'), c.update);
router.delete('/:id', requireModuleAction('clients', 'delete'), c.remove);
router.post('/:id/portal-access', requireModuleAction('clients', 'edit'), c.grantPortalAccess);

module.exports = router;
