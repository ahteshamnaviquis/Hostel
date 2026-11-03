/**
 * Buildings and floors (permission: buildings.manage for changes; read is hostel-scoped).
 */
const { query, queryOne } = require('../config/db');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/response');
const { paginate } = require('../utils/helpers');
const { hostelScope, assertHostelAccess, findScoped } = require('../utils/scope');
const { logAudit } = require('../services/auditService');

// ---------------- Buildings ----------------

const listBuildings = asyncHandler(async (req, res) => {
  const { search, status, hostel_id } = req.q;
  const { limit, offset, meta } = paginate(req.q);
  const scope = hostelScope(req, 'b.hostel_id', hostel_id);
  const where = ['b.deleted_at IS NULL', scope.sql];
  const params = [...scope.params];
  if (search) where.push('(b.name LIKE ? OR b.code LIKE ?)') && params.push(`%${search}%`, `%${search}%`);
  if (status) where.push('b.status = ?') && params.push(status);
  const whereSql = where.join(' AND ');
  const [{ total }] = await query(`SELECT COUNT(*) AS total FROM buildings b WHERE ${whereSql}`, params);
  const rows = await query(
    `SELECT b.*, h.name AS hostel_name,
       (SELECT COUNT(*) FROM floors f WHERE f.building_id = b.id AND f.deleted_at IS NULL) AS floors_count,
       (SELECT COUNT(*) FROM rooms r WHERE r.building_id = b.id AND r.deleted_at IS NULL) AS rooms_count,
       (SELECT COUNT(*) FROM room_beds bd JOIN rooms r ON r.id = bd.room_id
          WHERE r.building_id = b.id AND r.deleted_at IS NULL AND r.status <> 'inactive' AND bd.status <> 'inactive') AS beds_count,
       (SELECT COUNT(*) FROM room_beds bd JOIN rooms r ON r.id = bd.room_id WHERE r.building_id = b.id AND bd.status = 'occupied') AS occupied_beds
     FROM buildings b JOIN hostels h ON h.id = b.hostel_id
     WHERE ${whereSql} ORDER BY h.name, b.name LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  sendSuccess(res, { data: rows, meta: meta(total) });
});

const createBuilding = asyncHandler(async (req, res) => {
  const b = req.body;
  assertHostelAccess(req, b.hostel_id);
  const hostel = await queryOne('SELECT id, name FROM hostels WHERE id = ? AND deleted_at IS NULL', [b.hostel_id]);
  if (!hostel) throw ApiError.badRequest('Hostel not found');
  const result = await query(
    'INSERT INTO buildings (hostel_id, name, code, description, status, created_by) VALUES (?, ?, ?, ?, ?, ?)',
    [b.hostel_id, b.name, b.code, b.description, b.status, req.user.id]
  );
  await logAudit(null, req, {
    action: 'building.create', entityType: 'building', entityId: result.insertId, hostelId: b.hostel_id,
    description: `Created building ${b.name} in ${hostel.name}`,
  });
  sendSuccess(res, { statusCode: 201, message: 'Building created', data: await queryOne('SELECT * FROM buildings WHERE id = ?', [result.insertId]) });
});

const updateBuilding = asyncHandler(async (req, res) => {
  const building = await findScoped(req, 'buildings', req.params.id, { label: 'Building', softDelete: true });
  const b = req.body;
  await query('UPDATE buildings SET name = ?, code = ?, description = ?, status = ? WHERE id = ?', [b.name, b.code, b.description, b.status, building.id]);
  await logAudit(null, req, {
    action: 'building.update', entityType: 'building', entityId: building.id, hostelId: building.hostel_id,
    description: `Updated building ${b.name}`, oldValues: building, newValues: b,
  });
  sendSuccess(res, { message: 'Building updated', data: await queryOne('SELECT * FROM buildings WHERE id = ?', [building.id]) });
});

const deleteBuilding = asyncHandler(async (req, res) => {
  const building = await findScoped(req, 'buildings', req.params.id, { label: 'Building', softDelete: true });
  const [{ n }] = await query('SELECT COUNT(*) AS n FROM floors WHERE building_id = ? AND deleted_at IS NULL', [building.id]);
  if (n) throw ApiError.conflict('Delete or move the floors of this building first');
  await query("UPDATE buildings SET deleted_at = NOW(), name = CONCAT(LEFT(name, 80), '~', id) WHERE id = ?", [building.id]);
  await logAudit(null, req, {
    action: 'building.delete', entityType: 'building', entityId: building.id, hostelId: building.hostel_id,
    description: `Deleted building ${building.name}`,
  });
  sendSuccess(res, { message: 'Building deleted' });
});

// ---------------- Floors ----------------

const listFloors = asyncHandler(async (req, res) => {
  const { hostel_id, building_id, status } = req.q;
  const { limit, offset, meta } = paginate(req.q);
  const scope = hostelScope(req, 'f.hostel_id', hostel_id);
  const where = ['f.deleted_at IS NULL', scope.sql];
  const params = [...scope.params];
  if (building_id) where.push('f.building_id = ?') && params.push(building_id);
  if (status) where.push('f.status = ?') && params.push(status);
  const whereSql = where.join(' AND ');
  const [{ total }] = await query(`SELECT COUNT(*) AS total FROM floors f WHERE ${whereSql}`, params);
  const rows = await query(
    `SELECT f.*, b.name AS building_name, h.name AS hostel_name,
       (SELECT COUNT(*) FROM rooms r WHERE r.floor_id = f.id AND r.deleted_at IS NULL) AS rooms_count,
       (SELECT COUNT(*) FROM room_beds bd JOIN rooms r ON r.id = bd.room_id
          WHERE r.floor_id = f.id AND r.deleted_at IS NULL AND r.status <> 'inactive' AND bd.status <> 'inactive') AS beds_count,
       (SELECT COUNT(*) FROM room_beds bd JOIN rooms r ON r.id = bd.room_id WHERE r.floor_id = f.id AND bd.status = 'occupied') AS occupied_beds
     FROM floors f JOIN buildings b ON b.id = f.building_id JOIN hostels h ON h.id = f.hostel_id
     WHERE ${whereSql} ORDER BY h.name, b.name, f.floor_number LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  sendSuccess(res, { data: rows, meta: meta(total) });
});

const createFloor = asyncHandler(async (req, res) => {
  const b = req.body;
  const building = await findScoped(req, 'buildings', b.building_id, { label: 'Building', softDelete: true });
  const result = await query('INSERT INTO floors (hostel_id, building_id, floor_number, name, status) VALUES (?, ?, ?, ?, ?)', [
    building.hostel_id, building.id, b.floor_number, b.name, b.status,
  ]);
  await logAudit(null, req, {
    action: 'floor.create', entityType: 'floor', entityId: result.insertId, hostelId: building.hostel_id,
    description: `Created floor ${b.name} in building ${building.name}`,
  });
  sendSuccess(res, { statusCode: 201, message: 'Floor created', data: await queryOne('SELECT * FROM floors WHERE id = ?', [result.insertId]) });
});

const updateFloor = asyncHandler(async (req, res) => {
  const floor = await findScoped(req, 'floors', req.params.id, { label: 'Floor', softDelete: true });
  const b = req.body;
  await query('UPDATE floors SET floor_number = ?, name = ?, status = ? WHERE id = ?', [b.floor_number, b.name, b.status, floor.id]);
  await logAudit(null, req, {
    action: 'floor.update', entityType: 'floor', entityId: floor.id, hostelId: floor.hostel_id,
    description: `Updated floor ${b.name}`, oldValues: floor, newValues: b,
  });
  sendSuccess(res, { message: 'Floor updated', data: await queryOne('SELECT * FROM floors WHERE id = ?', [floor.id]) });
});

const deleteFloor = asyncHandler(async (req, res) => {
  const floor = await findScoped(req, 'floors', req.params.id, { label: 'Floor', softDelete: true });
  const [{ n }] = await query('SELECT COUNT(*) AS n FROM rooms WHERE floor_id = ? AND deleted_at IS NULL', [floor.id]);
  if (n) throw ApiError.conflict('Delete the rooms on this floor first');
  // Free the unique (building_id, floor_number) slot so the number can be reused
  await query('UPDATE floors SET deleted_at = NOW(), floor_number = -1000 - id WHERE id = ?', [floor.id]);
  await logAudit(null, req, {
    action: 'floor.delete', entityType: 'floor', entityId: floor.id, hostelId: floor.hostel_id, description: `Deleted floor ${floor.name}`,
  });
  sendSuccess(res, { message: 'Floor deleted' });
});

module.exports = { listBuildings, createBuilding, updateBuilding, deleteBuilding, listFloors, createFloor, updateFloor, deleteFloor };
