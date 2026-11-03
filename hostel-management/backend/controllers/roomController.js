/**
 * Rooms and beds (permission: rooms.manage for changes; read is hostel-scoped).
 * Room capacity can never be exceeded: beds are the unit of allocation and
 * total beds can never be reduced below the occupied count.
 */
const { query, queryOne, withTransaction } = require('../config/db');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/response');
const { paginate } = require('../utils/helpers');
const { hostelScope, findScoped } = require('../utils/scope');
const { logAudit } = require('../services/auditService');
const { BED_COUNTS_SQL, refreshRoomStatus, syncBeds } = require('../models/roomModel');

const ROOM_SELECT = `
  SELECT r.*, h.name AS hostel_name, h.hostel_type, b.name AS building_name, f.name AS floor_name, f.floor_number,
         COALESCE(bc.active_beds, 0) AS active_beds, COALESCE(bc.occupied_beds, 0) AS occupied_beds,
         IF(r.status IN ('maintenance','inactive'), 0, COALESCE(bc.free_beds, 0)) AS available_beds,
         COALESCE(bc.maintenance_beds, 0) AS maintenance_beds
  FROM rooms r
  JOIN hostels h ON h.id = r.hostel_id
  JOIN buildings b ON b.id = r.building_id
  JOIN floors f ON f.id = r.floor_id
  LEFT JOIN (${BED_COUNTS_SQL}) bc ON bc.room_id = r.id`;

async function getRoomDetail(id) {
  const room = await queryOne(`${ROOM_SELECT} WHERE r.id = ? AND r.deleted_at IS NULL`, [id]);
  if (!room) throw ApiError.notFound('Room not found');
  room.beds = await query(
    `SELECT bd.id, bd.bed_number, bd.status, ra.id AS allocation_id, ra.start_date, ra.monthly_rent AS allocated_rent,
            x.id AS resident_id, x.full_name AS resident_name, x.registration_no, x.mobile AS resident_mobile, ra.admission_id
     FROM room_beds bd
     LEFT JOIN room_allocations ra ON ra.bed_id = bd.id AND ra.status = 'active'
     LEFT JOIN residents x ON x.id = ra.resident_id
     WHERE bd.room_id = ? ORDER BY CAST(SUBSTRING(bd.bed_number, 2) AS UNSIGNED), bd.bed_number`,
    [id]
  );
  room.history = await query(
    `SELECT ra.id, ra.start_date, ra.end_date, ra.status, ra.release_reason, bd.bed_number, x.full_name AS resident_name, x.id AS resident_id
     FROM room_allocations ra JOIN room_beds bd ON bd.id = ra.bed_id JOIN residents x ON x.id = ra.resident_id
     WHERE ra.room_id = ? ORDER BY ra.id DESC LIMIT 50`,
    [id]
  );
  return room;
}

// GET /api/rooms
const list = asyncHandler(async (req, res) => {
  const { search, hostel_id, building_id, floor_id, status, room_type, availability } = req.q;
  const { limit, offset, meta } = paginate(req.q);
  const scope = hostelScope(req, 'r.hostel_id', hostel_id);
  const where = ['r.deleted_at IS NULL', scope.sql];
  const params = [...scope.params];
  if (search) where.push('(r.room_number LIKE ? OR r.facilities LIKE ?)') && params.push(`%${search}%`, `%${search}%`);
  if (building_id) where.push('r.building_id = ?') && params.push(building_id);
  if (floor_id) where.push('r.floor_id = ?') && params.push(floor_id);
  if (status) where.push('r.status = ?') && params.push(status);
  if (room_type) where.push('r.room_type = ?') && params.push(room_type);
  if (availability === 'available') where.push(`r.status NOT IN ('maintenance','inactive') AND COALESCE(bc.free_beds,0) > 0`);
  const whereSql = where.join(' AND ');
  const [{ total }] = await query(
    `SELECT COUNT(*) AS total FROM rooms r LEFT JOIN (${BED_COUNTS_SQL}) bc ON bc.room_id = r.id WHERE ${whereSql}`,
    params
  );
  const rows = await query(
    `${ROOM_SELECT} WHERE ${whereSql} ORDER BY h.name, b.name, f.floor_number, LENGTH(r.room_number), r.room_number LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  const summary = await queryOne(
    `SELECT COUNT(*) AS rooms, COALESCE(SUM(bc.active_beds),0) AS capacity, COALESCE(SUM(bc.occupied_beds),0) AS occupied,
            COALESCE(SUM(IF(r.status IN ('maintenance','inactive'), 0, bc.free_beds)),0) AS available
     FROM rooms r LEFT JOIN (${BED_COUNTS_SQL}) bc ON bc.room_id = r.id WHERE ${whereSql}`,
    params
  );
  sendSuccess(res, { data: rows, meta: { ...meta(total), summary } });
});

// GET /api/rooms/available?hostel_id=  - rooms with free beds, for admission / transfer
const available = asyncHandler(async (req, res) => {
  const scope = hostelScope(req, 'r.hostel_id', req.q.hostel_id);
  const rooms = await query(
    `${ROOM_SELECT} WHERE r.deleted_at IS NULL AND r.status NOT IN ('maintenance','inactive') AND COALESCE(bc.free_beds,0) > 0 AND ${scope.sql}
     ORDER BY b.name, f.floor_number, LENGTH(r.room_number), r.room_number`,
    scope.params
  );
  if (rooms.length) {
    const beds = await query(
      `SELECT id, room_id, bed_number FROM room_beds WHERE room_id IN (?) AND status = 'available'
       ORDER BY CAST(SUBSTRING(bed_number, 2) AS UNSIGNED), bed_number`,
      [rooms.map((r) => r.id)]
    );
    rooms.forEach((room) => {
      room.free_beds = beds.filter((bd) => bd.room_id === room.id);
    });
  }
  sendSuccess(res, { data: rooms });
});

// GET /api/rooms/:id
const get = asyncHandler(async (req, res) => {
  await findScoped(req, 'rooms', req.params.id, { label: 'Room', softDelete: true, columns: 'id, hostel_id' });
  sendSuccess(res, { data: await getRoomDetail(req.params.id) });
});

// POST /api/rooms
const create = asyncHandler(async (req, res) => {
  const b = req.body;
  const floor = await findScoped(req, 'floors', b.floor_id, { label: 'Floor', softDelete: true });
  const id = await withTransaction(async (conn) => {
    const [result] = await conn.query(
      `INSERT INTO rooms (hostel_id, building_id, floor_id, room_number, room_type, total_beds, monthly_rent, security_deposit, facilities, status, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [floor.hostel_id, floor.building_id, floor.id, b.room_number, b.room_type, b.total_beds, b.monthly_rent, b.security_deposit,
        b.facilities, b.status === 'available' ? 'available' : b.status, req.user.id]
    );
    const room = { id: result.insertId, hostel_id: floor.hostel_id, room_number: b.room_number };
    await syncBeds(conn, room, b.total_beds);
    await logAudit(conn, req, {
      action: 'room.create', entityType: 'room', entityId: room.id, hostelId: floor.hostel_id,
      description: `Created room ${b.room_number} (${b.total_beds} beds, Rs. ${b.monthly_rent}/month)`, newValues: b,
    });
    return room.id;
  });
  sendSuccess(res, { statusCode: 201, message: 'Room created', data: await getRoomDetail(id) });
});

// PUT /api/rooms/:id
const update = asyncHandler(async (req, res) => {
  const b = req.body;
  const room = await findScoped(req, 'rooms', req.params.id, { label: 'Room', softDelete: true });
  const floor = await findScoped(req, 'floors', b.floor_id, { label: 'Floor', softDelete: true });
  if (floor.hostel_id !== room.hostel_id) throw ApiError.badRequest('A room cannot be moved to another hostel');
  await withTransaction(async (conn) => {
    await syncBeds(conn, room, b.total_beds);
    await conn.query(
      `UPDATE rooms SET building_id = ?, floor_id = ?, room_number = ?, room_type = ?, total_beds = ?, monthly_rent = ?,
         security_deposit = ?, facilities = ? WHERE id = ?`,
      [floor.building_id, floor.id, b.room_number, b.room_type, b.total_beds, b.monthly_rent, b.security_deposit, b.facilities, room.id]
    );
    await refreshRoomStatus(conn, room.id);
    await logAudit(conn, req, {
      action: 'room.update', entityType: 'room', entityId: room.id, hostelId: room.hostel_id,
      description: `Updated room ${b.room_number}`,
      oldValues: { room_number: room.room_number, total_beds: room.total_beds, monthly_rent: room.monthly_rent, security_deposit: room.security_deposit },
      newValues: b,
    });
  });
  sendSuccess(res, { message: 'Room updated', data: await getRoomDetail(room.id) });
});

// PATCH /api/rooms/:id/status  { status: 'active' | 'maintenance' | 'inactive' }
const updateStatus = asyncHandler(async (req, res) => {
  const room = await findScoped(req, 'rooms', req.params.id, { label: 'Room', softDelete: true });
  const { status } = req.body;
  await withTransaction(async (conn) => {
    if (status === 'inactive') {
      const [[{ occupied }]] = await conn.query(`SELECT COUNT(*) AS occupied FROM room_beds WHERE room_id = ? AND status = 'occupied'`, [room.id]);
      if (occupied) throw ApiError.conflict('Room has residents. Transfer or check them out before deactivating.');
    }
    if (status === 'active') await refreshRoomStatus(conn, room.id, { force: true });
    else await conn.query('UPDATE rooms SET status = ? WHERE id = ?', [status, room.id]);
    await logAudit(conn, req, {
      action: 'room.status', entityType: 'room', entityId: room.id, hostelId: room.hostel_id,
      description: `Room ${room.room_number} status changed from ${room.status} to ${status}`,
    });
  });
  sendSuccess(res, { message: 'Room status updated', data: await getRoomDetail(room.id) });
});

// DELETE /api/rooms/:id (soft delete; only when no resident has ever... currently occupies it)
const remove = asyncHandler(async (req, res) => {
  const room = await findScoped(req, 'rooms', req.params.id, { label: 'Room', softDelete: true });
  await withTransaction(async (conn) => {
    const [[{ occupied }]] = await conn.query(`SELECT COUNT(*) AS occupied FROM room_beds WHERE room_id = ? AND status = 'occupied'`, [room.id]);
    if (occupied) throw ApiError.conflict('Room has residents and cannot be deleted');
    // Free the unique room number so it can be reused; history rows keep pointing at this id
    await conn.query(`UPDATE rooms SET deleted_at = NOW(), status = 'inactive', room_number = CONCAT(LEFT(room_number, 10), '~', id) WHERE id = ?`, [room.id]);
    await conn.query(`UPDATE room_beds SET status = 'inactive' WHERE room_id = ?`, [room.id]);
    await logAudit(conn, req, {
      action: 'room.delete', entityType: 'room', entityId: room.id, hostelId: room.hostel_id, description: `Deleted room ${room.room_number}`,
    });
  });
  sendSuccess(res, { message: 'Room deleted' });
});

// PATCH /api/rooms/:id/beds/:bedId  { status: 'available' | 'maintenance' }
const updateBed = asyncHandler(async (req, res) => {
  const room = await findScoped(req, 'rooms', req.params.id, { label: 'Room', softDelete: true });
  await withTransaction(async (conn) => {
    const [[bed]] = await conn.query('SELECT * FROM room_beds WHERE id = ? AND room_id = ? FOR UPDATE', [req.params.bedId, room.id]);
    if (!bed) throw ApiError.notFound('Bed not found');
    if (bed.status === 'occupied') throw ApiError.conflict('An occupied bed cannot be changed. Transfer or check out the resident first.');
    if (bed.status === 'inactive') throw ApiError.conflict('This bed is inactive. Increase the room total beds to re-activate it.');
    await conn.query('UPDATE room_beds SET status = ? WHERE id = ?', [req.body.status, bed.id]);
    await refreshRoomStatus(conn, room.id);
    await logAudit(conn, req, {
      action: 'bed.status', entityType: 'bed', entityId: bed.id, hostelId: room.hostel_id,
      description: `Bed ${room.room_number}/${bed.bed_number} set to ${req.body.status}`,
    });
  });
  sendSuccess(res, { message: 'Bed updated', data: await getRoomDetail(room.id) });
});

module.exports = { list, available, get, create, update, updateStatus, remove, updateBed };
