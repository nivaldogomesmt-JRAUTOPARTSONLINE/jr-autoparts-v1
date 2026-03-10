const router = require('express').Router();
const c = require('../controllers/clientController');
const { authenticate, requireEmployee, requireAction } = require('../middleware/auth');
const multer = require('multer');
const { importClients, importRastrek, downloadImportTemplate } = require('../controllers/clientImportController');

const upload = multer({ storage: multer.memoryStorage() });

router.use(authenticate, requireEmployee);
router.get('/', c.list);
router.post('/', requireAction('add'), c.create);
router.get('/import/template', downloadImportTemplate);
router.post('/import', requireAction('add'), upload.single('file'), importClients);
router.post('/import/rastrek', requireAction('add'), upload.fields([{ name: 'clients', maxCount: 1 }, { name: 'vehicles', maxCount: 1 }]), importRastrek);
router.get('/export/consolidated', c.exportClientsConsolidated);
router.get('/export', c.exportClients);
router.get('/:id', c.get);
router.put('/:id', requireAction('edit'), c.update);
router.delete('/:id', requireAction('delete'), c.remove);
router.post('/:id/portal-access', requireAction('edit'), c.grantPortalAccess);

module.exports = router;
