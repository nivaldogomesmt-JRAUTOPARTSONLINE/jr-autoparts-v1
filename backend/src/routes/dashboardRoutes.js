const router = require('express').Router();
const { getDashboard } = require('../controllers/dashboardController');
const { authenticate, requireEmployee } = require('../middleware/auth');

router.get('/', authenticate, requireEmployee, getDashboard);

module.exports = router;
