const express = require('express');
const ctrl = require('../controllers/reportController');
const { authenticate, requirePermission } = require('../middleware/auth');
const { validate } = require('../utils/validator');

const router = express.Router();
router.use(authenticate, requirePermission('reports.view'));
router.get('/', ctrl.list);
router.get(
  '/:key',
  validate({
    format: { type: 'string', enum: ['json', 'xlsx', 'pdf'], default: 'json' },
    hostel_id: { type: 'id' },
    from: { type: 'date' },
    to: { type: 'date' },
    status: { type: 'string', max: 30 },
    category_id: { type: 'id' },
    payment_method: { type: 'string', max: 30 },
  }, 'query'),
  ctrl.run
);

module.exports = router;
