/**
 * Fees & payments (permission: payments.manage).
 */
const { query, queryOne, withTransaction } = require('../config/db');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/response');
const { paginate, today, monthRange, money } = require('../utils/helpers');
const { hostelScope, assertHostelAccess, findScoped } = require('../utils/scope');
const fee = require('../services/feeService');
const settingsService = require('../services/settingsService');
const { logAudit } = require('../services/auditService');
const { PAYMENT_METHOD_LABELS } = require('../utils/constants');

// ---------------- Fee types ----------------
const listFeeTypes = asyncHandler(async (req, res) => {
  sendSuccess(res, { data: await query('SELECT * FROM fee_types ORDER BY id') });
});

// ---------------- Fee accounts (balances per admission) ----------------
// GET /api/fees/accounts?search=&hostel_id=&only_due=true&status=
const listAccounts = asyncHandler(async (req, res) => {
  const { search, hostel_id, only_due, status } = req.q;
  const { limit, offset, meta } = paginate(req.q);
  const scope = hostelScope(req, 'a.hostel_id', hostel_id);
  const where = [scope.sql, `a.status <> 'cancelled'`];
  const params = [...scope.params];
  if (status) where.push('a.status = ?') && params.push(status);
  else where.push(`(a.status IN ('pending','active') OR COALESCE(inv.outstanding,0) > 0 OR COALESCE(pay.advance,0) > 0)`);
  if (search) {
    where.push('(x.full_name LIKE ? OR x.registration_no LIKE ? OR a.admission_no LIKE ? OR x.mobile LIKE ? OR x.cnic LIKE ?)');
    params.push(...Array(5).fill(`%${search}%`));
  }
  if (only_due) where.push('COALESCE(inv.outstanding,0) > 0');
  const base = `
    FROM admissions a JOIN residents x ON x.id = a.resident_id JOIN hostels h ON h.id = a.hostel_id
    LEFT JOIN room_allocations ra ON ra.id = (SELECT MAX(id) FROM room_allocations WHERE admission_id = a.id)
    LEFT JOIN rooms rm ON rm.id = ra.room_id LEFT JOIN room_beds bd ON bd.id = ra.bed_id
    LEFT JOIN (SELECT admission_id, SUM(total_amount - paid_amount) AS outstanding,
                      SUM(IF(due_date < CURDATE(), total_amount - paid_amount, 0)) AS overdue, MIN(due_date) AS oldest_due
               FROM invoices WHERE status IN ('unpaid','partially_paid') GROUP BY admission_id) inv ON inv.admission_id = a.id
    LEFT JOIN (SELECT admission_id, SUM(unallocated_amount) AS advance FROM payments WHERE status = 'posted' GROUP BY admission_id) pay
      ON pay.admission_id = a.id
    WHERE ${where.join(' AND ')}`;
  const [{ total }] = await query(`SELECT COUNT(*) AS total ${base}`, params);
  const rows = await query(
    `SELECT a.id AS admission_id, a.admission_no, a.status, a.monthly_rent, a.hostel_id, x.id AS resident_id, x.full_name,
            x.registration_no, x.mobile, h.name AS hostel_name, rm.room_number, bd.bed_number,
            COALESCE(inv.outstanding,0) AS outstanding, COALESCE(inv.overdue,0) AS overdue, inv.oldest_due, COALESCE(pay.advance,0) AS advance
     ${base} ORDER BY outstanding DESC, x.full_name LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  const [totals] = await query(
    `SELECT COALESCE(SUM(inv.outstanding),0) AS outstanding, COALESCE(SUM(inv.overdue),0) AS overdue, COALESCE(SUM(pay.advance),0) AS advance ${base}`,
    params
  );
  sendSuccess(res, { data: rows, meta: { ...meta(total), totals } });
});

// ---------------- Invoices ----------------
const INVOICE_BASE = `
  FROM invoices i JOIN residents x ON x.id = i.resident_id JOIN hostels h ON h.id = i.hostel_id
  JOIN admissions a ON a.id = i.admission_id`;

// GET /api/invoices
const listInvoices = asyncHandler(async (req, res) => {
  const { search, status, hostel_id, billing_month, invoice_type, admission_id, resident_id, from, to } = req.q;
  const { limit, offset, meta } = paginate(req.q);
  const scope = hostelScope(req, 'i.hostel_id', hostel_id);
  const where = [scope.sql];
  const params = [...scope.params];
  if (search) where.push('(i.invoice_no LIKE ? OR x.full_name LIKE ? OR x.registration_no LIKE ?)') && params.push(...Array(3).fill(`%${search}%`));
  if (status === 'overdue') where.push(`i.status IN ('unpaid','partially_paid') AND i.due_date < CURDATE()`);
  else if (status === 'outstanding') where.push(`i.status IN ('unpaid','partially_paid')`);
  else if (status) where.push('i.status = ?') && params.push(status);
  if (billing_month) where.push('i.billing_month = ?') && params.push(billing_month);
  if (invoice_type) where.push('i.invoice_type = ?') && params.push(invoice_type);
  if (admission_id) where.push('i.admission_id = ?') && params.push(admission_id);
  if (resident_id) where.push('i.resident_id = ?') && params.push(resident_id);
  if (from) where.push('i.invoice_date >= ?') && params.push(from);
  if (to) where.push('i.invoice_date <= ?') && params.push(to);
  const whereSql = where.join(' AND ');
  const [{ total }] = await query(`SELECT COUNT(*) AS total ${INVOICE_BASE} WHERE ${whereSql}`, params);
  const rows = await query(
    `SELECT i.id, i.invoice_no, i.invoice_type, i.billing_month, i.invoice_date, i.due_date, i.gross_amount, i.discount_amount,
            i.total_amount, i.paid_amount, (i.total_amount - i.paid_amount) AS balance, i.status,
            (i.status IN ('unpaid','partially_paid') AND i.due_date < CURDATE()) AS is_overdue,
            i.admission_id, a.admission_no, i.resident_id, x.full_name, x.registration_no, h.name AS hostel_name
     ${INVOICE_BASE} WHERE ${whereSql} ORDER BY i.id DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  const [totals] = await query(
    `SELECT COALESCE(SUM(IF(i.status <> 'cancelled', i.total_amount, 0)),0) AS total, COALESCE(SUM(IF(i.status <> 'cancelled', i.paid_amount, 0)),0) AS paid,
            COALESCE(SUM(IF(i.status IN ('unpaid','partially_paid'), i.total_amount - i.paid_amount, 0)),0) AS outstanding
     ${INVOICE_BASE} WHERE ${whereSql}`,
    params
  );
  sendSuccess(res, { data: rows, meta: { ...meta(total), totals } });
});

async function getInvoiceDetail(id) {
  const invoice = await queryOne(
    `SELECT i.*, (i.total_amount - i.paid_amount) AS balance, a.admission_no, x.full_name, x.registration_no, x.father_name, x.mobile,
            h.name AS hostel_name, h.address AS hostel_address, h.contact_number AS hostel_contact, u.full_name AS created_by_name,
            cu.full_name AS cancelled_by_name
     ${INVOICE_BASE} LEFT JOIN users u ON u.id = i.created_by LEFT JOIN users cu ON cu.id = i.cancelled_by WHERE i.id = ?`,
    [id]
  );
  if (!invoice) throw ApiError.notFound('Invoice not found');
  invoice.items = await query(
    `SELECT ii.id, ii.description, ii.amount, ft.name AS fee_type_name, ft.code AS fee_type_code, ft.is_deduction
     FROM invoice_items ii JOIN fee_types ft ON ft.id = ii.fee_type_id WHERE ii.invoice_id = ? ORDER BY ii.id`,
    [id]
  );
  invoice.payments = await query(
    `SELECT p.id, p.receipt_no, p.payment_date, p.payment_method, p.status, pa.amount
     FROM payment_allocations pa JOIN payments p ON p.id = pa.payment_id WHERE pa.invoice_id = ? ORDER BY p.id`,
    [id]
  );
  return invoice;
}

// GET /api/invoices/:id
const getInvoice = asyncHandler(async (req, res) => {
  await findScoped(req, 'invoices', req.params.id, { label: 'Invoice', columns: 'id, hostel_id' });
  sendSuccess(res, { data: await getInvoiceDetail(req.params.id) });
});

// POST /api/invoices  (manual invoice)
const createInvoice = asyncHandler(async (req, res) => {
  const b = req.body;
  const admission = await findScoped(req, 'admissions', b.admission_id, { label: 'Admission' });
  if (admission.status === 'cancelled') throw ApiError.conflict('Cannot invoice a cancelled admission');
  if (b.due_date < b.invoice_date) throw new ApiError(422, 'Due date cannot be before invoice date', { due_date: 'Due date cannot be before invoice date' });
  const invoice = await withTransaction(async (conn) => {
    const inv = await fee.createInvoice(conn, req, {
      hostelId: admission.hostel_id, residentId: admission.resident_id, admissionId: admission.id, type: 'manual',
      invoiceDate: b.invoice_date, dueDate: b.due_date, items: b.items, remarks: b.remarks,
    });
    await logAudit(conn, req, {
      action: 'invoice.create', entityType: 'invoice', entityId: inv.id, hostelId: admission.hostel_id,
      description: `Created invoice ${inv.invoice_no} of Rs. ${inv.total_amount} for ${admission.admission_no}`,
    });
    return inv;
  });
  sendSuccess(res, { statusCode: 201, message: `Invoice ${invoice.invoice_no} created`, data: await getInvoiceDetail(invoice.id) });
});

// POST /api/invoices/:id/cancel
const cancelInvoice = asyncHandler(async (req, res) => {
  await findScoped(req, 'invoices', req.params.id, { label: 'Invoice', columns: 'id, hostel_id' });
  await withTransaction(async (conn) => {
    const [[inv]] = await conn.query('SELECT * FROM invoices WHERE id = ? FOR UPDATE', [req.params.id]);
    if (inv.status === 'cancelled') throw ApiError.conflict('Invoice is already cancelled');
    if (Number(inv.paid_amount) > 0) throw ApiError.conflict('Invoice has payments. Reverse the payments before cancelling.');
    await conn.query(`UPDATE invoices SET status = 'cancelled', cancelled_by = ?, cancelled_at = NOW(), cancel_reason = ? WHERE id = ?`, [
      req.user.id, req.body.reason, inv.id,
    ]);
    await logAudit(conn, req, {
      action: 'invoice.cancel', entityType: 'invoice', entityId: inv.id, hostelId: inv.hostel_id,
      description: `Cancelled invoice ${inv.invoice_no}: ${req.body.reason}`,
    });
  });
  sendSuccess(res, { message: 'Invoice cancelled', data: await getInvoiceDetail(req.params.id) });
});

/** Monthly invoice generation for one hostel. Skips admissions already invoiced for the month. */
async function generateMonthlyForHostel(req, hostelId, billingMonth, dueDate) {
  const { start, end } = monthRange(billingMonth);
  const admissions = await query(
    `SELECT a.* FROM admissions a WHERE a.hostel_id = ? AND a.status = 'active' AND a.admission_date <= ? ORDER BY a.id`,
    [hostelId, end]
  );
  const result = { created: 0, skipped: 0, totalAmount: 0, invoices: [] };
  for (const admission of admissions) {
    await withTransaction(async (conn) => {
      const [[existing]] = await conn.query(
        `SELECT id FROM invoices WHERE admission_id = ? AND billing_month = ? AND invoice_type = 'monthly' AND status <> 'cancelled' FOR UPDATE`,
        [admission.id, billingMonth]
      );
      if (existing) {
        result.skipped += 1;
        return;
      }
      // Latest applicable line per fee type for this month
      const [lines] = await conn.query(
        `SELECT s.fee_type_id, s.amount, ft.name FROM resident_fee_structures s JOIN fee_types ft ON ft.id = s.fee_type_id
         WHERE s.admission_id = ? AND s.frequency = 'monthly' AND s.effective_from <= ? AND (s.effective_to IS NULL OR s.effective_to >= ?)
           AND s.id = (SELECT s2.id FROM resident_fee_structures s2 WHERE s2.admission_id = s.admission_id AND s2.fee_type_id = s.fee_type_id
                       AND s2.frequency = 'monthly' AND s2.effective_from <= ? AND (s2.effective_to IS NULL OR s2.effective_to >= ?)
                       ORDER BY s2.effective_from DESC, s2.id DESC LIMIT 1)`,
        [admission.id, end, start, end, start]
      );
      const items = lines.map((l) => ({ fee_type_id: l.fee_type_id, amount: l.amount, description: `${l.name} - ${billingMonth}` }));
      if (!items.some((i) => i.amount > 0)) {
        result.skipped += 1;
        return;
      }
      const inv = await fee.createInvoice(conn, req, {
        hostelId, residentId: admission.resident_id, admissionId: admission.id, type: 'monthly', billingMonth,
        invoiceDate: start > admission.admission_date ? start : admission.admission_date, dueDate, items,
      });
      result.created += 1;
      result.totalAmount = money(result.totalAmount + inv.total_amount);
      result.invoices.push(inv.invoice_no);
    });
  }
  return result;
}

// POST /api/invoices/generate-monthly  { hostel_id, billing_month, due_date }
const generateMonthly = asyncHandler(async (req, res) => {
  const { hostel_id, billing_month } = req.body;
  assertHostelAccess(req, hostel_id);
  const dueDay = await settingsService.getSetting('fee_due_day', 10);
  const { start, end } = monthRange(billing_month);
  const dueDate = req.body.due_date || `${billing_month}-${String(Math.min(Number(dueDay) || 10, Number(end.slice(-2)))).padStart(2, '0')}`;
  if (dueDate < start) throw new ApiError(422, 'Due date must be in or after the billing month', { due_date: 'Due date must be in or after the billing month' });
  const result = await generateMonthlyForHostel(req, hostel_id, billing_month, dueDate);
  await logAudit(null, req, {
    action: 'invoice.generate_monthly', entityType: 'hostel', entityId: hostel_id, hostelId: hostel_id,
    description: `Generated ${result.created} monthly invoice(s) for ${billing_month} (Rs. ${result.totalAmount}); ${result.skipped} skipped`,
  });
  sendSuccess(res, {
    message: `${result.created} invoice(s) generated, ${result.skipped} skipped (already invoiced or no charges)`,
    data: result,
  });
});

// POST /api/invoices/apply-late-fines  { hostel_id }
const applyLateFines = asyncHandler(async (req, res) => {
  const { hostel_id } = req.body;
  assertHostelAccess(req, hostel_id);
  const fine = Number(await settingsService.getSetting('late_fine_amount', 0));
  if (!(fine > 0)) throw ApiError.badRequest('Late fine amount is 0. Set it in Settings → Fees first.');
  const invoices = await query(
    `SELECT i.id FROM invoices i WHERE i.hostel_id = ? AND i.status IN ('unpaid','partially_paid') AND i.due_date < CURDATE()
       AND NOT EXISTS (SELECT 1 FROM invoice_items ii JOIN fee_types ft ON ft.id = ii.fee_type_id WHERE ii.invoice_id = i.id AND ft.code = 'late_fine')`,
    [hostel_id]
  );
  let applied = 0;
  for (const { id } of invoices) {
    await withTransaction(async (conn) => {
      const fineTypeId = await fee.feeTypeIdByCode(conn, 'late_fine');
      const [[inv]] = await conn.query('SELECT * FROM invoices WHERE id = ? FOR UPDATE', [id]);
      if (!['unpaid', 'partially_paid'].includes(inv.status)) return;
      await conn.query('INSERT INTO invoice_items (invoice_id, fee_type_id, description, amount) VALUES (?, ?, ?, ?)', [id, fineTypeId, 'Late Payment Fine', fine]);
      const total = money(Number(inv.total_amount) + fine);
      await conn.query('UPDATE invoices SET gross_amount = gross_amount + ?, total_amount = ?, status = ? WHERE id = ?', [
        fine, total, fee.invoiceStatusFor(total, Number(inv.paid_amount)), id,
      ]);
      await fee.applyAdvanceCredit(conn, inv.admission_id);
      applied += 1;
    });
  }
  await logAudit(null, req, {
    action: 'invoice.late_fines', entityType: 'hostel', entityId: hostel_id, hostelId: hostel_id,
    description: `Applied late fine of Rs. ${fine} to ${applied} overdue invoice(s)`,
  });
  sendSuccess(res, { message: `Late fine applied to ${applied} overdue invoice(s)`, data: { applied, fine } });
});

// ---------------- Payments ----------------
const PAYMENT_BASE = `
  FROM payments p JOIN residents x ON x.id = p.resident_id JOIN hostels h ON h.id = p.hostel_id
  JOIN admissions a ON a.id = p.admission_id LEFT JOIN users u ON u.id = p.received_by`;

// GET /api/payments
const listPayments = asyncHandler(async (req, res) => {
  const { search, status, hostel_id, payment_method, from, to, admission_id } = req.q;
  const { limit, offset, meta } = paginate(req.q);
  const scope = hostelScope(req, 'p.hostel_id', hostel_id);
  const where = [scope.sql];
  const params = [...scope.params];
  if (search) where.push('(p.receipt_no LIKE ? OR x.full_name LIKE ? OR x.registration_no LIKE ? OR p.reference_no LIKE ?)') && params.push(...Array(4).fill(`%${search}%`));
  if (status) where.push('p.status = ?') && params.push(status);
  if (payment_method) where.push('p.payment_method = ?') && params.push(payment_method);
  if (from) where.push('p.payment_date >= ?') && params.push(from);
  if (to) where.push('p.payment_date <= ?') && params.push(to);
  if (admission_id) where.push('p.admission_id = ?') && params.push(admission_id);
  const whereSql = where.join(' AND ');
  const [{ total }] = await query(`SELECT COUNT(*) AS total ${PAYMENT_BASE} WHERE ${whereSql}`, params);
  const rows = await query(
    `SELECT p.id, p.receipt_no, p.payment_date, p.amount, p.unallocated_amount, p.payment_method, p.reference_no, p.status,
            p.admission_id, a.admission_no, x.full_name, x.registration_no, h.name AS hostel_name, u.full_name AS received_by_name
     ${PAYMENT_BASE} WHERE ${whereSql} ORDER BY p.id DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  const [totals] = await query(
    `SELECT COALESCE(SUM(IF(p.status = 'posted' AND p.payment_method <> 'deposit_adjustment', p.amount, 0)),0) AS collected ${PAYMENT_BASE} WHERE ${whereSql}`,
    params
  );
  sendSuccess(res, { data: rows, meta: { ...meta(total), totals } });
});

// POST /api/payments
const createPayment = asyncHandler(async (req, res) => {
  const b = req.body;
  const admission = await findScoped(req, 'admissions', b.admission_id, { label: 'Admission' });
  if (admission.status === 'cancelled') throw ApiError.conflict('Cannot collect payment for a cancelled admission');
  const payment = await withTransaction(async (conn) => {
    const [[locked]] = await conn.query('SELECT * FROM admissions WHERE id = ? FOR UPDATE', [admission.id]);
    if (b.invoice_ids.length) {
      const [own] = await conn.query('SELECT id FROM invoices WHERE id IN (?) AND admission_id = ?', [b.invoice_ids, admission.id]);
      if (own.length !== b.invoice_ids.length) throw ApiError.badRequest('Selected invoices do not belong to this resident');
    }
    const p = await fee.recordPayment(conn, req, {
      admission: locked, amount: b.amount, paymentDate: b.payment_date, method: b.payment_method,
      referenceNo: b.reference_no, remarks: b.remarks, invoiceIds: b.invoice_ids,
    });
    await logAudit(conn, req, {
      action: 'payment.create', entityType: 'payment', entityId: p.id, hostelId: admission.hostel_id,
      description: `Received Rs. ${b.amount} (${PAYMENT_METHOD_LABELS[b.payment_method]}) - receipt ${p.receipt_no}${p.advance > 0 ? `, Rs. ${p.advance} kept as advance` : ''}`,
    });
    return p;
  });
  sendSuccess(res, { statusCode: 201, message: `Payment recorded. Receipt ${payment.receipt_no}`, data: payment });
});

// GET /api/payments/:id/receipt
const getReceipt = asyncHandler(async (req, res) => {
  const payment = await findScoped(req, 'payments', req.params.id, { label: 'Payment' });
  const settings = await settingsService.getSettings();
  const detail = await queryOne(
    `SELECT p.*, a.admission_no, x.full_name, x.father_name, x.registration_no, x.mobile, h.name AS hostel_name, h.address AS hostel_address,
            h.city AS hostel_city, h.contact_number AS hostel_contact, h.email AS hostel_email, u.full_name AS received_by_name,
            ru.full_name AS reversed_by_name
     ${PAYMENT_BASE} LEFT JOIN users ru ON ru.id = p.reversed_by WHERE p.id = ?`,
    [payment.id]
  );
  const room = await queryOne(
    `SELECT rm.room_number, bd.bed_number, b.name AS building_name FROM room_allocations ra
     JOIN rooms rm ON rm.id = ra.room_id JOIN room_beds bd ON bd.id = ra.bed_id JOIN buildings b ON b.id = rm.building_id
     WHERE ra.admission_id = ? AND ra.start_date <= ? ORDER BY ra.start_date DESC, ra.id DESC LIMIT 1`,
    [payment.admission_id, payment.payment_date]
  );
  const allocations = await query(
    `SELECT pa.amount, i.id AS invoice_id, i.invoice_no, i.billing_month, i.invoice_type, i.total_amount, i.paid_amount,
            (SELECT GROUP_CONCAT(ii.description ORDER BY ii.id SEPARATOR ', ') FROM invoice_items ii WHERE ii.invoice_id = i.id) AS description
     FROM payment_allocations pa JOIN invoices i ON i.id = pa.invoice_id WHERE pa.payment_id = ? ORDER BY i.due_date, i.id`,
    [payment.id]
  );
  const [balance] = await query(
    `SELECT COALESCE(SUM(total_amount - paid_amount),0) AS outstanding FROM invoices WHERE admission_id = ? AND status IN ('unpaid','partially_paid')`,
    [payment.admission_id]
  );
  sendSuccess(res, {
    data: {
      ...detail,
      payment_method_label: PAYMENT_METHOD_LABELS[detail.payment_method],
      room,
      allocations,
      remaining_balance: balance.outstanding,
      settings: { appName: settings.app_name, currency: settings.currency, footer: settings.receipt_footer },
    },
  });
});

// POST /api/payments/:id/reverse  { reason }
const reversePayment = asyncHandler(async (req, res) => {
  const payment = await findScoped(req, 'payments', req.params.id, { label: 'Payment' });
  await withTransaction(async (conn) => {
    await fee.reversePayment(conn, req, payment.id, req.body.reason);
    await logAudit(conn, req, {
      action: 'payment.reverse', entityType: 'payment', entityId: payment.id, hostelId: payment.hostel_id,
      description: `Reversed payment ${payment.receipt_no} of Rs. ${payment.amount}: ${req.body.reason}`,
    });
  });
  sendSuccess(res, { message: 'Payment reversed' });
});

// ---------------- Refunds ----------------
// GET /api/refunds
const listRefunds = asyncHandler(async (req, res) => {
  const { search, hostel_id, refund_type, from, to } = req.q;
  const { limit, offset, meta } = paginate(req.q);
  const scope = hostelScope(req, 'f.hostel_id', hostel_id);
  const where = [scope.sql];
  const params = [...scope.params];
  if (search) where.push('(f.refund_no LIKE ? OR x.full_name LIKE ?)') && params.push(`%${search}%`, `%${search}%`);
  if (refund_type) where.push('f.refund_type = ?') && params.push(refund_type);
  if (from) where.push('f.refund_date >= ?') && params.push(from);
  if (to) where.push('f.refund_date <= ?') && params.push(to);
  const base = `FROM refunds f JOIN residents x ON x.id = f.resident_id JOIN hostels h ON h.id = f.hostel_id
                JOIN admissions a ON a.id = f.admission_id LEFT JOIN users u ON u.id = f.processed_by WHERE ${where.join(' AND ')}`;
  const [{ total }] = await query(`SELECT COUNT(*) AS total ${base}`, params);
  const rows = await query(
    `SELECT f.*, a.admission_no, x.full_name, x.registration_no, h.name AS hostel_name, u.full_name AS processed_by_name
     ${base} ORDER BY f.id DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  sendSuccess(res, { data: rows, meta: meta(total) });
});

// POST /api/refunds
const createRefund = asyncHandler(async (req, res) => {
  const b = req.body;
  const admission = await findScoped(req, 'admissions', b.admission_id, { label: 'Admission' });
  const refund = await withTransaction(async (conn) => {
    const [[locked]] = await conn.query('SELECT * FROM admissions WHERE id = ? FOR UPDATE', [admission.id]);
    if (b.refund_type === 'security_deposit' && ['pending', 'active'].includes(locked.status)) {
      throw ApiError.conflict('Security deposit is refunded at checkout while the resident is still staying');
    }
    return fee.createRefund(conn, req, {
      admission: locked, refundType: b.refund_type, amount: b.amount, refundDate: b.refund_date, method: b.payment_method,
      referenceNo: b.reference_no, reason: b.reason,
    });
  });
  sendSuccess(res, { statusCode: 201, message: `Refund ${refund.refund_no} recorded`, data: refund });
});

module.exports = {
  listFeeTypes, listAccounts, listInvoices, getInvoice, createInvoice, cancelInvoice, generateMonthly, applyLateFines,
  listPayments, createPayment, getReceipt, reversePayment, listRefunds, createRefund, generateMonthlyForHostel,
};
