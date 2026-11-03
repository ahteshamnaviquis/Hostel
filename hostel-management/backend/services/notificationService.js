/**
 * In-app notifications.
 * Recipients for a hostel event = all active Super Admins + active admins assigned to that hostel.
 * dedupeKey prevents the same automatic reminder being created twice for a user.
 */
const { pool } = require('../config/db');

async function getRecipients(db, hostelId) {
  const [rows] = await db.query(
    `SELECT u.id FROM users u JOIN roles r ON r.id = u.role_id
     WHERE u.deleted_at IS NULL AND u.status = 'active'
       AND (r.name = 'super_admin' OR u.id IN (SELECT user_id FROM user_hostels WHERE hostel_id = ?))`,
    [hostelId || 0]
  );
  return rows.map((r) => r.id);
}

/**
 * Creates a notification for everyone responsible for a hostel.
 * Returns the number of notifications created.
 */
async function notifyHostel(executor, { hostelId, type, title, message, link = null, dedupeKey = null, onlySuperAdmins = false }) {
  const db = executor || pool;
  let userIds = await getRecipients(db, hostelId);
  if (onlySuperAdmins) {
    const [rows] = await db.query(
      `SELECT u.id FROM users u JOIN roles r ON r.id = u.role_id WHERE r.name = 'super_admin' AND u.status = 'active' AND u.deleted_at IS NULL`
    );
    userIds = rows.map((r) => r.id);
  }
  if (!userIds.length) return 0;
  const values = userIds.map((uid) => [uid, hostelId || null, type, title.slice(0, 150), message.slice(0, 500), link, dedupeKey]);
  const [result] = await db.query(
    `INSERT IGNORE INTO notifications (user_id, hostel_id, type, title, message, link, dedupe_key) VALUES ?`,
    [values]
  );
  return result.affectedRows;
}

module.exports = { notifyHostel };
