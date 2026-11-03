/**
 * Expenses (permission: expenses.manage) and financial summary.
 * Posted expenses are never deleted - they are voided with a reason.
 */
const { query, queryOne } = require('../config/db');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/response');
const { paginate, currentMonth, today } = require('../utils/helpers');
const { hostelScope, assertHostelAccess, findScoped } = require('../utils/scope');
const { logAudit } = require('../services/auditService');
const { resolveUploadPath, removeUpload } = require('../middleware/upload');
const { validateObject } = require('../utils/validator');
const { PAYMENT_METHODS } = require('../utils/constants');
const { lastMonths, MONTH_LABEL } = require('../services/dashboardService');

const EXPENSE_SCHEMA = {
  category_id: { type: 'id', required: true, label: 'Category' },
  title: { type: 'string', required: true, max: 150 },
  amount: { type: 'money', required: true, min: 1 },
  expense_date: { type: 'date', required: true },
  payment_method: { type: 'string', required: true, enum: PAYMENT_METHODS },
  description: { type: 'string', max: 500 },
};

const listCategories = asyncHandler(async (req, res) => {
  sendSuccess(res, { data: await query(`SELECT id, name, description, status FROM expense_categories ORDER BY name = 'Other', name`) });
});

const BASE = `FROM expenses e JOIN expense_categories c ON c.id = e.category_id JOIN hostels h ON h.id = e.hostel_id
              LEFT JOIN users u ON u.id = e.added_by`;

function buildFilters(req) {
  const { search, hostel_id, category_id, from, to, status, payment_method } = req.q;
  const scope = hostelScope(req, 'e.hostel_id', hostel_id);
  const where = [scope.sql];
  const params = [...scope.params];
  if (search) where.push('(e.title LIKE ? OR e.description LIKE ?)') && params.push(`%${search}%`, `%${search}%`);
  if (category_id) where.push('e.category_id = ?') && params.push(category_id);
  if (from) where.push('e.expense_date >= ?') && params.push(from);
  if (to) where.push('e.expense_date <= ?') && params.push(to);
  if (payment_method) where.push('e.payment_method = ?') && params.push(payment_method);
  where.push('e.status = ?') && params.push(status || 'posted');
  return { whereSql: where.join(' AND '), params };
}

// GET /api/expenses
const list = asyncHandler(async (req, res) => {
  const { limit, offset, meta } = paginate(req.q);
  const { whereSql, params } = buildFilters(req);
  const [{ total, amount }] = await query(`SELECT COUNT(*) AS total, COALESCE(SUM(e.amount),0) AS amount ${BASE} WHERE ${whereSql}`, params);
  const rows = await query(
    `SELECT e.id, e.hostel_id, e.category_id, e.title, e.amount, e.expense_date, e.payment_method, e.description, e.status,
            e.receipt_file IS NOT NULL AS has_receipt, e.void_reason, e.created_at, c.name AS category_name, h.name AS hostel_name,
            u.full_name AS added_by_name
     ${BASE} WHERE ${whereSql} ORDER BY e.expense_date DESC, e.id DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  const byCategory = await query(
    `SELECT c.name AS category, SUM(e.amount) AS amount ${BASE} WHERE ${whereSql} GROUP BY c.id, c.name ORDER BY amount DESC`,
    params
  );
  sendSuccess(res, { data: rows, meta: { ...meta(total), totals: { amount }, byCategory } });
});

/** Multipart forms send strings - validate here (after multer). */
function validateBody(req) {
  const [clean, errors] = validateObject(req.body || {}, req.method === 'POST' ? { hostel_id: { type: 'id', required: true, label: 'Hostel' }, ...EXPENSE_SCHEMA } : EXPENSE_SCHEMA);
  if (errors) throw new ApiError(422, 'Please correct the highlighted fields', errors);
  return clean;
}

async function assertCategory(id) {
  const cat = await queryOne(`SELECT id, name FROM expense_categories WHERE id = ? AND status = 'active'`, [id]);
  if (!cat) throw new ApiError(422, 'Invalid category', { category_id: 'Please select a valid category' });
  return cat;
}

// POST /api/expenses  (multipart: optional file "receipt")
const create = asyncHandler(async (req, res) => {
  try {
    const b = validateBody(req);
    assertHostelAccess(req, b.hostel_id);
    const cat = await assertCategory(b.category_id);
    const result = await query(
      `INSERT INTO expenses (hostel_id, category_id, title, amount, expense_date, payment_method, description, receipt_file, added_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [b.hostel_id, b.category_id, b.title, b.amount, b.expense_date, b.payment_method, b.description, req.file?.relativePath || null, req.user.id]
    );
    await logAudit(null, req, {
      action: 'expense.create', entityType: 'expense', entityId: result.insertId, hostelId: b.hostel_id,
      description: `Recorded expense "${b.title}" (${cat.name}) Rs. ${b.amount}`,
    });
    sendSuccess(res, { statusCode: 201, message: 'Expense recorded', data: { id: result.insertId } });
  } catch (error) {
    removeUpload(req.file);
    throw error;
  }
});

// PUT /api/expenses/:id  (multipart: optional new receipt)
const update = asyncHandler(async (req, res) => {
  try {
    const expense = await findScoped(req, 'expenses', req.params.id, { label: 'Expense' });
    if (expense.status !== 'posted') throw ApiError.conflict('A voided expense cannot be edited');
    const b = validateBody(req);
    await assertCategory(b.category_id);
    await query(
      `UPDATE expenses SET category_id = ?, title = ?, amount = ?, expense_date = ?, payment_method = ?, description = ?,
         receipt_file = COALESCE(?, receipt_file) WHERE id = ?`,
      [b.category_id, b.title, b.amount, b.expense_date, b.payment_method, b.description, req.file?.relativePath || null, expense.id]
    );
    await logAudit(null, req, {
      action: 'expense.update', entityType: 'expense', entityId: expense.id, hostelId: expense.hostel_id,
      description: `Updated expense "${b.title}"`,
      oldValues: { title: expense.title, amount: expense.amount, expense_date: expense.expense_date, category_id: expense.category_id },
      newValues: b,
    });
    sendSuccess(res, { message: 'Expense updated' });
  } catch (error) {
    removeUpload(req.file);
    throw error;
  }
});

// POST /api/expenses/:id/void { reason }
const voidExpense = asyncHandler(async (req, res) => {
  const expense = await findScoped(req, 'expenses', req.params.id, { label: 'Expense' });
  if (expense.status === 'void') throw ApiError.conflict('Expense is already void');
  await query(`UPDATE expenses SET status = 'void', voided_by = ?, voided_at = NOW(), void_reason = ? WHERE id = ?`, [req.user.id, req.body.reason, expense.id]);
  await logAudit(null, req, {
    action: 'expense.void', entityType: 'expense', entityId: expense.id, hostelId: expense.hostel_id,
    description: `Voided expense "${expense.title}" Rs. ${expense.amount}: ${req.body.reason}`,
  });
  sendSuccess(res, { message: 'Expense voided' });
});

// GET /api/expenses/:id/receipt
const downloadReceipt = asyncHandler(async (req, res) => {
  const expense = await findScoped(req, 'expenses', req.params.id, { label: 'Expense' });
  if (!expense.receipt_file) throw ApiError.notFound('No receipt attached');
  res.set('Cache-Control', 'private, no-store');
  res.download(resolveUploadPath(expense.receipt_file), `expense-${expense.id}-receipt${require('path').extname(expense.receipt_file)}`);
});

// GET /api/finance/summary?hostel_id=&from=&to=
const financeSummary = asyncHandler(async (req, res) => {
  const { hostel_id } = req.q;
  const month = currentMonth();
  const from = req.q.from || `${month}-01`;
  const to = req.q.to || today();
  const s = (col) => hostelScope(req, col, hostel_id);

  const [totals] = await query(
    `SELECT
      (SELECT COALESCE(SUM(p.amount),0) FROM payments p WHERE p.status = 'posted' AND p.payment_method <> 'deposit_adjustment' AND p.payment_date BETWEEN ? AND ? AND ${s('p.hostel_id').sql}) AS collected,
      (SELECT COALESCE(SUM(f.amount),0) FROM refunds f WHERE f.status = 'posted' AND f.refund_date BETWEEN ? AND ? AND ${s('f.hostel_id').sql}) AS refunds,
      (SELECT COALESCE(SUM(e.amount),0) FROM expenses e WHERE e.status = 'posted' AND e.expense_date BETWEEN ? AND ? AND ${s('e.hostel_id').sql}) AS expenses,
      (SELECT COALESCE(SUM(i.total_amount),0) FROM invoices i WHERE i.status <> 'cancelled' AND i.invoice_date BETWEEN ? AND ? AND ${s('i.hostel_id').sql}) AS invoiced,
      (SELECT COALESCE(SUM(i.total_amount - i.paid_amount),0) FROM invoices i WHERE i.status IN ('unpaid','partially_paid') AND ${s('i.hostel_id').sql}) AS outstanding`,
    [from, to, ...s('p.hostel_id').params, from, to, ...s('f.hostel_id').params, from, to, ...s('e.hostel_id').params,
      from, to, ...s('i.hostel_id').params, ...s('i.hostel_id').params]
  );
  totals.net = totals.collected - totals.refunds - totals.expenses;

  const months = lastMonths(12);
  const start = `${months[0]}-01`;
  const byMonth = async (sql, col) => {
    const sc = s(col);
    const rows = await query(sql.replace('__SCOPE__', sc.sql), [start, ...sc.params]);
    return Object.fromEntries(rows.map((r) => [r.ym, Number(r.total)]));
  };
  const rev = await byMonth(
    `SELECT DATE_FORMAT(p.payment_date,'%Y-%m') ym, SUM(p.amount) total FROM payments p WHERE p.status='posted' AND p.payment_method <> 'deposit_adjustment' AND p.payment_date >= ? AND __SCOPE__ GROUP BY ym`,
    'p.hostel_id'
  );
  const exp = await byMonth(
    `SELECT DATE_FORMAT(e.expense_date,'%Y-%m') ym, SUM(e.amount) total FROM expenses e WHERE e.status='posted' AND e.expense_date >= ? AND __SCOPE__ GROUP BY ym`,
    'e.hostel_id'
  );
  const ref = await byMonth(
    `SELECT DATE_FORMAT(f.refund_date,'%Y-%m') ym, SUM(f.amount) total FROM refunds f WHERE f.status='posted' AND f.refund_date >= ? AND __SCOPE__ GROUP BY ym`,
    'f.hostel_id'
  );
  const monthly = months.map((ym) => ({
    ym, month: `${MONTH_LABEL(ym)} ${ym.slice(2, 4)}`, revenue: rev[ym] || 0, expenses: exp[ym] || 0, refunds: ref[ym] || 0,
    net: (rev[ym] || 0) - (exp[ym] || 0) - (ref[ym] || 0),
  }));

  const sc = s('e.hostel_id');
  const byCategory = await query(
    `SELECT c.name AS category, SUM(e.amount) AS amount FROM expenses e JOIN expense_categories c ON c.id = e.category_id
     WHERE e.status = 'posted' AND e.expense_date BETWEEN ? AND ? AND ${sc.sql} GROUP BY c.id, c.name ORDER BY amount DESC`,
    [from, to, ...sc.params]
  );
  const hs = s('h.id');
  const byHostel = await query(
    `SELECT h.id, h.name AS hostel,
       (SELECT COALESCE(SUM(p.amount),0) FROM payments p WHERE p.hostel_id = h.id AND p.status = 'posted' AND p.payment_method <> 'deposit_adjustment' AND p.payment_date BETWEEN ? AND ?) AS revenue,
       (SELECT COALESCE(SUM(e.amount),0) FROM expenses e WHERE e.hostel_id = h.id AND e.status = 'posted' AND e.expense_date BETWEEN ? AND ?) AS expenses,
       (SELECT COALESCE(SUM(f.amount),0) FROM refunds f WHERE f.hostel_id = h.id AND f.status = 'posted' AND f.refund_date BETWEEN ? AND ?) AS refunds,
       (SELECT COALESCE(SUM(i.total_amount - i.paid_amount),0) FROM invoices i WHERE i.hostel_id = h.id AND i.status IN ('unpaid','partially_paid')) AS outstanding
     FROM hostels h WHERE h.deleted_at IS NULL AND ${hs.sql} ORDER BY h.name`,
    [from, to, from, to, from, to, ...hs.params]
  );
  byHostel.forEach((h) => {
    h.net = h.revenue - h.expenses - h.refunds;
  });
  const ps = s('p.hostel_id');
  const byMethod = await query(
    `SELECT p.payment_method, SUM(p.amount) AS amount, COUNT(*) AS count FROM payments p
     WHERE p.status = 'posted' AND p.payment_method <> 'deposit_adjustment' AND p.payment_date BETWEEN ? AND ? AND ${ps.sql}
     GROUP BY p.payment_method ORDER BY amount DESC`,
    [from, to, ...ps.params]
  );
  sendSuccess(res, { data: { from, to, totals, monthly, byCategory, byHostel, byMethod } });
});

module.exports = { listCategories, list, create, update, voidExpense, downloadReceipt, financeSummary };
