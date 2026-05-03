const router = require('express').Router();
const multer = require('multer');
const c = require('../controllers/brandController');
const { authenticate, requireEmployee } = require('../middleware/auth');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// Públicos: GET config + servir logo (frontend lê)
router.get('/', c.get);
router.get('/logo-file/:filename', c.serveLogo);

// Auth obrigatório
router.put('/', authenticate, requireEmployee, c.update);
router.post('/logo', authenticate, requireEmployee, upload.single('logo'), c.uploadLogo);

module.exports = router;
