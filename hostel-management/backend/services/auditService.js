/**
 * Audit trail. Records who did what, when, and from where.
 * Pass a transaction connection as `executor` to log inside the same transaction.
 */
const { pool } = require('../config/db');

async function logAudit(executor, req, { action, entityType = null, entityId = null, hostelId = null, description = null, oldValues = null, newValues = null }) {
  const db = executor || pool;
  try {
    await db.query(
      `INSERT INTO audit_logs (user_id, hostel_id, action, entity_type, entity_id, description, old_values, new_values, ip_address, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req?.user?.id || null,
        hostelId,
        action,
        entityType,
        entityId,
        description ? String(description).slice(0, 500) : null,
        oldValues ? JSON.stringify(oldValues) : null,
        newValues ? JSON.stringify(newValues) : null,
        req?.ip ? String(req.ip).slice(0, 45) : null,
        req?.headers?.['user-agent'] ? String(req.headers['user-agent']).slice(0, 255) : null,
      ]
    );
  } catch (error) {
    // Never let audit failures outside a transaction break the request
    if (executor) throw error;
    console.error('[audit] failed to write audit log:', error.message);
  }
}

module.exports = { logAudit };
