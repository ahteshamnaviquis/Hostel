/**
 * Daily operations: attendance (CHUNK 10), visitors (CHUNK 11), complaints (CHUNK 12).
 */
const { query, queryOne, withTransaction } = require('../config/db');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/response');
const { paginate, today, monthRange, tempNumber, assignNumber } = require('../utils/helpers');
const { hostelScope, assertHostelAccess, findScoped } = require('../utils/scope');
const { logAudit } = require('../services/auditService');
const { notifyHostel } = require('../services/notificationService');

/* ============================ ATTENDANCE ============================ */

// GET /api/attendance/sheet?hostel_id=&date=  - current residents with their mark for the date
const attendanceSheet = asyncHandler(async (req, res) => {
  const { hostel_id, date, search } = req.q;
  assertHostelAccess(req, hostel_id);
  const params = [date, hostel_id, date, date];
  let searchSql = '';
  if (search) {
    searchSql = 'AND (x.full_name LIKE ? OR x.registration_no LIKE ? OR rm.room_number LIKE ?)';
    params.push(...Array(3).fill(`%${search}%`));
  }
  const rows = await query(
    `SELECT x.id AS resident_id, x.full_name, x.registration_no, rm.room_number, bd.bed_number,
            att.id AS attendance_id, att.status, att.entry_time, att.remarks
     FROM admissions a JOIN residents x ON x.id = a.resident_id
     LEFT JOIN room_allocations ra ON ra.admission_id = a.id AND ra.status = 'active'
     LEFT JOIN rooms rm ON rm.id = ra.room_id LEFT JOIN room_beds bd ON bd.id = ra.bed_id
     LEFT JOIN attendance att ON att.resident_id = x.id AND att.attendance_date = ?
     WHERE a.hostel_id = ? AND a.check_in_date IS NOT NULL AND a.check_in_date <= ?
       AND (a.status = 'active' OR (a.status = 'checked_out' AND a.checkout_date >= ?)) ${searchSql}
     ORDER BY rm.room_number, bd.bed_number, x.full_name`,
    params
  );
  const summary = rows.reduce(
    (acc, r) => {
      acc[r.status || 'unmarked'] = (acc[r.status || 'unmarked'] || 0) + 1;
      return acc;
    },
    { present: 0, absent: 0, leave: 0, late: 0, unmarked: 0 }
  );
  sendSuccess(res, { data: rows, meta: { summary, total: rows.length } });
});

// POST /api/attendance  { hostel_id, attendance_date, records: [{ resident_id, status, entry_time, remarks }] }
// Upsert: one row per resident per date (unique index) - re-saving updates instead of duplicating.
const saveAttendance = asyncHandler(async (req, res) => {
  const { hostel_id, attendance_date, records } = req.body;
  assertHostelAccess(req, hostel_id);
  if (attendance_date > today()) throw ApiError.badRequest('Attendance cannot be marked for a future date');
  const ids = records.map((r) => r.resident_id);
  const valid = await query(
    `SELECT DISTINCT a.resident_id FROM admissions a WHERE a.hostel_id = ? AND a.resident_id IN (?) AND a.check_in_date IS NOT NULL AND a.check_in_date <= ?
       AND (a.status = 'active' OR (a.status = 'checked_out' AND a.checkout_date >= ?))`,
    [hostel_id, ids, attendance_date, attendance_date]
  );
  const validSet = new Set(valid.map((v) => v.resident_id));
  const invalid = ids.filter((id) => !validSet.has(id));
  if (invalid.length) throw ApiError.badRequest('Some residents were not staying in this hostel on that date');
  await withTransaction(async (conn) => {
    await conn.query(
      `INSERT INTO attendance (hostel_id, resident_id, attendance_date, status, entry_time, remarks, marked_by) VALUES ?
       ON DUPLICATE KEY UPDATE status = VALUES(status), entry_time = VALUES(entry_time), remarks = VALUES(remarks), marked_by = VALUES(marked_by)`,
      [records.map((r) => [hostel_id, r.resident_id, attendance_date, r.status, r.status === 'late' ? r.entry_time : null, r.remarks, req.user.id])]
    );
    await logAudit(conn, req, {
      action: 'attendance.save', entityType: 'hostel', entityId: hostel_id, hostelId: hostel_id,
      description: `Saved attendance for ${records.length} resident(s) on ${attendance_date}`,
    });
  });
  sendSuccess(res, { message: `Attendance saved for ${records.length} resident(s)` });
});

// GET /api/attendance/history?resident_id=&from=&to=&hostel_id=&status=
const attendanceHistory = asyncHandler(async (req, res) => {
  const { hostel_id, resident_id, from, to, status } = req.q;
  const { limit, offset, meta } = paginate(req.q);
  const scope = hostelScope(req, 'att.hostel_id', hostel_id);
  const where = [scope.sql];
  const params = [...scope.params];
  if (resident_id) where.push('att.resident_id = ?') && params.push(resident_id);
  if (from) where.push('att.attendance_date >= ?') && params.push(from);
  if (to) where.push('att.attendance_date <= ?') && params.push(to);
  if (status) where.push('att.status = ?') && params.push(status);
  const base = `FROM attendance att JOIN residents x ON x.id = att.resident_id LEFT JOIN users u ON u.id = att.marked_by WHERE ${where.join(' AND ')}`;
  const [{ total }] = await query(`SELECT COUNT(*) AS total ${base}`, params);
  const rows = await query(
    `SELECT att.*, x.full_name, x.registration_no, u.full_name AS marked_by_name ${base} ORDER BY att.attendance_date DESC, x.full_name LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  sendSuccess(res, { data: rows, meta: meta(total) });
});

// GET /api/attendance/monthly?hostel_id=&month=YYYY-MM
const attendanceMonthly = asyncHandler(async (req, res) => {
  const { hostel_id, month } = req.q;
  assertHostelAccess(req, hostel_id);
  const { start, end } = monthRange(month);
  const rows = await query(
    `SELECT x.id AS resident_id, x.full_name, x.registration_no,
            SUM(att.status = 'present') AS present, SUM(att.status = 'absent') AS absent,
            SUM(att.status = 'leave') AS \`leave\`, SUM(att.status = 'late') AS late, COUNT(att.id) AS marked
     FROM residents x JOIN attendance att ON att.resident_id = x.id
     WHERE att.hostel_id = ? AND att.attendance_date BETWEEN ? AND ?
     GROUP BY x.id, x.full_name, x.registration_no ORDER BY x.full_name`,
    [hostel_id, start, end]
  );
  rows.forEach((r) => {
    r.attendance_percent = r.marked ? Math.round(((Number(r.present) + Number(r.late)) / r.marked) * 1000) / 10 : 0;
  });
  sendSuccess(res, { data: rows, meta: { month, start, end } });
});

/* ============================ VISITORS ============================ */

const VISITOR_SCHEMA_FIELDS = ['visitor_name', 'cnic', 'contact_number', 'relationship', 'visit_date', 'entry_time', 'purpose', 'remarks'];

// GET /api/visitors
const listVisitors = asyncHandler(async (req, res) => {
  const { search, hostel_id, from, to, inside, resident_id } = req.q;
  const { limit, offset, meta } = paginate(req.q);
  const scope = hostelScope(req, 'v.hostel_id', hostel_id);
  const where = [scope.sql];
  const params = [...scope.params];
  if (search) {
    where.push('(v.visitor_name LIKE ? OR v.cnic LIKE ? OR v.contact_number LIKE ? OR x.full_name LIKE ?)');
    params.push(...Array(4).fill(`%${search}%`));
  }
  if (from) where.push('v.visit_date >= ?') && params.push(from);
  if (to) where.push('v.visit_date <= ?') && params.push(to);
  if (inside) where.push('v.exit_time IS NULL');
  if (resident_id) where.push('v.resident_id = ?') && params.push(resident_id);
  const base = `FROM visitors v JOIN residents x ON x.id = v.resident_id JOIN hostels h ON h.id = v.hostel_id
                LEFT JOIN users u ON u.id = v.created_by WHERE ${where.join(' AND ')}`;
  const [{ total }] = await query(`SELECT COUNT(*) AS total ${base}`, params);
  const rows = await query(
    `SELECT v.*, x.full_name AS resident_name, x.registration_no, h.name AS hostel_name, u.full_name AS created_by_name
     ${base} ORDER BY v.visit_date DESC, v.entry_time DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  const ts = hostelScope(req, 'v.hostel_id', hostel_id);
  const [counts] = await query(
    `SELECT SUM(v.visit_date = CURDATE()) AS today, SUM(v.exit_time IS NULL) AS inside FROM visitors v WHERE ${ts.sql}`,
    ts.params
  );
  sendSuccess(res, { data: rows, meta: { ...meta(total), counts } });
});

// POST /api/visitors  (entry)
const createVisitor = asyncHandler(async (req, res) => {
  const b = req.body;
  const resident = await findScoped(req, 'residents', b.resident_id, { label: 'Resident', softDelete: true });
  if (resident.status !== 'active') throw ApiError.conflict('Visitors can only be recorded for active residents');
  const result = await query(
    `INSERT INTO visitors (hostel_id, resident_id, ${VISITOR_SCHEMA_FIELDS.join(', ')}, created_by) VALUES (?, ?, ${VISITOR_SCHEMA_FIELDS.map(() => '?').join(', ')}, ?)`,
    [resident.hostel_id, resident.id, ...VISITOR_SCHEMA_FIELDS.map((f) => b[f]), req.user.id]
  );
  await logAudit(null, req, {
    action: 'visitor.entry', entityType: 'visitor', entityId: result.insertId, hostelId: resident.hostel_id,
    description: `Visitor ${b.visitor_name} entered to meet ${resident.full_name}`,
  });
  sendSuccess(res, { statusCode: 201, message: 'Visitor entry recorded', data: { id: result.insertId } });
});

// PUT /api/visitors/:id
const updateVisitor = asyncHandler(async (req, res) => {
  const visitor = await findScoped(req, 'visitors', req.params.id, { label: 'Visitor record' });
  const b = req.body;
  if (b.exit_time && b.exit_time < b.entry_time) throw new ApiError(422, 'Exit time cannot be before entry time', { exit_time: 'Exit time cannot be before entry time' });
  await query(
    `UPDATE visitors SET ${VISITOR_SCHEMA_FIELDS.map((f) => `${f} = ?`).join(', ')}, exit_time = ? WHERE id = ?`,
    [...VISITOR_SCHEMA_FIELDS.map((f) => b[f]), b.exit_time, visitor.id]
  );
  await logAudit(null, req, {
    action: 'visitor.update', entityType: 'visitor', entityId: visitor.id, hostelId: visitor.hostel_id, description: `Updated visitor record of ${b.visitor_name}`,
  });
  sendSuccess(res, { message: 'Visitor record updated' });
});

// POST /api/visitors/:id/exit  { exit_time }
const visitorExit = asyncHandler(async (req, res) => {
  const visitor = await findScoped(req, 'visitors', req.params.id, { label: 'Visitor record' });
  if (visitor.exit_time) throw ApiError.conflict('Exit is already recorded for this visitor');
  if (req.body.exit_time < visitor.entry_time) throw new ApiError(422, 'Exit time cannot be before entry time', { exit_time: 'Exit time cannot be before entry time' });
  await query('UPDATE visitors SET exit_time = ? WHERE id = ?', [req.body.exit_time, visitor.id]);
  await logAudit(null, req, {
    action: 'visitor.exit', entityType: 'visitor', entityId: visitor.id, hostelId: visitor.hostel_id, description: `Visitor ${visitor.visitor_name} exited`,
  });
  sendSuccess(res, { message: 'Visitor exit recorded' });
});

/* ============================ COMPLAINTS ============================ */

const COMPLAINT_BASE = `FROM complaints c JOIN hostels h ON h.id = c.hostel_id LEFT JOIN residents x ON x.id = c.resident_id
                        LEFT JOIN rooms rm ON rm.id = c.room_id LEFT JOIN users u ON u.id = c.created_by`;

// GET /api/complaints
const listComplaints = asyncHandler(async (req, res) => {
  const { search, hostel_id, status, category, priority, from, to } = req.q;
  const { limit, offset, meta } = paginate(req.q);
  const scope = hostelScope(req, 'c.hostel_id', hostel_id);
  const where = [scope.sql];
  const params = [...scope.params];
  if (search) where.push('(c.complaint_no LIKE ? OR c.subject LIKE ? OR x.full_name LIKE ? OR c.assigned_to LIKE ?)') && params.push(...Array(4).fill(`%${search}%`));
  if (status === 'pending') where.push(`c.status IN ('open','in_progress')`);
  else if (status) where.push('c.status = ?') && params.push(status);
  if (category) where.push('c.category = ?') && params.push(category);
  if (priority) where.push('c.priority = ?') && params.push(priority);
  if (from) where.push('DATE(c.created_at) >= ?') && params.push(from);
  if (to) where.push('DATE(c.created_at) <= ?') && params.push(to);
  const whereSql = where.join(' AND ');
  const [{ total }] = await query(`SELECT COUNT(*) AS total ${COMPLAINT_BASE} WHERE ${whereSql}`, params);
  const rows = await query(
    `SELECT c.*, h.name AS hostel_name, x.full_name AS resident_name, rm.room_number, u.full_name AS created_by_name
     ${COMPLAINT_BASE} WHERE ${whereSql}
     ORDER BY FIELD(c.status,'open','in_progress','resolved','rejected'), FIELD(c.priority,'urgent','high','medium','low'), c.id DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  const cs = hostelScope(req, 'c.hostel_id', hostel_id);
  const counts = await query(`SELECT c.status, COUNT(*) AS count FROM complaints c WHERE ${cs.sql} GROUP BY c.status`, cs.params);
  sendSuccess(res, { data: rows, meta: { ...meta(total), counts: Object.fromEntries(counts.map((c) => [c.status, c.count])) } });
});

async function getComplaintDetail(id) {
  const complaint = await queryOne(
    `SELECT c.*, h.name AS hostel_name, x.full_name AS resident_name, x.registration_no, rm.room_number, u.full_name AS created_by_name
     ${COMPLAINT_BASE} WHERE c.id = ?`,
    [id]
  );
  if (!complaint) throw ApiError.notFound('Complaint not found');
  complaint.updates = await query(
    `SELECT cu.*, u.full_name AS updated_by_name FROM complaint_updates cu LEFT JOIN users u ON u.id = cu.updated_by
     WHERE cu.complaint_id = ? ORDER BY cu.id`,
    [id]
  );
  return complaint;
}

// GET /api/complaints/:id
const getComplaint = asyncHandler(async (req, res) => {
  await findScoped(req, 'complaints', req.params.id, { label: 'Complaint', columns: 'id, hostel_id' });
  sendSuccess(res, { data: await getComplaintDetail(req.params.id) });
});

// POST /api/complaints
const createComplaint = asyncHandler(async (req, res) => {
  const b = req.body;
  assertHostelAccess(req, b.hostel_id);
  let roomId = b.room_id || null;
  if (b.resident_id) {
    const resident = await findScoped(req, 'residents', b.resident_id, { label: 'Resident', softDelete: true });
    if (resident.hostel_id !== b.hostel_id) throw ApiError.badRequest('Resident belongs to another hostel');
    if (!roomId) {
      const alloc = await queryOne(`SELECT room_id FROM room_allocations WHERE resident_id = ? AND status = 'active'`, [resident.id]);
      roomId = alloc ? alloc.room_id : null;
    }
  }
  if (roomId) {
    const room = await queryOne('SELECT hostel_id FROM rooms WHERE id = ?', [roomId]);
    if (!room || room.hostel_id !== b.hostel_id) throw ApiError.badRequest('Room belongs to another hostel');
  }
  const id = await withTransaction(async (conn) => {
    const [result] = await conn.query(
      `INSERT INTO complaints (hostel_id, complaint_no, resident_id, room_id, category, subject, description, priority, status, assigned_to, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)`,
      [b.hostel_id, tempNumber(), b.resident_id, roomId, b.category, b.subject, b.description, b.priority, b.assigned_to, req.user.id]
    );
    const no = await assignNumber(conn, 'complaints', 'complaint_no', 'CMP', result.insertId);
    await conn.query(
      `INSERT INTO complaint_updates (complaint_id, status_from, status_to, assigned_to, remarks, updated_by) VALUES (?, NULL, 'open', ?, 'Complaint registered', ?)`,
      [result.insertId, b.assigned_to, req.user.id]
    );
    await logAudit(conn, req, {
      action: 'complaint.create', entityType: 'complaint', entityId: result.insertId, hostelId: b.hostel_id,
      description: `Complaint ${no} registered: ${b.subject} (${b.priority})`,
    });
    await notifyHostel(conn, {
      hostelId: b.hostel_id, type: 'complaint', title: `New ${b.priority} complaint`,
      message: `${no}: ${b.subject}`, link: `/complaints?open=${result.insertId}`,
    });
    return result.insertId;
  });
  sendSuccess(res, { statusCode: 201, message: 'Complaint registered', data: await getComplaintDetail(id) });
});

// PUT /api/complaints/:id  { status, priority, assigned_to, remarks, resolution_remarks }
const updateComplaint = asyncHandler(async (req, res) => {
  const b = req.body;
  await findScoped(req, 'complaints', req.params.id, { label: 'Complaint', columns: 'id, hostel_id' });
  await withTransaction(async (conn) => {
    const [[c]] = await conn.query('SELECT * FROM complaints WHERE id = ? FOR UPDATE', [req.params.id]);
    if (['resolved', 'rejected'].includes(c.status) && b.status === c.status && !b.remarks) {
      throw ApiError.conflict(`Complaint is already ${c.status}`);
    }
    if (['resolved', 'rejected'].includes(b.status) && !b.resolution_remarks && !c.resolution_remarks) {
      throw new ApiError(422, 'Resolution remarks are required', { resolution_remarks: 'Please describe how it was resolved / why rejected' });
    }
    const closing = ['resolved', 'rejected'].includes(b.status);
    await conn.query(
      `UPDATE complaints SET status = ?, priority = ?, assigned_to = ?, resolution_remarks = ?, resolution_date = ? WHERE id = ?`,
      [b.status, b.priority, b.assigned_to, closing ? b.resolution_remarks || c.resolution_remarks : c.resolution_remarks,
        closing ? c.resolution_date || today() : null, c.id]
    );
    await conn.query(
      `INSERT INTO complaint_updates (complaint_id, status_from, status_to, assigned_to, remarks, updated_by) VALUES (?, ?, ?, ?, ?, ?)`,
      [c.id, c.status, b.status, b.assigned_to, b.remarks || (closing ? b.resolution_remarks : null), req.user.id]
    );
    await logAudit(conn, req, {
      action: 'complaint.update', entityType: 'complaint', entityId: c.id, hostelId: c.hostel_id,
      description: `Complaint ${c.complaint_no}: ${c.status} → ${b.status}${b.assigned_to ? `, assigned to ${b.assigned_to}` : ''}`,
    });
  });
  sendSuccess(res, { message: 'Complaint updated', data: await getComplaintDetail(req.params.id) });
});

module.exports = {
  attendanceSheet, saveAttendance, attendanceHistory, attendanceMonthly,
  listVisitors, createVisitor, updateVisitor, visitorExit,
  listComplaints, getComplaint, createComplaint, updateComplaint,
};
