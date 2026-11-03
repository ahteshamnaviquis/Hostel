/**
 * System settings and audit logs (CHUNK 15).
 */
const { query } = require('../config/db');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/response');
const { paginate } = require('../utils/helpers');
const settingsService = require('../services/settingsService');
const { logAudit } = require('../services/auditService');

// GET /api/settings
const getSettings = asyncHandler(async (req, res) => {
  const rows = await query(
    `SELECT s.setting_group, s.setting_key, s.setting_value, s.value_type, s.description, s.updated_at, u.full_name AS updated_by_name
     FROM system_settings s LEFT JOIN users u ON u.id = s.updated_by WHERE s.hostel_id IS NULL ORDER BY s.setting_group, s.id`
  );
  sendSuccess(res, {
    data: rows.map((r) => ({ ...r, value: settingsService.castValue(r) })),
  });
});

const DATE_FORMATS = ['DD/MM/YYYY', 'DD-MM-YYYY', 'YYYY-MM-DD', 'DD MMM YYYY'];

// PUT /api/settings  { settings: { key: value } }
const updateSettings = asyncHandler(async (req, res) => {
  const input = req.body.settings || {};
  const rows = await query('SELECT setting_key, setting_value, value_type FROM system_settings WHERE hostel_id IS NULL');
  const known = Object.fromEntries(rows.map((r) => [r.setting_key, r]));
  const errors = {};
  const changes = [];
  Object.entries(input).forEach(([key, raw]) => {
    const row = known[key];
    if (!row) {
      errors[key] = 'Unknown setting';
      return;
    }
    let value = raw;
    if (row.value_type === 'number') {
      const n = Number(raw);
      if (raw === '' || !Number.isFinite(n) || n < 0) {
        errors[key] = 'Must be a non-negative number';
        return;
      }
      if (['fee_due_day', 'monthly_generation_day'].includes(key) && (n < 1 || n > 28 || !Number.isInteger(n))) {
        errors[key] = 'Must be a day between 1 and 28';
        return;
      }
      value = String(n);
    } else if (row.value_type === 'boolean') {
      value = raw === true || raw === 'true' ? 'true' : 'false';
    } else {
      value = String(raw ?? '').trim();
      if (value.length > 500) {
        errors[key] = 'Too long (max 500 characters)';
        return;
      }
      if (['app_name', 'currency', 'receipt_prefix', 'invoice_prefix'].includes(key) && !value) {
        errors[key] = 'This setting is required';
        return;
      }
      if (['receipt_prefix', 'invoice_prefix'].includes(key) && !/^[A-Z0-9]{2,6}$/.test(value)) {
        errors[key] = 'Use 2-6 capital letters or numbers';
        return;
      }
      if (key === 'date_format' && !DATE_FORMATS.includes(value)) {
        errors[key] = `Choose one of: ${DATE_FORMATS.join(', ')}`;
        return;
      }
    }
    if (value !== row.setting_value) changes.push({ key, from: row.setting_value, to: value });
  });
  if (Object.keys(errors).length) throw new ApiError(422, 'Please correct the highlighted settings', errors);
  for (const c of changes) {
    await query('UPDATE system_settings SET setting_value = ?, updated_by = ? WHERE hostel_id IS NULL AND setting_key = ?', [c.to, req.user.id, c.key]);
  }
  settingsService.clearCache();
  if (changes.length) {
    await logAudit(null, req, {
      action: 'settings.update', entityType: 'settings',
      description: `Updated settings: ${changes.map((c) => c.key).join(', ')}`,
      oldValues: Object.fromEntries(changes.map((c) => [c.key, c.from])),
      newValues: Object.fromEntries(changes.map((c) => [c.key, c.to])),
    });
  }
  sendSuccess(res, { message: changes.length ? `${changes.length} setting(s) saved` : 'No changes to save' });
});

// GET /api/audit-logs
const listAuditLogs = asyncHandler(async (req, res) => {
  const { search, user_id, hostel_id, action, from, to } = req.q;
  const { limit, offset, meta } = paginate(req.q);
  const where = ['1=1'];
  const params = [];
  if (search) where.push('(l.description LIKE ? OR u.full_name LIKE ?)') && params.push(`%${search}%`, `%${search}%`);
  if (user_id) where.push('l.user_id = ?') && params.push(user_id);
  if (hostel_id) where.push('l.hostel_id = ?') && params.push(hostel_id);
  if (action) where.push('l.action LIKE ?') && params.push(`${action}%`);
  if (from) where.push('l.created_at >= ?') && params.push(`${from} 00:00:00`);
  if (to) where.push('l.created_at <= ?') && params.push(`${to} 23:59:59`);
  const base = `FROM audit_logs l LEFT JOIN users u ON u.id = l.user_id LEFT JOIN hostels h ON h.id = l.hostel_id WHERE ${where.join(' AND ')}`;
  const [{ total }] = await query(`SELECT COUNT(*) AS total ${base}`, params);
  const rows = await query(
    `SELECT l.id, l.action, l.entity_type, l.entity_id, l.description, l.old_values, l.new_values, l.ip_address, l.user_agent, l.created_at,
            u.full_name AS user_name, u.email AS user_email, h.name AS hostel_name
     ${base} ORDER BY l.id DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  const actions = await query(`SELECT DISTINCT SUBSTRING_INDEX(action, '.', 1) AS module FROM audit_logs ORDER BY module`);
  sendSuccess(res, { data: rows, meta: { ...meta(total), modules: actions.map((a) => a.module) } });
});

module.exports = { getSettings, updateSettings, listAuditLogs };
