/**
 * User queries shared by auth and user management.
 */
const { query, queryOne } = require('../config/db');

const USER_COLUMNS = `u.id, u.full_name, u.email, u.username, u.phone, u.status, u.profile_picture,
  u.last_login_at, u.password_changed_at, u.created_at, u.updated_at, r.name AS role, r.display_name AS role_label`;

async function findById(id) {
  return queryOne(
    `SELECT ${USER_COLUMNS} FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = ? AND u.deleted_at IS NULL`,
    [id]
  );
}

/** Finds a user by email or username, including the password hash (login only). */
async function findForLogin(identifier) {
  return queryOne(
    `SELECT ${USER_COLUMNS}, u.password_hash FROM users u JOIN roles r ON r.id = u.role_id
     WHERE (u.email = ? OR u.username = ?) AND u.deleted_at IS NULL`,
    [identifier.toLowerCase(), identifier]
  );
}

async function getPermissionCodes(user) {
  if (user.role === 'super_admin') {
    const rows = await query('SELECT code FROM permissions ORDER BY code');
    return rows.map((r) => r.code);
  }
  const rows = await query(
    `SELECT p.code FROM user_permissions up JOIN permissions p ON p.id = up.permission_id
     WHERE up.user_id = ? ORDER BY p.code`,
    [user.id]
  );
  return rows.map((r) => r.code);
}

/** Active hostels assigned to an admin. */
async function getAssignedHostels(userId) {
  return query(
    `SELECT h.id, h.name, h.code, h.city, h.status FROM user_hostels uh
     JOIN hostels h ON h.id = uh.hostel_id
     WHERE uh.user_id = ? AND h.deleted_at IS NULL AND h.status = 'active'
     ORDER BY h.name`,
    [userId]
  );
}

/** Full auth context: user + permissions + hostels. */
async function loadAuthContext(userId) {
  const user = await findById(userId);
  if (!user) return null;
  const permissions = await getPermissionCodes(user);
  let hostels;
  if (user.role === 'super_admin') {
    hostels = await query(
      `SELECT id, name, code, city, status FROM hostels WHERE deleted_at IS NULL ORDER BY name`
    );
  } else {
    hostels = await getAssignedHostels(user.id);
  }
  return { user, permissions, hostels };
}

module.exports = { findById, findForLogin, getPermissionCodes, getAssignedHostels, loadAuthContext };
