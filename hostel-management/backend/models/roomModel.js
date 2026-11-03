/**
 * Room / bed helpers shared by rooms, admissions, transfers and checkout.
 *
 * Definitions used everywhere (single source of truth):
 *  - Capacity  = beds whose status <> 'inactive' in rooms that are not inactive/deleted
 *  - Occupied  = beds with status 'occupied'
 *  - Available = beds with status 'available' in rooms not in maintenance/inactive
 */

/** SQL fragment: per-room bed counts. Use as a derived table joined on room_id. */
const BED_COUNTS_SQL = `
  SELECT room_id,
         SUM(status <> 'inactive') AS active_beds,
         SUM(status = 'occupied') AS occupied_beds,
         SUM(status = 'available') AS free_beds,
         SUM(status = 'maintenance') AS maintenance_beds
  FROM room_beds GROUP BY room_id`;

/** SQL fragment with capacity / occupied / available totals for a hostel scope condition on alias r. */
const OCCUPANCY_TOTALS_SQL = `
  SELECT COALESCE(SUM(b.status <> 'inactive'), 0) AS capacity,
         COALESCE(SUM(b.status = 'occupied'), 0) AS occupied,
         COALESCE(SUM(b.status = 'available' AND r.status NOT IN ('maintenance','inactive')), 0) AS available
  FROM room_beds b JOIN rooms r ON r.id = b.room_id
  WHERE r.deleted_at IS NULL AND r.status <> 'inactive'`;

/**
 * Recalculates a room's occupancy status from its beds.
 * Rooms in 'maintenance' or 'inactive' keep their status unless force = true.
 */
async function refreshRoomStatus(conn, roomId, { force = false } = {}) {
  const [[room]] = await conn.query('SELECT id, status FROM rooms WHERE id = ? FOR UPDATE', [roomId]);
  if (!room) return null;
  if (!force && ['maintenance', 'inactive'].includes(room.status)) return room.status;
  const [[counts]] = await conn.query(
    `SELECT SUM(status <> 'inactive') AS active_beds, SUM(status = 'occupied') AS occupied FROM room_beds WHERE room_id = ?`,
    [roomId]
  );
  const active = Number(counts.active_beds) || 0;
  const occupied = Number(counts.occupied) || 0;
  let status = 'available';
  if (occupied > 0 && occupied >= active) status = 'fully_occupied';
  else if (occupied > 0) status = 'partially_occupied';
  await conn.query('UPDATE rooms SET status = ? WHERE id = ?', [status, roomId]);
  return status;
}

const bedNumberValue = (bedNumber) => Number(String(bedNumber).replace(/\D/g, '')) || 0;

/**
 * Makes the number of active beds equal to `total`.
 * Increases by re-activating inactive beds, then creating new ones (B1, B2 ...).
 * Decreases by deactivating free beds (never occupied ones) from the highest number.
 */
async function syncBeds(conn, room, total) {
  const [beds] = await conn.query('SELECT id, bed_number, status FROM room_beds WHERE room_id = ? FOR UPDATE', [room.id]);
  beds.sort((a, b) => bedNumberValue(a.bed_number) - bedNumberValue(b.bed_number));
  const active = beds.filter((b) => b.status !== 'inactive');
  const occupied = beds.filter((b) => b.status === 'occupied').length;

  if (total < occupied) {
    const ApiError = require('../utils/ApiError');
    throw ApiError.conflict(`Room ${room.room_number} has ${occupied} occupied bed(s); total beds cannot be less than that`);
  }

  if (total > active.length) {
    let needed = total - active.length;
    for (const bed of beds.filter((b) => b.status === 'inactive')) {
      if (!needed) break;
      await conn.query(`UPDATE room_beds SET status = 'available' WHERE id = ?`, [bed.id]);
      needed -= 1;
    }
    let next = beds.length ? Math.max(...beds.map((b) => bedNumberValue(b.bed_number))) + 1 : 1;
    const rows = [];
    while (needed > 0) {
      rows.push([room.hostel_id, room.id, `B${next}`, 'available']);
      next += 1;
      needed -= 1;
    }
    if (rows.length) await conn.query('INSERT INTO room_beds (hostel_id, room_id, bed_number, status) VALUES ?', [rows]);
  } else if (total < active.length) {
    let excess = active.length - total;
    const removable = [...active.filter((b) => b.status === 'available'), ...active.filter((b) => b.status === 'maintenance')]
      .sort((a, b) => bedNumberValue(b.bed_number) - bedNumberValue(a.bed_number));
    for (const bed of removable) {
      if (!excess) break;
      await conn.query(`UPDATE room_beds SET status = 'inactive' WHERE id = ?`, [bed.id]);
      excess -= 1;
    }
  }
}

/** Default bed count for a room type. */
const DEFAULT_BEDS = { single: 1, double: 2, triple: 3, four_seater: 4 };

module.exports = { BED_COUNTS_SQL, OCCUPANCY_TOTALS_SQL, refreshRoomStatus, syncBeds, DEFAULT_BEDS };
