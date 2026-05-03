const router = require('express').Router();
const c = require('../controllers/messagingController');
const { authenticate, requireEmployee, requireManageUsers } = require('../middleware/auth');

router.use(authenticate, requireEmployee);

// Routing config (só admin)
router.get('/routes',                         requireManageUsers, c.listRoutes);
router.put('/routes/:eventType',              requireManageUsers, c.updateRoute);
router.post('/routes/test',                   requireManageUsers, c.testRoute);

// Reclamações de clientes (todos da equipe veem)
router.get('/complaints/summary',             c.complaintsSummary);
router.get('/complaints',                     c.listComplaints);
router.post('/complaints/:id/status',         c.updateComplaintStatus);
router.post('/complaints/classify',           c.classifyMessage);

// Alertas internos (só admin)
router.get('/alerts',                         requireManageUsers, c.listInternalAlerts);

module.exports = router;
