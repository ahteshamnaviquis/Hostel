/**
 * Hostel-level data isolation helpers.
 *
 * req.user.hostelIds is null for the Super Admin (global access) or the list of
 * hostel ids assigned to a Hostel Admin. EVERY query on hostel data must be
 * filtered with one of these helpers.
 */
const ApiError = require('./ApiError');
const { queryOne } = require('../config/db');

const isSuperAdmin = (req) => req.user && req.user.role === 'super_admin';

/** Throws 403 unless the user may access the given hostel. */
function assertHostelAccess(req, hostelId) {
  if (isSuperAdmin(req)) return;
  if (!hostelId || !req.user.hostelIds.includes(Number(hostelId))) {
    throw ApiError.forbidden('You do not have access to this hostel');
  }
}

/**
 * Builds a SQL condition limiting rows to the hostels the user may see,
 * optionally narrowed to one requested hostel.
 *   const scope = hostelScope(req, 'r.hostel_id', req.q.hostel_id);
 *   sql += ` AND ${scope.sql}`; params.push(...scope.params);
 */
function hostelScope(req, column, requestedHostelId) {
  if (requestedHostelId) {
    assertHostelAccess(req, requestedHostelId);
    return { sql: `${column} = ?`, params: [Number(requestedHostelId)] };
  }
  if (isSuperAdmin(req)) return { sql: '1=1', params: [] };
  if (!req.user.hostelIds.length) return { sql: '1=0', params: [] };
  return { sql: `${column} IN (?)`, params: [req.user.hostelIds] };
}

/**
 * Loads a row by id and checks hostel ownership. 404 if missing, 403 if not allowed.
 * table and columns are code constants, never user input.
 */
async function findScoped(req, table, id, { columns = '*', label = 'Record', softDelete = false, executor } = {}) {
  const sql = `SELECT ${columns} FROM ${table} WHERE id = ?${softDelete ? ' AND deleted_at IS NULL' : ''}`;
  let row;
  if (executor) {
    const [rows] = await executor.query(sql, [id]);
    row = rows[0];
  } else {
    row = await queryOne(sql, [id]);
  }
  if (!row) throw ApiError.notFound(`${label} not found`);
  assertHostelAccess(req, row.hostel_id);
  return row;
}

module.exports = { isSuperAdmin, assertHostelAccess, hostelScope, findScoped };
