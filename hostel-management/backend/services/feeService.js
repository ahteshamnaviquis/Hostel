/**
 * Fee engine: invoices, payments, allocation of payments to invoices,
 * advance credit, security deposit tracking and refunds.
 *
 * ALL functions take a transaction connection (`conn`) and must be called
 * inside withTransaction(). Rows that are changed are locked FOR UPDATE.
 *
 * Money rules
 *  - invoice.total_amount = charges - deductions (never negative)
 *  - invoice.paid_amount is the sum of payment_allocations of POSTED payments
 *  - payment.unallocated_amount = advance credit not yet applied to invoices
 *  - Payments are allocated FIFO (oldest due invoice first) unless invoice ids are given
 *  - Nothing is deleted: invoices are cancelled, payments/refunds reversed
 */
const ApiError = require('../utils/ApiError');
const { tempNumber, assignNumber, money } = require('../utils/helpers');
const settingsService = require('./settingsService');
const { logAudit } = require('./auditService');

const invoiceStatusFor = (total, paid) => (paid <= 0 ? 'unpaid' : paid + 0.001 >= total ? 'paid' : 'partially_paid');

/** Loads fee types by id -> row */
async function feeTypeMap(conn) {
  const [rows] = await conn.query('SELECT id, code, name, is_deduction FROM fee_types');
  return Object.fromEntries(rows.map((r) => [r.id, r]));
}

async function feeTypeIdByCode(conn, code) {
  const [[row]] = await conn.query('SELECT id FROM fee_types WHERE code = ?', [code]);
  if (!row) throw new Error(`Fee type ${code} missing - run npm run db:init`);
  return row.id;
}

/**
 * Creates an invoice with items and applies any advance credit.
 * items: [{ fee_type_id, amount, description }]
 */
async function createInvoice(conn, req, { hostelId, residentId, admissionId, type, billingMonth = null, invoiceDate, dueDate, items, remarks = null }) {
  const types = await feeTypeMap(conn);
  let gross = 0;
  let discount = 0;
  const cleanItems = items
    .filter((it) => Number(it.amount) > 0)
    .map((it) => {
      const ft = types[it.fee_type_id];
      if (!ft) throw ApiError.badRequest('Invalid fee type');
      if (ft.is_deduction) discount += Number(it.amount);
      else gross += Number(it.amount);
      return { ...it, amount: money(it.amount), description: it.description || ft.name };
    });
  if (!cleanItems.length) throw ApiError.badRequest('An invoice needs at least one item with an amount');
  gross = money(gross);
  discount = money(discount);
  if (discount > gross) throw ApiError.badRequest('Discount cannot be greater than the charges');
  const total = money(gross - discount);

  const [result] = await conn.query(
    `INSERT INTO invoices (hostel_id, resident_id, admission_id, invoice_no, invoice_type, billing_month, invoice_date, due_date,
       gross_amount, discount_amount, total_amount, paid_amount, status, remarks, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
    [hostelId, residentId, admissionId, tempNumber(), type, billingMonth, invoiceDate, dueDate, gross, discount, total,
      total === 0 ? 'paid' : 'unpaid', remarks, req.user.id]
  );
  const invoiceId = result.insertId;
  const prefix = await settingsService.getSetting('invoice_prefix', 'INV');
  const invoiceNo = await assignNumber(conn, 'invoices', 'invoice_no', prefix, invoiceId);
  await conn.query('INSERT INTO invoice_items (invoice_id, fee_type_id, description, amount) VALUES ?', [
    cleanItems.map((it) => [invoiceId, it.fee_type_id, String(it.description).slice(0, 255), it.amount]),
  ]);
  await applyAdvanceCredit(conn, admissionId);
  return { id: invoiceId, invoice_no: invoiceNo, total_amount: total };
}

/**
 * Allocates up to `amount` from a payment to outstanding invoices of the admission.
 * preferredInvoiceIds are paid first, then the rest FIFO by due date.
 * Returns the amount allocated.
 */
async function allocateToInvoices(conn, paymentId, admissionId, amount, preferredInvoiceIds = []) {
  let remaining = money(amount);
  if (remaining <= 0) return 0;
  const [invoices] = await conn.query(
    `SELECT id, total_amount, paid_amount FROM invoices
     WHERE admission_id = ? AND status IN ('unpaid','partially_paid')
     ORDER BY FIELD(id, ${preferredInvoiceIds.length ? preferredInvoiceIds.map(() => '?').join(',') : 'NULL'}) DESC, due_date, id
     FOR UPDATE`,
    [admissionId, ...[...preferredInvoiceIds].reverse()]
  );
  let allocated = 0;
  for (const inv of invoices) {
    if (remaining <= 0) break;
    const due = money(inv.total_amount - inv.paid_amount);
    if (due <= 0) continue;
    const apply = Math.min(due, remaining);
    const newPaid = money(Number(inv.paid_amount) + apply);
    await conn.query('UPDATE invoices SET paid_amount = ?, status = ? WHERE id = ?', [newPaid, invoiceStatusFor(inv.total_amount, newPaid), inv.id]);
    await conn.query(
      `INSERT INTO payment_allocations (payment_id, invoice_id, amount) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE amount = amount + VALUES(amount)`,
      [paymentId, inv.id, apply]
    );
    remaining = money(remaining - apply);
    allocated = money(allocated + apply);
  }
  return allocated;
}

/** Applies unused advance credit (payments.unallocated_amount) of an admission to its outstanding invoices. */
async function applyAdvanceCredit(conn, admissionId) {
  const [payments] = await conn.query(
    `SELECT id, unallocated_amount FROM payments WHERE admission_id = ? AND status = 'posted' AND unallocated_amount > 0 ORDER BY id FOR UPDATE`,
    [admissionId]
  );
  for (const p of payments) {
    const used = await allocateToInvoices(conn, p.id, admissionId, p.unallocated_amount);
    if (used <= 0) break;
    await conn.query('UPDATE payments SET unallocated_amount = unallocated_amount - ? WHERE id = ?', [used, p.id]);
  }
}

/**
 * Records a payment and allocates it. Any surplus stays as advance credit.
 */
async function recordPayment(conn, req, { admission, amount, paymentDate, method, referenceNo = null, remarks = null, invoiceIds = [] }) {
  amount = money(amount);
  if (amount <= 0) throw ApiError.badRequest('Amount must be greater than zero');
  const [result] = await conn.query(
    `INSERT INTO payments (hostel_id, resident_id, admission_id, receipt_no, payment_date, amount, unallocated_amount,
       payment_method, reference_no, remarks, status, received_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'posted', ?)`,
    [admission.hostel_id, admission.resident_id, admission.id, tempNumber(), paymentDate, amount, amount, method, referenceNo, remarks, req.user.id]
  );
  const paymentId = result.insertId;
  const prefix = method === 'deposit_adjustment' ? 'ADJ' : await settingsService.getSetting('receipt_prefix', 'RCP');
  const receiptNo = await assignNumber(conn, 'payments', 'receipt_no', prefix, paymentId);
  const allocated = await allocateToInvoices(conn, paymentId, admission.id, amount, invoiceIds);
  await conn.query('UPDATE payments SET unallocated_amount = ? WHERE id = ?', [money(amount - allocated), paymentId]);
  return { id: paymentId, receipt_no: receiptNo, allocated, advance: money(amount - allocated) };
}

/** Reverses a posted payment: removes its effect on invoices. History rows are kept. */
async function reversePayment(conn, req, paymentId, reason) {
  const [[p]] = await conn.query('SELECT * FROM payments WHERE id = ? FOR UPDATE', [paymentId]);
  if (!p) throw ApiError.notFound('Payment not found');
  if (p.status !== 'posted') throw ApiError.conflict('This payment is already reversed');
  if (p.payment_method === 'deposit_adjustment') throw ApiError.conflict('Deposit adjustments made at checkout cannot be reversed');
  const [allocs] = await conn.query('SELECT invoice_id, amount FROM payment_allocations WHERE payment_id = ?', [p.id]);
  const allocatedTotal = money(allocs.reduce((s, a) => s + Number(a.amount), 0));
  if (money(p.amount - allocatedTotal - p.unallocated_amount) > 0) {
    throw ApiError.conflict('Part of this payment was refunded as advance. Reverse the refund first.');
  }
  for (const a of allocs) {
    const [[inv]] = await conn.query('SELECT id, total_amount, paid_amount, status FROM invoices WHERE id = ? FOR UPDATE', [a.invoice_id]);
    const newPaid = money(Math.max(0, inv.paid_amount - a.amount));
    const status = inv.status === 'cancelled' ? 'cancelled' : invoiceStatusFor(inv.total_amount, newPaid);
    await conn.query('UPDATE invoices SET paid_amount = ?, status = ? WHERE id = ?', [newPaid, status, inv.id]);
  }
  await conn.query(
    `UPDATE payments SET status = 'reversed', unallocated_amount = 0, reversed_by = ?, reversed_at = NOW(), reversal_reason = ? WHERE id = ?`,
    [req.user.id, reason, p.id]
  );
  return p;
}

/**
 * Balance summary for an admission (deposit figures exclude deposit-adjustment allocations).
 */
async function getAdmissionBalance(conn, admissionId) {
  const [[inv]] = await conn.query(
    `SELECT COALESCE(SUM(total_amount),0) AS invoiced, COALESCE(SUM(paid_amount),0) AS paid,
            COALESCE(SUM(IF(status IN ('unpaid','partially_paid'), total_amount - paid_amount, 0)),0) AS outstanding
     FROM invoices WHERE admission_id = ? AND status <> 'cancelled'`,
    [admissionId]
  );
  const [[adv]] = await conn.query(
    `SELECT COALESCE(SUM(unallocated_amount),0) AS advance FROM payments WHERE admission_id = ? AND status = 'posted'`,
    [admissionId]
  );
  const [[dep]] = await conn.query(
    `SELECT COALESCE(SUM(d.deposit),0) AS charged,
            COALESCE(SUM(LEAST(d.deposit, GREATEST(0, i.paid_amount - COALESCE(adj.amount, 0)))),0) AS collected
     FROM invoices i
     JOIN (SELECT ii.invoice_id, SUM(ii.amount) AS deposit FROM invoice_items ii JOIN fee_types ft ON ft.id = ii.fee_type_id
           WHERE ft.code = 'security_deposit' GROUP BY ii.invoice_id) d ON d.invoice_id = i.id
     LEFT JOIN (SELECT pa.invoice_id, SUM(pa.amount) AS amount FROM payment_allocations pa JOIN payments p ON p.id = pa.payment_id
                WHERE p.payment_method = 'deposit_adjustment' AND p.status = 'posted' GROUP BY pa.invoice_id) adj ON adj.invoice_id = i.id
     WHERE i.admission_id = ? AND i.status <> 'cancelled'`,
    [admissionId]
  );
  const [[ref]] = await conn.query(
    `SELECT COALESCE(SUM(IF(refund_type = 'security_deposit', amount, 0)),0) AS deposit_refunded,
            COALESCE(SUM(IF(refund_type <> 'security_deposit', amount, 0)),0) AS other_refunded
     FROM refunds WHERE admission_id = ? AND status = 'posted'`,
    [admissionId]
  );
  const [[adjusted]] = await conn.query(
    `SELECT COALESCE(SUM(amount),0) AS amount FROM payments WHERE admission_id = ? AND status = 'posted' AND payment_method = 'deposit_adjustment'`,
    [admissionId]
  );
  const depositHeld = money(dep.collected - ref.deposit_refunded - adjusted.amount);
  return {
    invoiced: money(inv.invoiced),
    paid: money(inv.paid),
    outstanding: money(inv.outstanding),
    advance: money(adv.advance),
    depositCharged: money(dep.charged),
    depositCollected: money(dep.collected),
    depositRefunded: money(ref.deposit_refunded),
    depositAdjusted: money(adjusted.amount),
    depositHeld: Math.max(0, depositHeld),
    otherRefunded: money(ref.other_refunded),
  };
}

/** Uses advance credit (unallocated amounts, oldest first) for an advance refund. Returns the first payment id used. */
async function consumeAdvance(conn, admissionId, amount) {
  const [payments] = await conn.query(
    `SELECT id, unallocated_amount FROM payments WHERE admission_id = ? AND status = 'posted' AND unallocated_amount > 0 ORDER BY id FOR UPDATE`,
    [admissionId]
  );
  let remaining = money(amount);
  let firstId = null;
  for (const p of payments) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, Number(p.unallocated_amount));
    await conn.query('UPDATE payments SET unallocated_amount = unallocated_amount - ? WHERE id = ?', [take, p.id]);
    firstId = firstId || p.id;
    remaining = money(remaining - take);
  }
  if (remaining > 0) throw ApiError.badRequest('Refund is more than the available advance credit');
  return firstId;
}

/**
 * Creates a refund after validating the refundable amount.
 * security_deposit: up to the deposit currently held; advance/overpayment: up to advance credit.
 */
async function createRefund(conn, req, { admission, refundType, amount, refundDate, method, referenceNo = null, reason = null }) {
  amount = money(amount);
  if (amount <= 0) throw ApiError.badRequest('Refund amount must be greater than zero');
  const balance = await getAdmissionBalance(conn, admission.id);
  let paymentId = null;
  if (refundType === 'security_deposit') {
    if (amount > balance.depositHeld) {
      throw ApiError.badRequest(`Only Rs. ${balance.depositHeld} of security deposit is available for refund`);
    }
  } else if (refundType === 'advance' || refundType === 'overpayment') {
    if (amount > balance.advance) throw ApiError.badRequest(`Only Rs. ${balance.advance} of advance credit is available for refund`);
    paymentId = await consumeAdvance(conn, admission.id, amount);
  }
  const [result] = await conn.query(
    `INSERT INTO refunds (hostel_id, resident_id, admission_id, payment_id, refund_no, refund_type, amount, refund_date,
       payment_method, reference_no, reason, status, processed_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'posted', ?)`,
    [admission.hostel_id, admission.resident_id, admission.id, paymentId, tempNumber(), refundType, amount, refundDate, method,
      referenceNo, reason, req.user.id]
  );
  const refundNo = await assignNumber(conn, 'refunds', 'refund_no', 'RFD', result.insertId);
  await logAudit(conn, req, {
    action: 'refund.create', entityType: 'refund', entityId: result.insertId, hostelId: admission.hostel_id,
    description: `Refund ${refundNo}: Rs. ${amount} (${refundType.replace('_', ' ')})`,
  });
  return { id: result.insertId, refund_no: refundNo, amount };
}

module.exports = {
  invoiceStatusFor, feeTypeIdByCode, createInvoice, allocateToInvoices, applyAdvanceCredit, recordPayment, reversePayment,
  getAdmissionBalance, createRefund,
};
