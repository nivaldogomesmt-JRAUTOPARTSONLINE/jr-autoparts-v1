const router = require('express').Router();
const { getDashboard } = require('../controllers/dashboardController');
const { authenticate, requireEmployee, requireModuleAction } = require('../middleware/auth');

router.get('/', authenticate, requireEmployee, requireModuleAction('dashboard', 'view'), getDashboard);

module.exports = router;
