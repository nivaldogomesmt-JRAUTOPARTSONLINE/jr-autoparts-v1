const router = require('express').Router();
const c = require('../controllers/clientController');
const { authenticate, requireEmployee } = require('../middleware/auth');
const multer = require('multer');
const { importClients, importRastrek, downloadImportTemplate } = require('../controllers/clientImportController');

const upload = multer({ storage: multer.memoryStorage() });

router.use(authenticate, requireEmployee);
router.get('/', c.list);
router.post('/', c.create);
router.get('/import/template', downloadImportTemplate);
router.post('/import', upload.single('file'), importClients);
router.post('/import/rastrek', upload.fields([{ name: 'clients', maxCount: 1 }, { name: 'vehicles', maxCount: 1 }]), importRastrek);
router.get('/export/consolidated', c.exportClientsConsolidated);
router.get('/export', c.exportClients);
router.get('/:id', c.get);
router.put('/:id', c.update);
router.delete('/:id', c.remove);
router.post('/:id/portal-access', c.grantPortalAccess);

module.exports = router;

