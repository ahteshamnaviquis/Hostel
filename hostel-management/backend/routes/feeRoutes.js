/**
 * /api/fee-types, /api/fees, /api/invoices, /api/payments, /api/refunds
 */
const express = require('express');
const ctrl = require('../controllers/feeController');
const { authenticate, requirePermission } = require('../middleware/auth');
const { validate, validateId, listQuery } = require('../utils/validator');
const { PAYMENT_METHODS } = require('../utils/constants');

const guard = [authenticate, requirePermission('payments.manage')];

const feeTypeRouter = express.Router();
feeTypeRouter.get('/', authenticate, ctrl.listFeeTypes);

const feeRouter = express.Router();
feeRouter.use(...guard);
feeRouter.get('/accounts', validate(listQuery({ only_due: { type: 'bool' }, status: { type: 'string' } }), 'query'), ctrl.listAccounts);

const invoiceRouter = express.Router();
invoiceRouter.use(...guard);
invoiceRouter.get(
  '/',
  validate(listQuery({
    status: { type: 'string' }, billing_month: { type: 'month' }, invoice_type: { type: 'string' }, admission_id: { type: 'id' },
    resident_id: { type: 'id' }, from: { type: 'date' }, to: { type: 'date' },
  }), 'query'),
  ctrl.listInvoices
);
invoiceRouter.post(
  '/generate-monthly',
  validate({ hostel_id: { type: 'id', required: true }, billing_month: { type: 'month', required: true }, due_date: { type: 'date' } }),
  ctrl.generateMonthly
);
invoiceRouter.post('/apply-late-fines', validate({ hostel_id: { type: 'id', required: true } }), ctrl.applyLateFines);
invoiceRouter.get('/:id', validateId(), ctrl.getInvoice);
invoiceRouter.post(
  '/',
  validate({
    admission_id: { type: 'id', required: true },
    invoice_date: { type: 'date', required: true },
    due_date: { type: 'date', required: true },
    remarks: { type: 'string', max: 500 },
    items: {
      type: 'array', required: true, max: 20,
      items: { type: 'object', schema: { fee_type_id: { type: 'id', required: true, label: 'Fee type' }, amount: { type: 'money', required: true }, description: { type: 'string', max: 255 } } },
    },
  }),
  ctrl.createInvoice
);
invoiceRouter.post('/:id/cancel', validateId(), validate({ reason: { type: 'string', required: true, max: 255 } }), ctrl.cancelInvoice);

const paymentRouter = express.Router();
paymentRouter.use(...guard);
paymentRouter.get(
  '/',
  validate(listQuery({ status: { type: 'string' }, payment_method: { type: 'string' }, from: { type: 'date' }, to: { type: 'date' }, admission_id: { type: 'id' } }), 'query'),
  ctrl.listPayments
);
paymentRouter.post(
  '/',
  validate({
    admission_id: { type: 'id', required: true, label: 'Resident account' },
    amount: { type: 'money', required: true, min: 1 },
    payment_date: { type: 'date', required: true },
    payment_method: { type: 'string', required: true, enum: PAYMENT_METHODS },
    reference_no: { type: 'string', max: 80, label: 'Reference / Transaction ID' },
    remarks: { type: 'string', max: 500 },
    invoice_ids: { type: 'array', items: { type: 'id' }, default: [] },
  }),
  ctrl.createPayment
);
paymentRouter.get('/:id/receipt', validateId(), ctrl.getReceipt);
paymentRouter.post('/:id/reverse', validateId(), validate({ reason: { type: 'string', required: true, max: 255 } }), ctrl.reversePayment);

const refundRouter = express.Router();
refundRouter.use(...guard);
refundRouter.get('/', validate(listQuery({ refund_type: { type: 'string' }, from: { type: 'date' }, to: { type: 'date' } }), 'query'), ctrl.listRefunds);
refundRouter.post(
  '/',
  validate({
    admission_id: { type: 'id', required: true, label: 'Resident account' },
    refund_type: { type: 'string', required: true, enum: ['security_deposit', 'advance', 'overpayment', 'other'] },
    amount: { type: 'money', required: true, min: 1 },
    refund_date: { type: 'date', required: true },
    payment_method: { type: 'string', required: true, enum: PAYMENT_METHODS },
    reference_no: { type: 'string', max: 80 },
    reason: { type: 'string', required: true, max: 255 },
  }),
  ctrl.createRefund
);

module.exports = { feeTypeRouter, feeRouter, invoiceRouter, paymentRouter, refundRouter };
