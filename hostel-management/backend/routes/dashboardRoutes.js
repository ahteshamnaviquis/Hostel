const express = require('express');
const ctrl = require('../controllers/dashboardController');
const { authenticate, requirePermission } = require('../middleware/auth');
const { validate } = require('../utils/validator');

const router = express.Router();
router.get('/', authenticate, requirePermission('dashboard.view'), validate({ hostel_id: { type: 'id' } }, 'query'), ctrl.getDashboard);

module.exports = router;
