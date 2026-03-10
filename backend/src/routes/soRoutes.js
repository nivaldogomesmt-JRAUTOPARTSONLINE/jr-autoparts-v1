const router = require('express').Router();
const c = require('../controllers/soController');
const { authenticate, requireEmployee, requireAction } = require('../middleware/auth');
const { upload } = require('../services/uploadService');

router.use(authenticate, requireEmployee);
router.get('/', c.list);
router.post('/', requireAction('add'), c.create);
router.get('/:id', c.get);
router.put('/:id', requireAction('edit'), c.update);
router.put('/:id/status', requireAction('edit'), c.updateStatus);
router.post('/:id/photos', requireAction('edit'), upload.array('photos', 8), c.uploadPhotos);
router.delete('/:id/photos/:photoId', requireAction('delete'), c.deletePhoto);

module.exports = router;
