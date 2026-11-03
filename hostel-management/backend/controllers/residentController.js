/**
 * Resident / student management (permission: residents.manage).
 */
const fs = require('fs');
const path = require('path');
const { query, queryOne, withTransaction } = require('../config/db');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/response');
const { paginate, tempNumber, assignNumber } = require('../utils/helpers');
const { hostelScope, assertHostelAccess, findScoped } = require('../utils/scope');
const { logAudit } = require('../services/auditService');
const { resolveUploadPath, removeUpload } = require('../middleware/upload');

const RESIDENT_FIELDS = [
  'full_name', 'father_name', 'cnic', 'date_of_birth', 'gender', 'mobile', 'whatsapp', 'email',
  'permanent_address', 'city', 'province', 'institution', 'department', 'class_designation', 'student_employee_id',
  'guardian_name', 'guardian_relationship', 'guardian_cnic', 'guardian_phone', 'guardian_address',
];

/** Girls hostels accept female residents only; boys hostels male only. */
function assertGenderAllowed(hostel, gender) {
  if (hostel.hostel_type === 'girls' && gender !== 'female') throw ApiError.badRequest(`${hostel.name} is a girls hostel`);
  if (hostel.hostel_type === 'boys' && gender !== 'male') throw ApiError.badRequest(`${hostel.name} is a boys hostel`);
}

const CURRENT_STAY_JOIN = `
  LEFT JOIN admissions a ON a.resident_id = x.id AND a.status IN ('pending','active')
  LEFT JOIN room_allocations ra ON ra.admission_id = a.id AND ra.status = 'active'
  LEFT JOIN rooms rm ON rm.id = ra.room_id
  LEFT JOIN room_beds bd ON bd.id = ra.bed_id`;

async function getDetail(id) {
  const resident = await queryOne(
    `SELECT x.*, h.name AS hostel_name, h.hostel_type, u.full_name AS created_by_name,
            a.id AS admission_id, a.admission_no, a.status AS admission_status, a.admission_date, a.expected_leaving_date,
            a.check_in_date, a.monthly_rent AS admission_rent, a.security_deposit AS admission_deposit,
            ra.id AS allocation_id, rm.id AS room_id, rm.room_number, bd.id AS bed_id, bd.bed_number
     FROM residents x JOIN hostels h ON h.id = x.hostel_id LEFT JOIN users u ON u.id = x.created_by
     ${CURRENT_STAY_JOIN}
     WHERE x.id = ? AND x.deleted_at IS NULL`,
    [id]
  );
  if (!resident) throw ApiError.notFound('Resident not found');
  resident.documents = await query(
    `SELECT d.id, d.document_type, d.title, d.original_name, d.mime_type, d.file_size, d.created_at, u.full_name AS uploaded_by_name
     FROM resident_documents d LEFT JOIN users u ON u.id = d.uploaded_by
     WHERE d.resident_id = ? AND d.deleted_at IS NULL ORDER BY d.id DESC`,
    [id]
  );
  resident.admissions = await query(
    `SELECT id, admission_no, admission_date, check_in_date, expected_leaving_date, checkout_date, status, monthly_rent
     FROM admissions WHERE resident_id = ? ORDER BY id DESC`,
    [id]
  );
  resident.allocations = await query(
    `SELECT ra.id, ra.start_date, ra.end_date, ra.status, ra.monthly_rent, ra.release_reason, rm.room_number, bd.bed_number, b.name AS building_name
     FROM room_allocations ra JOIN rooms rm ON rm.id = ra.room_id JOIN room_beds bd ON bd.id = ra.bed_id JOIN buildings b ON b.id = rm.building_id
     WHERE ra.resident_id = ? ORDER BY ra.id DESC`,
    [id]
  );
  resident.finance = await queryOne(
    `SELECT COALESCE(SUM(IF(status <> 'cancelled', total_amount, 0)),0) AS invoiced,
            COALESCE(SUM(IF(status <> 'cancelled', paid_amount, 0)),0) AS paid,
            COALESCE(SUM(IF(status IN ('unpaid','partially_paid'), total_amount - paid_amount, 0)),0) AS outstanding
     FROM invoices WHERE resident_id = ?`,
    [id]
  );
  const credit = await queryOne(
    `SELECT COALESCE(SUM(unallocated_amount),0) AS advance FROM payments WHERE resident_id = ? AND status = 'posted'`,
    [id]
  );
  resident.finance.advance = credit.advance;
  delete resident.profile_picture_path;
  resident.has_photo = Boolean(resident.profile_picture);
  return resident;
}

// GET /api/residents
const list = asyncHandler(async (req, res) => {
  const { search, status, hostel_id, gender, institution, room_id } = req.q;
  const { limit, offset, meta } = paginate(req.q);
  const scope = hostelScope(req, 'x.hostel_id', hostel_id);
  const where = ['x.deleted_at IS NULL', scope.sql];
  const params = [...scope.params];
  if (search) {
    where.push('(x.full_name LIKE ? OR x.father_name LIKE ? OR x.cnic LIKE ? OR x.mobile LIKE ? OR x.registration_no LIKE ? OR x.student_employee_id LIKE ?)');
    params.push(...Array(6).fill(`%${search}%`));
  }
  if (status) where.push('x.status = ?') && params.push(status);
  if (gender) where.push('x.gender = ?') && params.push(gender);
  if (institution) where.push('x.institution LIKE ?') && params.push(`%${institution}%`);
  if (room_id) where.push('rm.id = ?') && params.push(room_id);
  const whereSql = where.join(' AND ');
  const [{ total }] = await query(`SELECT COUNT(*) AS total FROM residents x ${CURRENT_STAY_JOIN} WHERE ${whereSql}`, params);
  const rows = await query(
    `SELECT x.id, x.registration_no, x.full_name, x.father_name, x.cnic, x.gender, x.mobile, x.institution, x.status, x.created_at,
            x.hostel_id, h.name AS hostel_name, a.id AS admission_id, a.admission_date, a.expected_leaving_date,
            rm.room_number, bd.bed_number,
            (SELECT COALESCE(SUM(i.total_amount - i.paid_amount),0) FROM invoices i
               WHERE i.resident_id = x.id AND i.status IN ('unpaid','partially_paid')) AS outstanding
     FROM residents x JOIN hostels h ON h.id = x.hostel_id ${CURRENT_STAY_JOIN}
     WHERE ${whereSql} ORDER BY x.id DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  sendSuccess(res, { data: rows, meta: meta(total) });
});

// GET /api/residents/:id
const get = asyncHandler(async (req, res) => {
  await findScoped(req, 'residents', req.params.id, { label: 'Resident', softDelete: true, columns: 'id, hostel_id' });
  sendSuccess(res, { data: await getDetail(req.params.id) });
});

// POST /api/residents
const create = asyncHandler(async (req, res) => {
  const b = req.body;
  assertHostelAccess(req, b.hostel_id);
  const hostel = await queryOne('SELECT id, name, hostel_type, status FROM hostels WHERE id = ? AND deleted_at IS NULL', [b.hostel_id]);
  if (!hostel) throw ApiError.badRequest('Hostel not found');
  if (hostel.status !== 'active') throw ApiError.badRequest('This hostel is inactive');
  assertGenderAllowed(hostel, b.gender);

  const id = await withTransaction(async (conn) => {
    const [result] = await conn.query(
      `INSERT INTO residents (hostel_id, registration_no, ${RESIDENT_FIELDS.join(', ')}, status, created_by)
       VALUES (?, ?, ${RESIDENT_FIELDS.map(() => '?').join(', ')}, 'pending', ?)`,
      [b.hostel_id, tempNumber(), ...RESIDENT_FIELDS.map((f) => b[f]), req.user.id]
    );
    const regNo = await assignNumber(conn, 'residents', 'registration_no', 'RES', result.insertId);
    await logAudit(conn, req, {
      action: 'resident.create', entityType: 'resident', entityId: result.insertId, hostelId: b.hostel_id,
      description: `Registered resident ${b.full_name} (${regNo})`,
    });
    return result.insertId;
  });
  sendSuccess(res, { statusCode: 201, message: 'Resident registered', data: await getDetail(id) });
});

// PUT /api/residents/:id
const update = asyncHandler(async (req, res) => {
  const resident = await findScoped(req, 'residents', req.params.id, { label: 'Resident', softDelete: true });
  const b = req.body;
  const hostel = await queryOne('SELECT id, name, hostel_type FROM hostels WHERE id = ?', [resident.hostel_id]);
  assertGenderAllowed(hostel, b.gender);
  await query(`UPDATE residents SET ${RESIDENT_FIELDS.map((f) => `${f} = ?`).join(', ')} WHERE id = ?`, [
    ...RESIDENT_FIELDS.map((f) => b[f]),
    resident.id,
  ]);
  await logAudit(null, req, {
    action: 'resident.update', entityType: 'resident', entityId: resident.id, hostelId: resident.hostel_id,
    description: `Updated resident ${b.full_name}`,
    oldValues: Object.fromEntries(RESIDENT_FIELDS.map((f) => [f, resident[f]])),
    newValues: b,
  });
  sendSuccess(res, { message: 'Resident updated', data: await getDetail(resident.id) });
});

// PATCH /api/residents/:id/status  { status: active | suspended | cancelled, remarks }
const updateStatus = asyncHandler(async (req, res) => {
  const resident = await findScoped(req, 'residents', req.params.id, { label: 'Resident', softDelete: true });
  const { status } = req.body;
  const open = await queryOne(`SELECT id, status FROM admissions WHERE resident_id = ? AND status IN ('pending','active')`, [resident.id]);
  const allowed =
    (status === 'suspended' && resident.status === 'active') ||
    (status === 'active' && resident.status === 'suspended' && open && open.status === 'active') ||
    (status === 'cancelled' && resident.status === 'pending' && !open);
  if (!allowed) {
    throw ApiError.conflict(
      status === 'cancelled'
        ? 'Only pending residents without an open admission can be cancelled'
        : `Cannot change status from ${resident.status} to ${status}`
    );
  }
  await query('UPDATE residents SET status = ? WHERE id = ?', [status, resident.id]);
  await logAudit(null, req, {
    action: 'resident.status', entityType: 'resident', entityId: resident.id, hostelId: resident.hostel_id,
    description: `Resident ${resident.full_name}: ${resident.status} → ${status}${req.body.remarks ? ` (${req.body.remarks})` : ''}`,
  });
  sendSuccess(res, { message: 'Resident status updated', data: await getDetail(resident.id) });
});

// POST /api/residents/:id/photo  (multipart: file)
const uploadPhoto = asyncHandler(async (req, res) => {
  let resident;
  try {
    resident = await findScoped(req, 'residents', req.params.id, { label: 'Resident', softDelete: true });
    if (!req.file) throw ApiError.badRequest('Please choose an image');
  } catch (error) {
    removeUpload(req.file);
    throw error;
  }
  if (resident.profile_picture) {
    try {
      fs.unlink(resolveUploadPath(resident.profile_picture), () => {});
    } catch {
      /* old file missing - ignore */
    }
  }
  await query('UPDATE residents SET profile_picture = ? WHERE id = ?', [req.file.relativePath, resident.id]);
  await logAudit(null, req, {
    action: 'resident.photo', entityType: 'resident', entityId: resident.id, hostelId: resident.hostel_id,
    description: `Updated profile picture of ${resident.full_name}`,
  });
  sendSuccess(res, { message: 'Profile picture updated' });
});

// GET /api/residents/:id/photo
const getPhoto = asyncHandler(async (req, res) => {
  const resident = await findScoped(req, 'residents', req.params.id, { label: 'Resident', softDelete: true, columns: 'id, hostel_id, profile_picture' });
  if (!resident.profile_picture) throw ApiError.notFound('No profile picture');
  res.set('Cache-Control', 'private, max-age=300');
  res.sendFile(resolveUploadPath(resident.profile_picture));
});

// POST /api/residents/:id/documents  (multipart: file, document_type, title)
const uploadDocument = asyncHandler(async (req, res) => {
  let resident;
  try {
    resident = await findScoped(req, 'residents', req.params.id, { label: 'Resident', softDelete: true });
    if (!req.file) throw ApiError.badRequest('Please choose a file');
    const types = ['cnic', 'b_form', 'student_card', 'photo', 'other'];
    if (!types.includes(req.body.document_type)) throw new ApiError(422, 'Invalid document type', { document_type: 'Please select a document type' });
  } catch (error) {
    removeUpload(req.file);
    throw error;
  }
  const title = req.body.title ? String(req.body.title).trim().slice(0, 150) : null;
  const result = await query(
    `INSERT INTO resident_documents (hostel_id, resident_id, document_type, title, file_path, original_name, mime_type, file_size, uploaded_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [resident.hostel_id, resident.id, req.body.document_type, title, req.file.relativePath,
      path.basename(req.file.originalname).slice(0, 255), req.file.mimetype, req.file.size, req.user.id]
  );
  await logAudit(null, req, {
    action: 'resident.document_upload', entityType: 'resident', entityId: resident.id, hostelId: resident.hostel_id,
    description: `Uploaded ${req.body.document_type} document for ${resident.full_name}`,
  });
  sendSuccess(res, { statusCode: 201, message: 'Document uploaded', data: { id: result.insertId } });
});

async function findDocument(req) {
  const doc = await queryOne('SELECT * FROM resident_documents WHERE id = ? AND resident_id = ? AND deleted_at IS NULL', [
    req.params.docId,
    req.params.id,
  ]);
  if (!doc) throw ApiError.notFound('Document not found');
  assertHostelAccess(req, doc.hostel_id);
  return doc;
}

// GET /api/residents/:id/documents/:docId/download
const downloadDocument = asyncHandler(async (req, res) => {
  const doc = await findDocument(req);
  res.set('Cache-Control', 'private, no-store');
  res.download(resolveUploadPath(doc.file_path), doc.original_name);
});

// DELETE /api/residents/:id/documents/:docId  (soft delete - file kept for history)
const deleteDocument = asyncHandler(async (req, res) => {
  const doc = await findDocument(req);
  await query('UPDATE resident_documents SET deleted_at = NOW() WHERE id = ?', [doc.id]);
  await logAudit(null, req, {
    action: 'resident.document_delete', entityType: 'resident', entityId: doc.resident_id, hostelId: doc.hostel_id,
    description: `Removed document ${doc.original_name}`,
  });
  sendSuccess(res, { message: 'Document removed' });
});

module.exports = {
  list, get, create, update, updateStatus, uploadPhoto, getPhoto, uploadDocument, downloadDocument, deleteDocument,
  assertGenderAllowed, RESIDENT_FIELDS,
};
