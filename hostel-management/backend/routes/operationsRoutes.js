/**
 * /api/expense-categories, /api/expenses, /api/finance, /api/attendance, /api/visitors, /api/complaints
 */
const express = require('express');
const expenses = require('../controllers/expenseController');
const ops = require('../controllers/operationsController');
const { authenticate, requirePermission } = require('../middleware/auth');
const { uploadSingle } = require('../middleware/upload');
const { validate, validateId, listQuery } = require('../utils/validator');
const { COMPLAINT_CATEGORIES } = require('../utils/constants');

// ---- Expenses
const expenseCategoryRouter = express.Router();
expenseCategoryRouter.get('/', authenticate, expenses.listCategories);

const expenseRouter = express.Router();
expenseRouter.use(authenticate, requirePermission('expenses.manage'));
expenseRouter.get(
  '/',
  validate(listQuery({ category_id: { type: 'id' }, from: { type: 'date' }, to: { type: 'date' }, status: { type: 'string', enum: ['posted', 'void'] }, payment_method: { type: 'string' } }), 'query'),
  expenses.list
);
expenseRouter.post('/', uploadSingle('expenses', 'receipt'), expenses.create);
expenseRouter.put('/:id', validateId(), uploadSingle('expenses', 'receipt'), expenses.update);
expenseRouter.post('/:id/void', validateId(), validate({ reason: { type: 'string', required: true, max: 255 } }), expenses.voidExpense);
expenseRouter.get('/:id/receipt', validateId(), expenses.downloadReceipt);

const financeRouter = express.Router();
financeRouter.get(
  '/summary',
  authenticate,
  requirePermission('expenses.manage', 'payments.manage', 'reports.view'),
  validate({ hostel_id: { type: 'id' }, from: { type: 'date' }, to: { type: 'date' } }, 'query'),
  expenses.financeSummary
);

// ---- Attendance
const attendanceRouter = express.Router();
attendanceRouter.use(authenticate, requirePermission('attendance.manage'));
attendanceRouter.get('/sheet', validate({ hostel_id: { type: 'id', required: true }, date: { type: 'date', required: true }, search: { type: 'string', max: 100 } }, 'query'), ops.attendanceSheet);
attendanceRouter.post(
  '/',
  validate({
    hostel_id: { type: 'id', required: true },
    attendance_date: { type: 'date', required: true },
    records: {
      type: 'array', required: true, max: 1000,
      items: {
        type: 'object',
        schema: {
          resident_id: { type: 'id', required: true },
          status: { type: 'string', required: true, enum: ['present', 'absent', 'leave', 'late'] },
          entry_time: { type: 'time' },
          remarks: { type: 'string', max: 255 },
        },
      },
    },
  }),
  ops.saveAttendance
);
attendanceRouter.get(
  '/history',
  validate(listQuery({ resident_id: { type: 'id' }, from: { type: 'date' }, to: { type: 'date' }, status: { type: 'string' } }), 'query'),
  ops.attendanceHistory
);
attendanceRouter.get('/monthly', validate({ hostel_id: { type: 'id', required: true }, month: { type: 'month', required: true } }, 'query'), ops.attendanceMonthly);

// ---- Visitors
const visitorRouter = express.Router();
visitorRouter.use(authenticate, requirePermission('visitors.manage'));
const visitorSchema = {
  visitor_name: { type: 'string', required: true, max: 150 },
  cnic: { type: 'cnic', label: 'Visitor CNIC' },
  contact_number: { type: 'phone' },
  relationship: { type: 'string', max: 50 },
  visit_date: { type: 'date', required: true },
  entry_time: { type: 'time', required: true },
  purpose: { type: 'string', max: 255 },
  remarks: { type: 'string', max: 255 },
};
visitorRouter.get(
  '/',
  validate(listQuery({ from: { type: 'date' }, to: { type: 'date' }, inside: { type: 'bool' }, resident_id: { type: 'id' } }), 'query'),
  ops.listVisitors
);
visitorRouter.post('/', validate({ resident_id: { type: 'id', required: true, label: 'Resident' }, ...visitorSchema }), ops.createVisitor);
visitorRouter.put('/:id', validateId(), validate({ ...visitorSchema, exit_time: { type: 'time' } }), ops.updateVisitor);
visitorRouter.post('/:id/exit', validateId(), validate({ exit_time: { type: 'time', required: true } }), ops.visitorExit);

// ---- Complaints
const complaintRouter = express.Router();
complaintRouter.use(authenticate, requirePermission('complaints.manage'));
const PRIORITY = { type: 'string', enum: ['low', 'medium', 'high', 'urgent'], default: 'medium' };
complaintRouter.get(
  '/',
  validate(listQuery({ status: { type: 'string' }, category: { type: 'string' }, priority: { type: 'string' }, from: { type: 'date' }, to: { type: 'date' } }), 'query'),
  ops.listComplaints
);
complaintRouter.get('/:id', validateId(), ops.getComplaint);
complaintRouter.post(
  '/',
  validate({
    hostel_id: { type: 'id', required: true, label: 'Hostel' },
    resident_id: { type: 'id' },
    room_id: { type: 'id' },
    category: { type: 'string', required: true, enum: COMPLAINT_CATEGORIES },
    subject: { type: 'string', required: true, max: 150 },
    description: { type: 'text', max: 3000 },
    priority: PRIORITY,
    assigned_to: { type: 'string', max: 150 },
  }),
  ops.createComplaint
);
complaintRouter.put(
  '/:id',
  validateId(),
  validate({
    status: { type: 'string', required: true, enum: ['open', 'in_progress', 'resolved', 'rejected'] },
    priority: { ...PRIORITY, required: true },
    assigned_to: { type: 'string', max: 150 },
    remarks: { type: 'string', max: 500 },
    resolution_remarks: { type: 'string', max: 500 },
  }),
  ops.updateComplaint
);

module.exports = { expenseCategoryRouter, expenseRouter, financeRouter, attendanceRouter, visitorRouter, complaintRouter };
