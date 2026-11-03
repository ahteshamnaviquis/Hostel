const express = require('express');
const ctrl = require('../controllers/userController');
const { authenticate, superAdminOnly } = require('../middleware/auth');
const { validate, validateId, listQuery } = require('../utils/validator');
const { PASSWORD_RULE } = require('../utils/password');

const router = express.Router();
router.use(authenticate, superAdminOnly);

const STATUS = { type: 'string', enum: ['active', 'inactive', 'suspended'], default: 'active' };
const profileSchema = {
  full_name: { type: 'string', required: true, max: 150 },
  email: { type: 'email', required: true },
  username: { type: 'string', max: 60, pattern: /^[A-Za-z0-9._-]{3,60}$/, patternMessage: 'Username: 3-60 letters, numbers, dot, dash or underscore' },
  phone: { type: 'phone' },
  status: STATUS,
};

router.get('/', validate(listQuery({ status: { type: 'string' }, role: { type: 'string' } }), 'query'), ctrl.list);
router.post(
  '/',
  validate({
    ...profileSchema,
    password: PASSWORD_RULE,
    role: { type: 'string', enum: ['hostel_admin', 'super_admin'], default: 'hostel_admin' },
    hostel_ids: { type: 'array', items: { type: 'id' }, default: [] },
    permission_codes: { type: 'array', items: { type: 'string' } },
  }),
  ctrl.create
);
router.get('/:id', validateId(), ctrl.get);
router.put('/:id', validateId(), validate(profileSchema), ctrl.update);
router.patch('/:id/status', validateId(), validate({ status: { ...STATUS, required: true, default: undefined } }), ctrl.updateStatus);
router.put('/:id/hostels', validateId(), validate({ hostel_ids: { type: 'array', items: { type: 'id' }, default: [] } }), ctrl.updateHostels);
router.put(
  '/:id/permissions',
  validateId(),
  validate({ permission_codes: { type: 'array', items: { type: 'string' }, default: [] } }),
  ctrl.updatePermissions
);
router.post('/:id/reset-password', validateId(), validate({ new_password: PASSWORD_RULE }), ctrl.resetPassword);

module.exports = router;
