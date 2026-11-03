const express = require('express');
const ctrl = require('../controllers/hostelController');
const { authenticate, superAdminOnly } = require('../middleware/auth');
const { validate, validateId, listQuery } = require('../utils/validator');
const { PAKISTAN_PROVINCES } = require('../utils/constants');

const router = express.Router();
router.use(authenticate);

const hostelSchema = {
  name: { type: 'string', required: true, max: 150 },
  code: { type: 'string', required: true, max: 30, pattern: /^[A-Za-z0-9-]+$/, patternMessage: 'Code may contain letters, numbers and dashes only' },
  hostel_type: { type: 'string', required: true, enum: ['boys', 'girls', 'mixed'] },
  description: { type: 'text', max: 2000 },
  address: { type: 'string', required: true, max: 255 },
  city: { type: 'string', required: true, max: 80 },
  province: { type: 'string', required: true, enum: PAKISTAN_PROVINCES },
  contact_number: { type: 'phone' },
  email: { type: 'email' },
  warden_name: { type: 'string', max: 150 },
  warden_contact: { type: 'phone' },
  status: { type: 'string', enum: ['active', 'inactive'], default: 'active' },
};

router.get(
  '/',
  validate(listQuery({ status: { type: 'string' }, city: { type: 'string' }, province: { type: 'string' }, hostel_type: { type: 'string' } }), 'query'),
  ctrl.list
);
router.get('/options', ctrl.options);
router.get('/:id', validateId(), ctrl.get);
router.post('/', superAdminOnly, validate(hostelSchema), ctrl.create);
router.put('/:id', superAdminOnly, validateId(), validate(hostelSchema), ctrl.update);
router.patch('/:id/status', superAdminOnly, validateId(), validate({ status: { type: 'string', required: true, enum: ['active', 'inactive'] } }), ctrl.updateStatus);
router.put('/:id/admins', superAdminOnly, validateId(), validate({ user_ids: { type: 'array', items: { type: 'id' }, default: [] } }), ctrl.assignAdmins);

module.exports = router;
