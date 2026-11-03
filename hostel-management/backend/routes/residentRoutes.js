const express = require('express');
const ctrl = require('../controllers/residentController');
const { authenticate, requirePermission } = require('../middleware/auth');
const { uploadSingle } = require('../middleware/upload');
const { validate, validateId, listQuery } = require('../utils/validator');
const { PAKISTAN_PROVINCES } = require('../utils/constants');

const router = express.Router();
// Admissions staff also need to read residents
router.use(authenticate, requirePermission('residents.manage', 'admissions.manage', 'payments.manage'));
const manage = requirePermission('residents.manage');

const residentSchema = {
  full_name: { type: 'string', required: true, max: 150 },
  father_name: { type: 'string', max: 150 },
  cnic: { type: 'cnic', label: 'CNIC / B-Form' },
  date_of_birth: { type: 'date' },
  gender: { type: 'string', required: true, enum: ['male', 'female', 'other'] },
  mobile: { type: 'phone', required: true },
  whatsapp: { type: 'phone', label: 'WhatsApp' },
  email: { type: 'email' },
  permanent_address: { type: 'string', max: 255 },
  city: { type: 'string', max: 80 },
  province: { type: 'string', enum: PAKISTAN_PROVINCES },
  institution: { type: 'string', max: 150 },
  department: { type: 'string', max: 100 },
  class_designation: { type: 'string', max: 100, label: 'Class / Degree / Designation' },
  student_employee_id: { type: 'string', max: 50, label: 'Student / Employee ID' },
  guardian_name: { type: 'string', max: 150 },
  guardian_relationship: { type: 'string', max: 50 },
  guardian_cnic: { type: 'cnic', label: 'Guardian CNIC' },
  guardian_phone: { type: 'phone' },
  guardian_address: { type: 'string', max: 255 },
};

router.get(
  '/',
  validate(listQuery({ status: { type: 'string' }, gender: { type: 'string' }, institution: { type: 'string' }, room_id: { type: 'id' } }), 'query'),
  ctrl.list
);
router.get('/:id', validateId(), ctrl.get);
router.post('/', manage, validate({ hostel_id: { type: 'id', required: true }, ...residentSchema }), ctrl.create);
router.put('/:id', manage, validateId(), validate(residentSchema), ctrl.update);
router.patch(
  '/:id/status',
  manage,
  validateId(),
  validate({ status: { type: 'string', required: true, enum: ['active', 'suspended', 'cancelled'] }, remarks: { type: 'string', max: 255 } }),
  ctrl.updateStatus
);
router.get('/:id/photo', validateId(), ctrl.getPhoto);
router.post('/:id/photo', manage, validateId(), uploadSingle('residents/photos', 'file', { imagesOnly: true }), ctrl.uploadPhoto);
router.post('/:id/documents', manage, validateId(), uploadSingle('residents/documents', 'file'), ctrl.uploadDocument);
router.get('/:id/documents/:docId/download', validateId('id', 'docId'), ctrl.downloadDocument);
router.delete('/:id/documents/:docId', manage, validateId('id', 'docId'), ctrl.deleteDocument);

module.exports = router;
