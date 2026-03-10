const router = require('express').Router();
const c = require('../controllers/companyAssetController');
const { authenticate, requireEmployee } = require('../middleware/auth');

router.use(authenticate, requireEmployee);

router.get('/', c.list);
router.post('/', c.create);
router.get('/:id', c.get);
router.put('/:id', c.update);
router.delete('/:id', c.remove);

module.exports = router;
