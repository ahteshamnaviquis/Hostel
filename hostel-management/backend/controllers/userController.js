/**
 * Administrator management (Super Admin only).
 */
const { query, queryOne, withTransaction } = require('../config/db');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/response');
const { paginate } = require('../utils/helpers');
const { hashPassword } = require('../utils/password');
const { logAudit } = require('../services/auditService');

async function getRoleId(conn, name) {
  const [rows] = await conn.query('SELECT id FROM roles WHERE name = ?', [name]);
  if (!rows.length) throw ApiError.badRequest('Invalid role');
  return rows[0].id;
}

async function setHostels(conn, userId, hostelIds, assignedBy) {
  await conn.query('DELETE FROM user_hostels WHERE user_id = ?', [userId]);
  if (!hostelIds.length) return;
  const [found] = await conn.query('SELECT id FROM hostels WHERE id IN (?) AND deleted_at IS NULL', [hostelIds]);
  if (found.length !== new Set(hostelIds).size) throw ApiError.badRequest('One or more selected hostels do not exist');
  await conn.query('INSERT INTO user_hostels (user_id, hostel_id, assigned_by) VALUES ?', [
    [...new Set(hostelIds)].map((hid) => [userId, hid, assignedBy]),
  ]);
}

async function setPermissions(conn, userId, codes, grantedBy) {
  await conn.query('DELETE FROM user_permissions WHERE user_id = ?', [userId]);
  if (!codes.length) return;
  const [perms] = await conn.query('SELECT id, code FROM permissions WHERE code IN (?)', [codes]);
  if (perms.length !== new Set(codes).size) throw ApiError.badRequest('One or more permissions are invalid');
  await conn.query('INSERT INTO user_permissions (user_id, permission_id, granted_by) VALUES ?', [
    perms.map((p) => [userId, p.id, grantedBy]),
  ]);
}

async function getUserDetail(id) {
  const user = await queryOne(
    `SELECT u.id, u.full_name, u.email, u.username, u.phone, u.status, u.last_login_at, u.created_at, u.updated_at,
            r.name AS role, r.display_name AS role_label, c.full_name AS created_by_name
     FROM users u JOIN roles r ON r.id = u.role_id LEFT JOIN users c ON c.id = u.created_by
     WHERE u.id = ? AND u.deleted_at IS NULL`,
    [id]
  );
  if (!user) throw ApiError.notFound('Administrator not found');
  user.hostels = await query(
    `SELECT h.id, h.name, h.code, h.city, h.status FROM user_hostels uh JOIN hostels h ON h.id = uh.hostel_id
     WHERE uh.user_id = ? AND h.deleted_at IS NULL ORDER BY h.name`,
    [id]
  );
  user.permissions = (
    await query(
      `SELECT p.code FROM user_permissions up JOIN permissions p ON p.id = up.permission_id WHERE up.user_id = ? ORDER BY p.code`,
      [id]
    )
  ).map((p) => p.code);
  return user;
}

// GET /api/users
const list = asyncHandler(async (req, res) => {
  const { search, status, role, hostel_id } = req.q;
  const { limit, offset, meta } = paginate(req.q);
  const where = ['u.deleted_at IS NULL'];
  const params = [];
  if (search) {
    where.push('(u.full_name LIKE ? OR u.email LIKE ? OR u.username LIKE ? OR u.phone LIKE ?)');
    params.push(...Array(4).fill(`%${search}%`));
  }
  if (status) where.push('u.status = ?') && params.push(status);
  if (role) where.push('r.name = ?') && params.push(role);
  if (hostel_id) where.push('u.id IN (SELECT user_id FROM user_hostels WHERE hostel_id = ?)') && params.push(hostel_id);

  const whereSql = where.join(' AND ');
  const [{ total }] = await query(`SELECT COUNT(*) AS total FROM users u JOIN roles r ON r.id = u.role_id WHERE ${whereSql}`, params);
  const rows = await query(
    `SELECT u.id, u.full_name, u.email, u.username, u.phone, u.status, u.last_login_at, u.created_at,
            r.name AS role, r.display_name AS role_label,
            (SELECT GROUP_CONCAT(h.name ORDER BY h.name SEPARATOR ', ') FROM user_hostels uh
               JOIN hostels h ON h.id = uh.hostel_id WHERE uh.user_id = u.id AND h.deleted_at IS NULL) AS hostel_names,
            (SELECT COUNT(*) FROM user_permissions up WHERE up.user_id = u.id) AS permission_count
     FROM users u JOIN roles r ON r.id = u.role_id
     WHERE ${whereSql} ORDER BY r.name DESC, u.full_name LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  sendSuccess(res, { data: rows, meta: meta(total) });
});

// GET /api/users/:id
const get = asyncHandler(async (req, res) => {
  sendSuccess(res, { data: await getUserDetail(req.params.id) });
});

// POST /api/users
const create = asyncHandler(async (req, res) => {
  const b = req.body;
  const id = await withTransaction(async (conn) => {
    const roleId = await getRoleId(conn, b.role);
    const [result] = await conn.query(
      `INSERT INTO users (role_id, full_name, email, username, phone, password_hash, status, created_by, password_changed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
      [roleId, b.full_name, b.email, b.username, b.phone, await hashPassword(b.password), b.status, req.user.id]
    );
    const userId = result.insertId;
    if (b.role === 'hostel_admin') {
      await setHostels(conn, userId, b.hostel_ids || [], req.user.id);
      let codes = b.permission_codes;
      if (!codes) {
        const [defaults] = await conn.query(
          `SELECT p.code FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id WHERE rp.role_id = ?`,
          [roleId]
        );
        codes = defaults.map((d) => d.code);
      }
      await setPermissions(conn, userId, codes, req.user.id);
    }
    await logAudit(conn, req, {
      action: 'user.create',
      entityType: 'user',
      entityId: userId,
      description: `Created ${b.role === 'super_admin' ? 'Super Admin' : 'administrator'} ${b.full_name} (${b.email})`,
      newValues: { email: b.email, role: b.role, hostel_ids: b.hostel_ids, permissions: b.permission_codes },
    });
    return userId;
  });
  sendSuccess(res, { statusCode: 201, message: 'Administrator created', data: await getUserDetail(id) });
});

// PUT /api/users/:id
const update = asyncHandler(async (req, res) => {
  const before = await getUserDetail(req.params.id);
  const b = req.body;
  if (before.id === req.user.id && b.status !== 'active') throw ApiError.badRequest('You cannot deactivate your own account');
  await query('UPDATE users SET full_name = ?, email = ?, username = ?, phone = ?, status = ? WHERE id = ?', [
    b.full_name,
    b.email,
    b.username,
    b.phone,
    b.status,
    before.id,
  ]);
  await logAudit(null, req, {
    action: 'user.update',
    entityType: 'user',
    entityId: before.id,
    description: `Updated administrator ${b.full_name}`,
    oldValues: { full_name: before.full_name, email: before.email, phone: before.phone, status: before.status },
    newValues: b,
  });
  sendSuccess(res, { message: 'Administrator updated', data: await getUserDetail(before.id) });
});

// PATCH /api/users/:id/status
const updateStatus = asyncHandler(async (req, res) => {
  const user = await getUserDetail(req.params.id);
  if (user.id === req.user.id) throw ApiError.badRequest('You cannot change your own status');
  await query('UPDATE users SET status = ? WHERE id = ?', [req.body.status, user.id]);
  await logAudit(null, req, {
    action: 'user.status',
    entityType: 'user',
    entityId: user.id,
    description: `Changed status of ${user.full_name} from ${user.status} to ${req.body.status}`,
  });
  sendSuccess(res, { message: `Account ${req.body.status === 'active' ? 'activated' : 'deactivated'}`, data: await getUserDetail(user.id) });
});

// PUT /api/users/:id/hostels
const updateHostels = asyncHandler(async (req, res) => {
  const user = await getUserDetail(req.params.id);
  if (user.role !== 'hostel_admin') throw ApiError.badRequest('Hostels can only be assigned to Hostel Admins');
  await withTransaction(async (conn) => {
    await setHostels(conn, user.id, req.body.hostel_ids, req.user.id);
    await logAudit(conn, req, {
      action: 'user.assign_hostels',
      entityType: 'user',
      entityId: user.id,
      description: `Updated hostel assignment for ${user.full_name}`,
      oldValues: { hostel_ids: user.hostels.map((h) => h.id) },
      newValues: { hostel_ids: req.body.hostel_ids },
    });
  });
  sendSuccess(res, { message: 'Hostel assignment updated', data: await getUserDetail(user.id) });
});

// PUT /api/users/:id/permissions
const updatePermissions = asyncHandler(async (req, res) => {
  const user = await getUserDetail(req.params.id);
  if (user.role !== 'hostel_admin') throw ApiError.badRequest('Super Admins always have every permission');
  await withTransaction(async (conn) => {
    await setPermissions(conn, user.id, req.body.permission_codes, req.user.id);
    await logAudit(conn, req, {
      action: 'user.permissions',
      entityType: 'user',
      entityId: user.id,
      description: `Updated permissions for ${user.full_name}`,
      oldValues: { permissions: user.permissions },
      newValues: { permissions: req.body.permission_codes },
    });
  });
  sendSuccess(res, { message: 'Permissions updated', data: await getUserDetail(user.id) });
});

// POST /api/users/:id/reset-password
const resetPassword = asyncHandler(async (req, res) => {
  const user = await getUserDetail(req.params.id);
  await query('UPDATE users SET password_hash = ?, password_changed_at = NOW() WHERE id = ?', [
    await hashPassword(req.body.new_password),
    user.id,
  ]);
  await logAudit(null, req, {
    action: 'user.reset_password',
    entityType: 'user',
    entityId: user.id,
    description: `Reset password for ${user.full_name}`,
  });
  sendSuccess(res, { message: `Password reset for ${user.full_name}` });
});

// GET /api/permissions
const listPermissions = asyncHandler(async (req, res) => {
  const permissions = await query('SELECT id, code, name, module, description FROM permissions ORDER BY id');
  const defaults = await query(
    `SELECT p.code FROM role_permissions rp JOIN roles r ON r.id = rp.role_id JOIN permissions p ON p.id = rp.permission_id
     WHERE r.name = 'hostel_admin'`
  );
  sendSuccess(res, { data: { permissions, hostelAdminDefaults: defaults.map((d) => d.code) } });
});

module.exports = { list, get, create, update, updateStatus, updateHostels, updatePermissions, resetPassword, listPermissions };
