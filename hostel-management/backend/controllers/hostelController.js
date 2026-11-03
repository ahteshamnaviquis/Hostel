/**
 * Hostel management. Create/update/status/admin-assignment: Super Admin only.
 * Listing and details: scoped to the hostels the user may access.
 */
const { query, queryOne, withTransaction } = require('../config/db');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/response');
const { paginate, currentMonth } = require('../utils/helpers');
const { hostelScope, assertHostelAccess } = require('../utils/scope');
const { logAudit } = require('../services/auditService');

const STATS_SELECT = `
  (SELECT COUNT(*) FROM buildings b WHERE b.hostel_id = h.id AND b.deleted_at IS NULL) AS buildings_count,
  (SELECT COUNT(*) FROM rooms r WHERE r.hostel_id = h.id AND r.deleted_at IS NULL) AS rooms_count,
  (SELECT COUNT(*) FROM room_beds bd JOIN rooms r ON r.id = bd.room_id
     WHERE bd.hostel_id = h.id AND r.deleted_at IS NULL AND r.status <> 'inactive' AND bd.status <> 'inactive') AS total_beds,
  (SELECT COUNT(*) FROM room_beds bd WHERE bd.hostel_id = h.id AND bd.status = 'occupied') AS occupied_beds,
  (SELECT COUNT(*) FROM residents rs WHERE rs.hostel_id = h.id AND rs.status = 'active' AND rs.deleted_at IS NULL) AS active_residents,
  (SELECT COUNT(*) FROM user_hostels uh JOIN users u ON u.id = uh.user_id
     WHERE uh.hostel_id = h.id AND u.deleted_at IS NULL AND u.status = 'active') AS admins_count`;

const HOSTEL_FIELDS = [
  'name', 'code', 'hostel_type', 'description', 'address', 'city', 'province',
  'contact_number', 'email', 'warden_name', 'warden_contact', 'status',
];

async function getDetail(id) {
  const hostel = await queryOne(
    `SELECT h.*, u.full_name AS created_by_name, ${STATS_SELECT}
     FROM hostels h LEFT JOIN users u ON u.id = h.created_by WHERE h.id = ? AND h.deleted_at IS NULL`,
    [id]
  );
  if (!hostel) throw ApiError.notFound('Hostel not found');
  hostel.available_beds = Math.max(0, hostel.total_beds - hostel.occupied_beds);
  hostel.admins = await query(
    `SELECT u.id, u.full_name, u.email, u.phone, u.status FROM user_hostels uh JOIN users u ON u.id = uh.user_id
     WHERE uh.hostel_id = ? AND u.deleted_at IS NULL ORDER BY u.full_name`,
    [id]
  );
  hostel.buildings = await query(
    `SELECT b.id, b.name, b.code, b.status,
       (SELECT COUNT(*) FROM floors f WHERE f.building_id = b.id AND f.deleted_at IS NULL) AS floors_count,
       (SELECT COUNT(*) FROM rooms r WHERE r.building_id = b.id AND r.deleted_at IS NULL) AS rooms_count
     FROM buildings b WHERE b.hostel_id = ? AND b.deleted_at IS NULL ORDER BY b.name`,
    [id]
  );
  const month = currentMonth();
  const [finance] = await query(
    `SELECT
       (SELECT COALESCE(SUM(amount),0) FROM payments WHERE hostel_id = ? AND status = 'posted'
          AND payment_method <> 'deposit_adjustment' AND DATE_FORMAT(payment_date,'%Y-%m') = ?) AS collected_this_month,
       (SELECT COALESCE(SUM(total_amount - paid_amount),0) FROM invoices WHERE hostel_id = ? AND status IN ('unpaid','partially_paid')) AS pending_fees,
       (SELECT COALESCE(SUM(amount),0) FROM expenses WHERE hostel_id = ? AND status = 'posted' AND DATE_FORMAT(expense_date,'%Y-%m') = ?) AS expenses_this_month`,
    [id, month, id, id, month]
  );
  hostel.finance = finance;
  return hostel;
}

// GET /api/hostels
const list = asyncHandler(async (req, res) => {
  const { search, status, city, province, hostel_type } = req.q;
  const { limit, offset, meta } = paginate(req.q);
  const scope = hostelScope(req, 'h.id');
  const where = ['h.deleted_at IS NULL', scope.sql];
  const params = [...scope.params];
  if (search) {
    where.push('(h.name LIKE ? OR h.code LIKE ? OR h.city LIKE ? OR h.warden_name LIKE ?)');
    params.push(...Array(4).fill(`%${search}%`));
  }
  if (status) where.push('h.status = ?') && params.push(status);
  if (city) where.push('h.city = ?') && params.push(city);
  if (province) where.push('h.province = ?') && params.push(province);
  if (hostel_type) where.push('h.hostel_type = ?') && params.push(hostel_type);
  const whereSql = where.join(' AND ');
  const [{ total }] = await query(`SELECT COUNT(*) AS total FROM hostels h WHERE ${whereSql}`, params);
  const rows = await query(
    `SELECT h.id, h.name, h.code, h.hostel_type, h.city, h.province, h.contact_number, h.email, h.warden_name,
            h.warden_contact, h.status, h.created_at, ${STATS_SELECT}
     FROM hostels h WHERE ${whereSql} ORDER BY h.name LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  rows.forEach((r) => {
    r.available_beds = Math.max(0, r.total_beds - r.occupied_beds);
  });
  sendSuccess(res, { data: rows, meta: meta(total) });
});

// GET /api/hostels/options - lightweight list for dropdowns
const options = asyncHandler(async (req, res) => {
  const scope = hostelScope(req, 'id');
  const rows = await query(
    `SELECT id, name, code, hostel_type, city, status FROM hostels WHERE deleted_at IS NULL AND ${scope.sql} ORDER BY name`,
    scope.params
  );
  sendSuccess(res, { data: rows });
});

// GET /api/hostels/:id
const get = asyncHandler(async (req, res) => {
  assertHostelAccess(req, req.params.id);
  sendSuccess(res, { data: await getDetail(req.params.id) });
});

// POST /api/hostels
const create = asyncHandler(async (req, res) => {
  const b = req.body;
  const values = HOSTEL_FIELDS.map((f) => b[f]);
  const result = await query(
    `INSERT INTO hostels (${HOSTEL_FIELDS.join(', ')}, created_by) VALUES (${HOSTEL_FIELDS.map(() => '?').join(', ')}, ?)`,
    [...values, req.user.id]
  );
  await logAudit(null, req, {
    action: 'hostel.create',
    entityType: 'hostel',
    entityId: result.insertId,
    hostelId: result.insertId,
    description: `Created hostel ${b.name} (${b.code})`,
    newValues: b,
  });
  sendSuccess(res, { statusCode: 201, message: 'Hostel created', data: await getDetail(result.insertId) });
});

// PUT /api/hostels/:id
const update = asyncHandler(async (req, res) => {
  const before = await getDetail(req.params.id);
  const b = req.body;
  await query(`UPDATE hostels SET ${HOSTEL_FIELDS.map((f) => `${f} = ?`).join(', ')} WHERE id = ?`, [
    ...HOSTEL_FIELDS.map((f) => b[f]),
    before.id,
  ]);
  await logAudit(null, req, {
    action: 'hostel.update',
    entityType: 'hostel',
    entityId: before.id,
    hostelId: before.id,
    description: `Updated hostel ${b.name}`,
    oldValues: Object.fromEntries(HOSTEL_FIELDS.map((f) => [f, before[f]])),
    newValues: b,
  });
  sendSuccess(res, { message: 'Hostel updated', data: await getDetail(before.id) });
});

// PATCH /api/hostels/:id/status
const updateStatus = asyncHandler(async (req, res) => {
  const hostel = await getDetail(req.params.id);
  await query('UPDATE hostels SET status = ? WHERE id = ?', [req.body.status, hostel.id]);
  await logAudit(null, req, {
    action: 'hostel.status',
    entityType: 'hostel',
    entityId: hostel.id,
    hostelId: hostel.id,
    description: `${req.body.status === 'active' ? 'Activated' : 'Deactivated'} hostel ${hostel.name}`,
  });
  sendSuccess(res, { message: `Hostel ${req.body.status === 'active' ? 'activated' : 'deactivated'}`, data: await getDetail(hostel.id) });
});

// PUT /api/hostels/:id/admins  { user_ids: [] }
const assignAdmins = asyncHandler(async (req, res) => {
  const hostel = await getDetail(req.params.id);
  const userIds = [...new Set(req.body.user_ids)];
  await withTransaction(async (conn) => {
    if (userIds.length) {
      const [valid] = await conn.query(
        `SELECT u.id FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id IN (?) AND r.name = 'hostel_admin' AND u.deleted_at IS NULL`,
        [userIds]
      );
      if (valid.length !== userIds.length) throw ApiError.badRequest('Only existing Hostel Admins can be assigned');
    }
    await conn.query('DELETE FROM user_hostels WHERE hostel_id = ?', [hostel.id]);
    if (userIds.length) {
      await conn.query('INSERT INTO user_hostels (user_id, hostel_id, assigned_by) VALUES ?', [
        userIds.map((uid) => [uid, hostel.id, req.user.id]),
      ]);
    }
    await logAudit(conn, req, {
      action: 'hostel.assign_admins',
      entityType: 'hostel',
      entityId: hostel.id,
      hostelId: hostel.id,
      description: `Updated administrators of ${hostel.name}`,
      oldValues: { user_ids: hostel.admins.map((a) => a.id) },
      newValues: { user_ids: userIds },
    });
  });
  sendSuccess(res, { message: 'Administrators assigned', data: await getDetail(hostel.id) });
});

module.exports = { list, options, get, create, update, updateStatus, assignAdmins };
