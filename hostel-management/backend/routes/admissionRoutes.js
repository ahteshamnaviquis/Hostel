const express = require('express');
const ctrl = require('../controllers/admissionController');
const { authenticate, requirePermission } = require('../middleware/auth');
const { validate, validateId, listQuery } = require('../utils/validator');
const { PAYMENT_METHODS } = require('../utils/constants');

const admissionRouter = express.Router();
admissionRouter.use(authenticate, requirePermission('admissions.manage'));

admissionRouter.get(
  '/',
  validate(listQuery({ status: { type: 'string' }, from: { type: 'date' }, to: { type: 'date' }, leaving_within: { type: 'int', min: 0, max: 365 } }), 'query'),
  ctrl.list
);
admissionRouter.get('/:id', validateId(), ctrl.get);
admissionRouter.post(
  '/',
  validate({
    resident_id: { type: 'id', required: true },
    bed_id: { type: 'id', required: true, label: 'Bed' },
    admission_date: { type: 'date', required: true },
    expected_leaving_date: { type: 'date' },
    monthly_rent: { type: 'money' },
    security_deposit: { type: 'money' },
    admission_fee: { type: 'money', default: 0 },
    monthly_discount: { type: 'money', default: 0 },
    extra_fees: {
      type: 'array', default: [], max: 10,
      items: { type: 'object', schema: { fee_type_id: { type: 'id', required: true }, amount: { type: 'money', required: true } } },
    },
    check_in_now: { type: 'bool', default: true },
    generate_invoices: { type: 'bool', default: true },
    remarks: { type: 'string', max: 500 },
  }),
  ctrl.create
);
admissionRouter.post('/:id/check-in', validateId(), validate({ check_in_date: { type: 'date', required: true }, remarks: { type: 'string', max: 500 } }), ctrl.checkIn);
admissionRouter.post(
  '/:id/transfer',
  validateId(),
  validate({
    to_bed_id: { type: 'id', required: true, label: 'New bed' },
    transfer_date: { type: 'date', required: true },
    reason: { type: 'string', required: true, max: 255 },
    monthly_rent: { type: 'money', label: 'New monthly rent' },
  }),
  ctrl.transfer
);
admissionRouter.post('/:id/cancel', validateId(), validate({ reason: { type: 'string', required: true, max: 255 } }), ctrl.cancel);
admissionRouter.get('/:id/checkout-preview', validateId(), validate({ adjust_deposit: { type: 'bool', default: true } }, 'query'), ctrl.checkoutPreview);
admissionRouter.post(
  '/:id/checkout',
  validateId(),
  validate({
    checkout_date: { type: 'date', required: true },
    checkout_reason: { type: 'string', required: true, max: 255 },
    adjust_deposit: { type: 'bool', default: true },
    process_refund: { type: 'bool', default: true },
    refund_method: { type: 'string', enum: PAYMENT_METHODS, default: 'cash' },
    refund_reference: { type: 'string', max: 80 },
    remarks: { type: 'string', max: 500 },
  }),
  ctrl.checkout
);
admissionRouter.post(
  '/:id/fee-structures',
  validateId(),
  requirePermission('payments.manage'),
  validate({
    fee_type_id: { type: 'id', required: true, label: 'Fee type' },
    amount: { type: 'money', required: true },
    frequency: { type: 'string', enum: ['monthly', 'one_time'], default: 'monthly' },
    effective_from: { type: 'date', required: true },
  }),
  ctrl.addFeeStructure
);
admissionRouter.delete('/:id/fee-structures/:structureId', validateId('id', 'structureId'), requirePermission('payments.manage'), ctrl.removeFeeStructure);

const allocationRouter = express.Router();
allocationRouter.use(authenticate, requirePermission('admissions.manage'));
allocationRouter.get('/', validate(listQuery({ status: { type: 'string' }, room_id: { type: 'id' } }), 'query'), ctrl.listAllocations);

const transferRouter = express.Router();
transferRouter.use(authenticate, requirePermission('admissions.manage'));
transferRouter.get('/', validate(listQuery({ from: { type: 'date' }, to: { type: 'date' } }), 'query'), ctrl.listTransfers);

module.exports = { admissionRouter, allocationRouter, transferRouter };
