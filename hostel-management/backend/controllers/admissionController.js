/**
 * Admissions, allocations, transfers, check-in / check-out (permission: admissions.manage).
 */
const { query, queryOne, pool, withTransaction } = require('../config/db');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/response');
const { paginate, today, addDays } = require('../utils/helpers');
const { hostelScope, findScoped } = require('../utils/scope');
const service = require('../services/admissionService');
const fee = require('../services/feeService');
const { logAudit } = require('../services/auditService');

const ADMISSION_SELECT = `
  SELECT a.*, x.full_name, x.father_name, x.registration_no, x.mobile, x.cnic, x.gender, h.name AS hostel_name,
         rm.id AS room_id, rm.room_number, bd.id AS bed_id, bd.bed_number, b.name AS building_name,
         cu.full_name AS created_by_name, co.full_name AS checked_out_by_name
  FROM admissions a
  JOIN residents x ON x.id = a.resident_id
  JOIN hostels h ON h.id = a.hostel_id
  LEFT JOIN room_allocations ra ON ra.id = (SELECT MAX(id) FROM room_allocations WHERE admission_id = a.id)
  LEFT JOIN rooms rm ON rm.id = ra.room_id
  LEFT JOIN room_beds bd ON bd.id = ra.bed_id
  LEFT JOIN buildings b ON b.id = rm.building_id
  LEFT JOIN users cu ON cu.id = a.created_by
  LEFT JOIN users co ON co.id = a.checked_out_by`;

async function getDetail(id) {
  const admission = await queryOne(`${ADMISSION_SELECT} WHERE a.id = ?`, [id]);
  if (!admission) throw ApiError.notFound('Admission not found');
  admission.allocations = await query(
    `SELECT ra.*, rm.room_number, bd.bed_number, b.name AS building_name, u.full_name AS allocated_by_name
     FROM room_allocations ra JOIN rooms rm ON rm.id = ra.room_id JOIN room_beds bd ON bd.id = ra.bed_id
     JOIN buildings b ON b.id = rm.building_id LEFT JOIN users u ON u.id = ra.allocated_by
     WHERE ra.admission_id = ? ORDER BY ra.id DESC`,
    [id]
  );
  admission.transfers = await query(
    `SELECT t.*, u.full_name AS transferred_by_name,
            CONCAT(fr.room_number, ' / ', fb.bed_number) AS from_bed, CONCAT(tr.room_number, ' / ', tb.bed_number) AS to_bed
     FROM room_transfers t
     JOIN room_allocations fa ON fa.id = t.from_allocation_id JOIN rooms fr ON fr.id = fa.room_id JOIN room_beds fb ON fb.id = fa.bed_id
     JOIN room_allocations ta ON ta.id = t.to_allocation_id JOIN rooms tr ON tr.id = ta.room_id JOIN room_beds tb ON tb.id = ta.bed_id
     LEFT JOIN users u ON u.id = t.transferred_by
     WHERE t.admission_id = ? ORDER BY t.id DESC`,
    [id]
  );
  admission.fee_structures = await query(
    `SELECT s.*, ft.name AS fee_type_name, ft.code AS fee_type_code, ft.is_deduction
     FROM resident_fee_structures s JOIN fee_types ft ON ft.id = s.fee_type_id WHERE s.admission_id = ? ORDER BY s.status, s.id`,
    [id]
  );
  admission.invoices = await query(
    `SELECT id, invoice_no, invoice_type, billing_month, invoice_date, due_date, total_amount, paid_amount, status
     FROM invoices WHERE admission_id = ? ORDER BY id DESC`,
    [id]
  );
  admission.payments = await query(
    `SELECT id, receipt_no, payment_date, amount, unallocated_amount, payment_method, status FROM payments WHERE admission_id = ? ORDER BY id DESC`,
    [id]
  );
  admission.refunds = await query(
    `SELECT id, refund_no, refund_type, amount, refund_date, payment_method, status FROM refunds WHERE admission_id = ? ORDER BY id DESC`,
    [id]
  );
  const conn = await pool.getConnection();
  try {
    admission.balance = await fee.getAdmissionBalance(conn, id);
  } finally {
    conn.release();
  }
  return admission;
}

// GET /api/admissions
const list = asyncHandler(async (req, res) => {
  const { search, status, hostel_id, from, to, leaving_within } = req.q;
  const { limit, offset, meta } = paginate(req.q);
  const scope = hostelScope(req, 'a.hostel_id', hostel_id);
  const where = [scope.sql];
  const params = [...scope.params];
  if (search) {
    where.push('(x.full_name LIKE ? OR x.registration_no LIKE ? OR a.admission_no LIKE ? OR x.cnic LIKE ? OR rm.room_number LIKE ?)');
    params.push(...Array(5).fill(`%${search}%`));
  }
  if (status) where.push('a.status = ?') && params.push(status);
  if (from) where.push('a.admission_date >= ?') && params.push(from);
  if (to) where.push('a.admission_date <= ?') && params.push(to);
  if (leaving_within !== null && leaving_within !== undefined) {
    where.push(`a.status = 'active' AND a.expected_leaving_date IS NOT NULL AND a.expected_leaving_date <= ?`);
    params.push(addDays(today(), leaving_within));
  }
  const whereSql = where.join(' AND ');
  const countSql = `SELECT COUNT(*) AS total FROM (${ADMISSION_SELECT} WHERE ${whereSql}) t`;
  const [{ total }] = await query(countSql, params);
  const rows = await query(
    `${ADMISSION_SELECT} WHERE ${whereSql} ORDER BY ${leaving_within !== null && leaving_within !== undefined ? 'a.expected_leaving_date' : 'a.id DESC'} LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  sendSuccess(res, { data: rows, meta: meta(total) });
});

// GET /api/admissions/:id
const get = asyncHandler(async (req, res) => {
  await findScoped(req, 'admissions', req.params.id, { label: 'Admission', columns: 'id, hostel_id' });
  sendSuccess(res, { data: await getDetail(req.params.id) });
});

// POST /api/admissions
const create = asyncHandler(async (req, res) => {
  const result = await service.createAdmission(req, req.body);
  sendSuccess(res, { statusCode: 201, message: `Admission ${result.admission_no} created`, data: await getDetail(result.id) });
});

// POST /api/admissions/:id/check-in
const checkIn = asyncHandler(async (req, res) => {
  await service.checkIn(req, req.params.id, req.body);
  sendSuccess(res, { message: 'Resident checked in', data: await getDetail(req.params.id) });
});

// POST /api/admissions/:id/transfer
const transfer = asyncHandler(async (req, res) => {
  await service.transfer(req, req.params.id, req.body);
  sendSuccess(res, { message: 'Room transfer completed', data: await getDetail(req.params.id) });
});

// POST /api/admissions/:id/cancel
const cancel = asyncHandler(async (req, res) => {
  await service.cancelAdmission(req, req.params.id, req.body.reason);
  sendSuccess(res, { message: 'Admission cancelled', data: await getDetail(req.params.id) });
});

// GET /api/admissions/:id/checkout-preview?adjust_deposit=true
const checkoutPreview = asyncHandler(async (req, res) => {
  const admission = await findScoped(req, 'admissions', req.params.id, { label: 'Admission' });
  const conn = await pool.getConnection();
  try {
    sendSuccess(res, { data: await service.checkoutPreview(conn, admission, req.q.adjust_deposit !== false) });
  } finally {
    conn.release();
  }
});

// POST /api/admissions/:id/checkout
const checkout = asyncHandler(async (req, res) => {
  const result = await service.checkout(req, req.params.id, req.body);
  sendSuccess(res, { message: 'Checkout completed', data: { settlement: result, admission: await getDetail(req.params.id) } });
});

// POST /api/admissions/:id/fee-structures  { fee_type_id, amount, frequency, effective_from }
const addFeeStructure = asyncHandler(async (req, res) => {
  const admission = await findScoped(req, 'admissions', req.params.id, { label: 'Admission' });
  if (!['pending', 'active'].includes(admission.status)) throw ApiError.conflict('Fee structure can only change for current residents');
  const b = req.body;
  await withTransaction(async (conn) => {
    const [[ft]] = await conn.query('SELECT id, name, code FROM fee_types WHERE id = ? AND status = ?', [b.fee_type_id, 'active']);
    if (!ft) throw ApiError.badRequest('Invalid fee type');
    if (b.frequency === 'monthly') {
      // Only one active monthly line per fee type: close the previous one
      await conn.query(
        `UPDATE resident_fee_structures SET status = 'inactive', effective_to = ? WHERE admission_id = ? AND fee_type_id = ? AND frequency = 'monthly' AND status = 'active'`,
        [addDays(b.effective_from, -1), admission.id, ft.id]
      );
    }
    await conn.query(
      `INSERT INTO resident_fee_structures (hostel_id, resident_id, admission_id, fee_type_id, amount, frequency, effective_from, status, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?)`,
      [admission.hostel_id, admission.resident_id, admission.id, ft.id, b.amount, b.frequency, b.effective_from, req.user.id]
    );
    if (ft.code === 'monthly_rent') await conn.query('UPDATE admissions SET monthly_rent = ? WHERE id = ?', [b.amount, admission.id]);
    await logAudit(conn, req, {
      action: 'fee_structure.update', entityType: 'admission', entityId: admission.id, hostelId: admission.hostel_id,
      description: `Set ${ft.name} to Rs. ${b.amount} (${b.frequency}) from ${b.effective_from} for ${admission.admission_no}`,
    });
  });
  sendSuccess(res, { message: 'Fee structure updated', data: await getDetail(admission.id) });
});

// DELETE /api/admissions/:id/fee-structures/:structureId  (deactivates)
const removeFeeStructure = asyncHandler(async (req, res) => {
  const admission = await findScoped(req, 'admissions', req.params.id, { label: 'Admission' });
  const row = await queryOne('SELECT * FROM resident_fee_structures WHERE id = ? AND admission_id = ?', [req.params.structureId, admission.id]);
  if (!row) throw ApiError.notFound('Fee line not found');
  await query(`UPDATE resident_fee_structures SET status = 'inactive', effective_to = ? WHERE id = ?`, [today(), row.id]);
  await logAudit(null, req, {
    action: 'fee_structure.remove', entityType: 'admission', entityId: admission.id, hostelId: admission.hostel_id,
    description: `Stopped fee line #${row.id} (Rs. ${row.amount}) for ${admission.admission_no}`,
  });
  sendSuccess(res, { message: 'Fee line stopped', data: await getDetail(admission.id) });
});

// GET /api/allocations  (current + history)
const listAllocations = asyncHandler(async (req, res) => {
  const { search, status, hostel_id, room_id } = req.q;
  const { limit, offset, meta } = paginate(req.q);
  const scope = hostelScope(req, 'ra.hostel_id', hostel_id);
  const where = [scope.sql];
  const params = [...scope.params];
  if (search) where.push('(x.full_name LIKE ? OR x.registration_no LIKE ? OR rm.room_number LIKE ?)') && params.push(...Array(3).fill(`%${search}%`));
  if (status) where.push('ra.status = ?') && params.push(status);
  if (room_id) where.push('ra.room_id = ?') && params.push(room_id);
  const base = `FROM room_allocations ra JOIN residents x ON x.id = ra.resident_id JOIN rooms rm ON rm.id = ra.room_id
                JOIN room_beds bd ON bd.id = ra.bed_id JOIN buildings b ON b.id = rm.building_id JOIN hostels h ON h.id = ra.hostel_id
                JOIN admissions a ON a.id = ra.admission_id LEFT JOIN users u ON u.id = ra.allocated_by
                WHERE ${where.join(' AND ')}`;
  const [{ total }] = await query(`SELECT COUNT(*) AS total ${base}`, params);
  const rows = await query(
    `SELECT ra.id, ra.admission_id, a.admission_no, ra.resident_id, x.full_name, x.registration_no, h.name AS hostel_name, b.name AS building_name,
            rm.room_number, bd.bed_number, ra.start_date, ra.end_date, ra.monthly_rent, ra.status, ra.release_reason, u.full_name AS allocated_by_name
     ${base} ORDER BY ra.status = 'active' DESC, ra.id DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  sendSuccess(res, { data: rows, meta: meta(total) });
});

// GET /api/transfers
const listTransfers = asyncHandler(async (req, res) => {
  const { search, hostel_id, from, to } = req.q;
  const { limit, offset, meta } = paginate(req.q);
  const scope = hostelScope(req, 't.hostel_id', hostel_id);
  const where = [scope.sql];
  const params = [...scope.params];
  if (search) where.push('(x.full_name LIKE ? OR x.registration_no LIKE ?)') && params.push(`%${search}%`, `%${search}%`);
  if (from) where.push('t.transfer_date >= ?') && params.push(from);
  if (to) where.push('t.transfer_date <= ?') && params.push(to);
  const base = `FROM room_transfers t JOIN residents x ON x.id = t.resident_id
     JOIN room_allocations fa ON fa.id = t.from_allocation_id JOIN rooms fr ON fr.id = fa.room_id JOIN room_beds fb ON fb.id = fa.bed_id
     JOIN room_allocations ta ON ta.id = t.to_allocation_id JOIN rooms tr ON tr.id = ta.room_id JOIN room_beds tb ON tb.id = ta.bed_id
     JOIN hostels h ON h.id = t.hostel_id LEFT JOIN users u ON u.id = t.transferred_by WHERE ${where.join(' AND ')}`;
  const [{ total }] = await query(`SELECT COUNT(*) AS total ${base}`, params);
  const rows = await query(
    `SELECT t.id, t.admission_id, t.transfer_date, t.reason, x.full_name, x.registration_no, h.name AS hostel_name,
            CONCAT(fr.room_number, ' / ', fb.bed_number) AS from_bed, CONCAT(tr.room_number, ' / ', tb.bed_number) AS to_bed,
            fa.monthly_rent AS from_rent, ta.monthly_rent AS to_rent, u.full_name AS transferred_by_name
     ${base} ORDER BY t.id DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  sendSuccess(res, { data: rows, meta: meta(total) });
});

module.exports = {
  list, get, create, checkIn, transfer, cancel, checkoutPreview, checkout, addFeeStructure, removeFeeStructure, listAllocations, listTransfers,
};
