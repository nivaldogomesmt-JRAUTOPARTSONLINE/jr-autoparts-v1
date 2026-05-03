const router = require('express').Router();
const c = require('../controllers/adTemplateController');
const { authenticate, requireEmployee } = require('../middleware/auth');

router.use(authenticate, requireEmployee);
router.get('/search',          c.search);
router.get('/categories',      c.categories);
router.get('/by-brand/:brand', c.listByBrand);
router.get('/:id',             c.get);

module.exports = router;
