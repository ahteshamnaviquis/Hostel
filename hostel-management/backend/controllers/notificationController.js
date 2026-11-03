const { query } = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/response');
const { paginate } = require('../utils/helpers');
const { runReminders } = require('../services/reminderService');
const { logAudit } = require('../services/auditService');

// GET /api/notifications?unread=true
const list = asyncHandler(async (req, res) => {
  const { limit, offset, meta } = paginate(req.q);
  const where = ['n.user_id = ?'];
  const params = [req.user.id];
  if (req.q.unread) where.push('n.is_read = 0');
  // Admins only see notifications of hostels they are still assigned to
  if (req.user.hostelIds) {
    where.push('(n.hostel_id IS NULL OR n.hostel_id IN (?))');
    params.push(req.user.hostelIds.length ? req.user.hostelIds : [0]);
  }
  const whereSql = where.join(' AND ');
  const [{ total }] = await query(`SELECT COUNT(*) AS total FROM notifications n WHERE ${whereSql}`, params);
  const [{ unread }] = await query(`SELECT COUNT(*) AS unread FROM notifications n WHERE ${whereSql} AND n.is_read = 0`, params);
  const rows = await query(
    `SELECT n.id, n.type, n.title, n.message, n.link, n.is_read, n.created_at, h.name AS hostel_name
     FROM notifications n LEFT JOIN hostels h ON h.id = n.hostel_id WHERE ${whereSql} ORDER BY n.id DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  sendSuccess(res, { data: rows, meta: { ...meta(total), unread } });
});

// PATCH /api/notifications/:id/read
const markRead = asyncHandler(async (req, res) => {
  await query('UPDATE notifications SET is_read = 1, read_at = NOW() WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
  sendSuccess(res, { message: 'Marked as read' });
});

// PATCH /api/notifications/read-all
const markAllRead = asyncHandler(async (req, res) => {
  await query('UPDATE notifications SET is_read = 1, read_at = NOW() WHERE user_id = ? AND is_read = 0', [req.user.id]);
  sendSuccess(res, { message: 'All notifications marked as read' });
});

// POST /api/notifications/run-reminders  (Super Admin)
const run = asyncHandler(async (req, res) => {
  const created = await runReminders();
  await logAudit(null, req, { action: 'notifications.run', description: `Ran reminder check manually (${created} new notifications)` });
  sendSuccess(res, { message: `Reminder check complete. ${created} new notification(s).`, data: { created } });
});

module.exports = { list, markRead, markAllRead, run };
