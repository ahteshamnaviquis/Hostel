/**
 * Dashboard statistics from real database records.
 * One service serves both dashboards; results are always hostel-scoped.
 */
const { query, queryOne } = require('../config/db');
const { hostelScope, isSuperAdmin } = require('../utils/scope');
const { OCCUPANCY_TOTALS_SQL } = require('../models/roomModel');
const { currentMonth, today, addDays } = require('../utils/helpers');

/** Last n months as YYYY-MM (oldest first). */
function lastMonths(n) {
  const [y, m] = currentMonth().split('-').map(Number);
  const months = [];
  for (let i = n - 1; i >= 0; i -= 1) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    months.push(d.toISOString().slice(0, 7));
  }
  return months;
}

const MONTH_LABEL = (ym) => new Date(`${ym}-01T00:00:00Z`).toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });

async function getDashboard(req, hostelId) {
  const s = (col) => hostelScope(req, col, hostelId);
  const month = currentMonth();
  const todayStr = today();
  const soon = addDays(todayStr, 7);
  const superAdmin = isSuperAdmin(req);

  const hs = s('h.id');
  const rs = s('r.hostel_id');
  const occupancy = await queryOne(`${OCCUPANCY_TOTALS_SQL} AND ${rs.sql}`, rs.params);

  const counts = await queryOne(
    `SELECT
      (SELECT COUNT(*) FROM hostels h WHERE h.deleted_at IS NULL AND ${hs.sql}) AS hostels,
      (SELECT COUNT(*) FROM hostels h WHERE h.deleted_at IS NULL AND h.status = 'active' AND ${hs.sql}) AS active_hostels,
      (SELECT COUNT(*) FROM buildings b WHERE b.deleted_at IS NULL AND ${s('b.hostel_id').sql}) AS buildings,
      (SELECT COUNT(*) FROM rooms r WHERE r.deleted_at IS NULL AND ${rs.sql}) AS rooms,
      (SELECT COUNT(*) FROM residents x WHERE x.deleted_at IS NULL AND x.status = 'active' AND ${s('x.hostel_id').sql}) AS residents,
      (SELECT COUNT(*) FROM admissions a WHERE DATE_FORMAT(a.admission_date,'%Y-%m') = ? AND a.status <> 'cancelled' AND ${s('a.hostel_id').sql}) AS new_admissions,
      (SELECT COUNT(*) FROM admissions a WHERE a.status = 'active' AND a.expected_leaving_date BETWEEN ? AND ? AND ${s('a.hostel_id').sql}) AS leaving_soon,
      (SELECT COALESCE(SUM(p.amount),0) FROM payments p WHERE p.status = 'posted' AND p.payment_method <> 'deposit_adjustment' AND DATE_FORMAT(p.payment_date,'%Y-%m') = ? AND ${s('p.hostel_id').sql}) AS fee_collected_month,
      (SELECT COALESCE(SUM(p.amount),0) FROM payments p WHERE p.status = 'posted' AND p.payment_method <> 'deposit_adjustment' AND ${s('p.hostel_id').sql}) AS fee_collected_total,
      (SELECT COALESCE(SUM(i.total_amount - i.paid_amount),0) FROM invoices i WHERE i.status IN ('unpaid','partially_paid') AND ${s('i.hostel_id').sql}) AS pending_fees,
      (SELECT COUNT(*) FROM invoices i WHERE i.status IN ('unpaid','partially_paid') AND i.due_date < ? AND ${s('i.hostel_id').sql}) AS overdue_invoices,
      (SELECT COALESCE(SUM(e.amount),0) FROM expenses e WHERE e.status = 'posted' AND DATE_FORMAT(e.expense_date,'%Y-%m') = ? AND ${s('e.hostel_id').sql}) AS expenses_month,
      (SELECT COALESCE(SUM(e.amount),0) FROM expenses e WHERE e.status = 'posted' AND ${s('e.hostel_id').sql}) AS expenses_total,
      (SELECT COALESCE(SUM(f.amount),0) FROM refunds f WHERE f.status = 'posted' AND DATE_FORMAT(f.refund_date,'%Y-%m') = ? AND ${s('f.hostel_id').sql}) AS refunds_month,
      (SELECT COUNT(*) FROM complaints c WHERE c.status IN ('open','in_progress') AND ${s('c.hostel_id').sql}) AS open_complaints`,
    [
      ...hs.params, ...hs.params, ...s('b.hostel_id').params, ...rs.params, ...s('x.hostel_id').params,
      month, ...s('a.hostel_id').params,
      todayStr, soon, ...s('a.hostel_id').params,
      month, ...s('p.hostel_id').params,
      ...s('p.hostel_id').params,
      ...s('i.hostel_id').params,
      todayStr, ...s('i.hostel_id').params,
      month, ...s('e.hostel_id').params,
      ...s('e.hostel_id').params,
      month, ...s('f.hostel_id').params,
      ...s('c.hostel_id').params,
    ]
  );

  let administrators = null;
  if (superAdmin) {
    const row = await queryOne(
      `SELECT COUNT(*) AS n FROM users u JOIN roles r ON r.id = u.role_id WHERE r.name = 'hostel_admin' AND u.deleted_at IS NULL AND u.status = 'active'`
    );
    administrators = row.n;
  }

  const capacity = Number(occupancy.capacity);
  const occupied = Number(occupancy.occupied);
  const stats = {
    ...counts,
    administrators,
    capacity,
    occupiedBeds: occupied,
    availableBeds: Number(occupancy.available),
    occupancyPercent: capacity ? Math.round((occupied / capacity) * 1000) / 10 : 0,
    monthlyRevenue: counts.fee_collected_month,
    month,
  };

  // ---- Charts
  const hostelOccupancy = await query(
    `SELECT h.id, h.name AS hostel,
       COALESCE(SUM(b.status = 'occupied'), 0) AS occupied,
       COALESCE(SUM(b.status = 'available' AND r.status NOT IN ('maintenance','inactive')), 0) AS available
     FROM hostels h
     LEFT JOIN rooms r ON r.hostel_id = h.id AND r.deleted_at IS NULL AND r.status <> 'inactive'
     LEFT JOIN room_beds b ON b.room_id = r.id
     WHERE h.deleted_at IS NULL AND ${hs.sql}
     GROUP BY h.id, h.name ORDER BY h.name`,
    hs.params
  );

  const months = lastMonths(6);
  const fromDate = `${months[0]}-01`;
  const collectedByMonth = await query(
    `SELECT DATE_FORMAT(p.payment_date,'%Y-%m') AS ym, SUM(p.amount) AS total FROM payments p
     WHERE p.status = 'posted' AND p.payment_method <> 'deposit_adjustment' AND p.payment_date >= ? AND ${s('p.hostel_id').sql} GROUP BY ym`,
    [fromDate, ...s('p.hostel_id').params]
  );
  const expensesByMonth = await query(
    `SELECT DATE_FORMAT(e.expense_date,'%Y-%m') AS ym, SUM(e.amount) AS total FROM expenses e
     WHERE e.status = 'posted' AND e.expense_date >= ? AND ${s('e.hostel_id').sql} GROUP BY ym`,
    [fromDate, ...s('e.hostel_id').params]
  );
  const toMap = (rows) => Object.fromEntries(rows.map((r) => [r.ym, Number(r.total)]));
  const cMap = toMap(collectedByMonth);
  const eMap = toMap(expensesByMonth);
  const monthlyFinance = months.map((ym) => ({ month: MONTH_LABEL(ym), ym, collected: cMap[ym] || 0, expenses: eMap[ym] || 0 }));

  const hostelRevenue = await query(
    `SELECT h.name AS hostel, COALESCE(SUM(p.amount), 0) AS revenue FROM hostels h
     LEFT JOIN payments p ON p.hostel_id = h.id AND p.status = 'posted' AND p.payment_method <> 'deposit_adjustment'
       AND DATE_FORMAT(p.payment_date,'%Y-%m') = ?
     WHERE h.deleted_at IS NULL AND ${hs.sql} GROUP BY h.id, h.name ORDER BY revenue DESC`,
    [month, ...hs.params]
  );

  const feeStatus = await queryOne(
    `SELECT COALESCE(SUM(i.paid_amount),0) AS paid, COALESCE(SUM(i.total_amount - i.paid_amount),0) AS pending
     FROM invoices i WHERE i.status <> 'cancelled' AND ${s('i.hostel_id').sql}`,
    s('i.hostel_id').params
  );

  const roomStatus = await query(
    `SELECT r.status, COUNT(*) AS count FROM rooms r WHERE r.deleted_at IS NULL AND ${rs.sql} GROUP BY r.status`,
    rs.params
  );

  // ---- Recent records
  const recentAdmissions = await query(
    `SELECT a.id, a.admission_no, a.admission_date, a.status, x.id AS resident_id, x.full_name, h.name AS hostel_name,
            CONCAT(rm.room_number, ' / ', bd.bed_number) AS room_bed
     FROM admissions a JOIN residents x ON x.id = a.resident_id JOIN hostels h ON h.id = a.hostel_id
     LEFT JOIN room_allocations ra ON ra.id = (SELECT MAX(id) FROM room_allocations WHERE admission_id = a.id)
     LEFT JOIN rooms rm ON rm.id = ra.room_id LEFT JOIN room_beds bd ON bd.id = ra.bed_id
     WHERE a.status <> 'cancelled' AND ${s('a.hostel_id').sql} ORDER BY a.id DESC LIMIT 5`,
    s('a.hostel_id').params
  );
  const recentPayments = await query(
    `SELECT p.id, p.receipt_no, p.amount, p.payment_method, p.payment_date, x.full_name, h.name AS hostel_name
     FROM payments p JOIN residents x ON x.id = p.resident_id JOIN hostels h ON h.id = p.hostel_id
     WHERE p.status = 'posted' AND ${s('p.hostel_id').sql} ORDER BY p.id DESC LIMIT 5`,
    s('p.hostel_id').params
  );
  const recentTransfers = await query(
    `SELECT t.id, t.transfer_date, t.reason, x.full_name,
            CONCAT(fr.room_number, '/', fb.bed_number) AS from_bed, CONCAT(tr.room_number, '/', tb.bed_number) AS to_bed
     FROM room_transfers t JOIN residents x ON x.id = t.resident_id
     JOIN room_allocations fa ON fa.id = t.from_allocation_id JOIN rooms fr ON fr.id = fa.room_id JOIN room_beds fb ON fb.id = fa.bed_id
     JOIN room_allocations ta ON ta.id = t.to_allocation_id JOIN rooms tr ON tr.id = ta.room_id JOIN room_beds tb ON tb.id = ta.bed_id
     WHERE ${s('t.hostel_id').sql} ORDER BY t.id DESC LIMIT 5`,
    s('t.hostel_id').params
  );
  const recentComplaints = await query(
    `SELECT c.id, c.complaint_no, c.subject, c.category, c.priority, c.status, c.created_at, x.full_name
     FROM complaints c LEFT JOIN residents x ON x.id = c.resident_id
     WHERE ${s('c.hostel_id').sql} ORDER BY c.id DESC LIMIT 5`,
    s('c.hostel_id').params
  );
  const recentMovements = await query(
    `SELECT * FROM (
       SELECT a.id, 'check_in' AS type, a.check_in_date AS date, x.full_name FROM admissions a JOIN residents x ON x.id = a.resident_id
       WHERE a.check_in_date IS NOT NULL AND ${s('a.hostel_id').sql}
       UNION ALL
       SELECT a.id, 'check_out' AS type, a.checkout_date AS date, x.full_name FROM admissions a JOIN residents x ON x.id = a.resident_id
       WHERE a.checkout_date IS NOT NULL AND ${s('a.hostel_id').sql}
     ) m ORDER BY m.date DESC, m.id DESC LIMIT 5`,
    [...s('a.hostel_id').params, ...s('a.hostel_id').params]
  );
  const auditScope = superAdmin && !hostelId ? { sql: '1=1', params: [] } : s('l.hostel_id');
  const recentActivities = await query(
    `SELECT l.id, l.action, l.description, l.created_at, u.full_name AS user_name
     FROM audit_logs l LEFT JOIN users u ON u.id = l.user_id
     WHERE l.action NOT IN ('auth.login','auth.logout','auth.login_failed') AND ${auditScope.sql}
     ORDER BY l.id DESC LIMIT 8`,
    auditScope.params
  );

  return {
    stats,
    charts: { hostelOccupancy, monthlyFinance, hostelRevenue, feeStatus, roomStatus },
    recent: {
      admissions: recentAdmissions,
      payments: recentPayments,
      transfers: recentTransfers,
      complaints: recentComplaints,
      movements: recentMovements,
      activities: recentActivities,
    },
  };
}

module.exports = { getDashboard, lastMonths, MONTH_LABEL };
