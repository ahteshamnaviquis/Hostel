/**
 * Report definitions (CHUNK 14).
 * Each report returns { title, columns, rows, summary } and is always hostel-scoped.
 * Column types: text | date | money | number | percent | datetime
 */
const { query, queryOne } = require('../config/db');
const ApiError = require('../utils/ApiError');
const { hostelScope, isSuperAdmin } = require('../utils/scope');
const { today, currentMonth, monthRange, addDays } = require('../utils/helpers');
const { BED_COUNTS_SQL } = require('../models/roomModel');
const { PAYMENT_METHOD_LABELS } = require('../utils/constants');

const col = (key, label, type = 'text') => ({ key, label, type });
const sum = (rows, key) => rows.reduce((s, r) => s + (Number(r[key]) || 0), 0);
const defaultFrom = () => `${currentMonth()}-01`;

function dateRange(f) {
  return { from: f.from || defaultFrom(), to: f.to || today() };
}

const REPORTS = {
  // ------------------------------------------------------------------ Residents
  residents: {
    title: 'Resident List',
    group: 'Residents',
    filters: ['hostel', 'status'],
    async build(req, f) {
      const s = hostelScope(req, 'x.hostel_id', f.hostel_id);
      const params = [...s.params];
      let extra = '';
      if (f.status) {
        extra = 'AND x.status = ?';
        params.push(f.status);
      }
      const rows = await query(
        `SELECT x.registration_no, x.full_name, x.father_name, x.cnic, x.gender, x.mobile, x.institution, h.name AS hostel,
                CONCAT(COALESCE(rm.room_number,'-'), ' / ', COALESCE(bd.bed_number,'-')) AS room_bed, a.admission_date, x.status
         FROM residents x JOIN hostels h ON h.id = x.hostel_id
         LEFT JOIN admissions a ON a.resident_id = x.id AND a.status IN ('pending','active')
         LEFT JOIN room_allocations ra ON ra.admission_id = a.id AND ra.status = 'active'
         LEFT JOIN rooms rm ON rm.id = ra.room_id LEFT JOIN room_beds bd ON bd.id = ra.bed_id
         WHERE x.deleted_at IS NULL AND ${s.sql} ${extra} ORDER BY h.name, x.full_name`,
        params
      );
      return {
        columns: [col('registration_no', 'Reg. No'), col('full_name', 'Name'), col('father_name', 'Father Name'), col('cnic', 'CNIC'),
          col('gender', 'Gender'), col('mobile', 'Mobile'), col('institution', 'Institution'), col('hostel', 'Hostel'),
          col('room_bed', 'Room / Bed'), col('admission_date', 'Admitted', 'date'), col('status', 'Status')],
        rows,
        summary: [{ label: 'Total residents', value: rows.length, type: 'number' },
          { label: 'Active', value: rows.filter((r) => r.status === 'active').length, type: 'number' }],
      };
    },
  },

  'room-occupancy': {
    title: 'Room Occupancy',
    group: 'Rooms',
    filters: ['hostel', 'room_status'],
    async build(req, f) {
      const s = hostelScope(req, 'r.hostel_id', f.hostel_id);
      const params = [...s.params];
      let extra = '';
      if (f.status) {
        extra = 'AND r.status = ?';
        params.push(f.status);
      }
      const rows = await query(
        `SELECT h.name AS hostel, b.name AS building, fl.name AS floor, r.room_number, r.room_type, COALESCE(bc.active_beds,0) AS capacity,
                COALESCE(bc.occupied_beds,0) AS occupied, IF(r.status IN ('maintenance','inactive'), 0, COALESCE(bc.free_beds,0)) AS available,
                IF(COALESCE(bc.active_beds,0) > 0, ROUND(COALESCE(bc.occupied_beds,0) / bc.active_beds * 100, 1), 0) AS occupancy,
                r.monthly_rent, r.status
         FROM rooms r JOIN hostels h ON h.id = r.hostel_id JOIN buildings b ON b.id = r.building_id JOIN floors fl ON fl.id = r.floor_id
         LEFT JOIN (${BED_COUNTS_SQL}) bc ON bc.room_id = r.id
         WHERE r.deleted_at IS NULL AND ${s.sql} ${extra} ORDER BY h.name, b.name, fl.floor_number, r.room_number`,
        params
      );
      const cap = sum(rows, 'capacity');
      const occ = sum(rows, 'occupied');
      return {
        columns: [col('hostel', 'Hostel'), col('building', 'Building'), col('floor', 'Floor'), col('room_number', 'Room'), col('room_type', 'Type'),
          col('capacity', 'Beds', 'number'), col('occupied', 'Occupied', 'number'), col('available', 'Available', 'number'),
          col('occupancy', 'Occupancy', 'percent'), col('monthly_rent', 'Rent', 'money'), col('status', 'Status')],
        rows,
        summary: [{ label: 'Rooms', value: rows.length, type: 'number' }, { label: 'Capacity', value: cap, type: 'number' },
          { label: 'Occupied', value: occ, type: 'number' }, { label: 'Available', value: sum(rows, 'available'), type: 'number' },
          { label: 'Occupancy', value: cap ? Math.round((occ / cap) * 1000) / 10 : 0, type: 'percent' }],
      };
    },
  },

  'available-beds': {
    title: 'Available Beds',
    group: 'Rooms',
    filters: ['hostel'],
    async build(req, f) {
      const s = hostelScope(req, 'r.hostel_id', f.hostel_id);
      const rows = await query(
        `SELECT h.name AS hostel, b.name AS building, fl.name AS floor, r.room_number, bd.bed_number, r.room_type, r.monthly_rent, r.security_deposit, r.facilities
         FROM room_beds bd JOIN rooms r ON r.id = bd.room_id JOIN hostels h ON h.id = r.hostel_id JOIN buildings b ON b.id = r.building_id
         JOIN floors fl ON fl.id = r.floor_id
         WHERE bd.status = 'available' AND r.deleted_at IS NULL AND r.status NOT IN ('maintenance','inactive') AND ${s.sql}
         ORDER BY h.name, b.name, fl.floor_number, r.room_number, bd.bed_number`,
        s.params
      );
      return {
        columns: [col('hostel', 'Hostel'), col('building', 'Building'), col('floor', 'Floor'), col('room_number', 'Room'), col('bed_number', 'Bed'),
          col('room_type', 'Type'), col('monthly_rent', 'Monthly Rent', 'money'), col('security_deposit', 'Deposit', 'money'), col('facilities', 'Facilities')],
        rows,
        summary: [{ label: 'Available beds', value: rows.length, type: 'number' }],
      };
    },
  },

  admissions: {
    title: 'Admission Report',
    group: 'Residents',
    filters: ['hostel', 'dates', 'admission_status'],
    async build(req, f) {
      const { from, to } = dateRange(f);
      const s = hostelScope(req, 'a.hostel_id', f.hostel_id);
      const params = [from, to, ...s.params];
      let extra = '';
      if (f.status) {
        extra = 'AND a.status = ?';
        params.push(f.status);
      }
      const rows = await query(
        `SELECT a.admission_no, a.admission_date, x.registration_no, x.full_name, x.mobile, h.name AS hostel,
                CONCAT(rm.room_number, ' / ', bd.bed_number) AS room_bed, a.monthly_rent, a.security_deposit, a.admission_fee,
                a.expected_leaving_date, a.status
         FROM admissions a JOIN residents x ON x.id = a.resident_id JOIN hostels h ON h.id = a.hostel_id
         LEFT JOIN room_allocations ra ON ra.id = (SELECT MIN(id) FROM room_allocations WHERE admission_id = a.id)
         LEFT JOIN rooms rm ON rm.id = ra.room_id LEFT JOIN room_beds bd ON bd.id = ra.bed_id
         WHERE a.admission_date BETWEEN ? AND ? AND ${s.sql} ${extra} ORDER BY a.admission_date, a.id`,
        params
      );
      return {
        from, to,
        columns: [col('admission_no', 'Admission No'), col('admission_date', 'Date', 'date'), col('registration_no', 'Reg. No'), col('full_name', 'Resident'),
          col('mobile', 'Mobile'), col('hostel', 'Hostel'), col('room_bed', 'Room / Bed'), col('monthly_rent', 'Rent', 'money'),
          col('security_deposit', 'Deposit', 'money'), col('admission_fee', 'Admission Fee', 'money'), col('expected_leaving_date', 'Expected Leaving', 'date'),
          col('status', 'Status')],
        rows,
        summary: [{ label: 'Admissions', value: rows.length, type: 'number' }],
      };
    },
  },

  checkouts: {
    title: 'Checkout Report',
    group: 'Residents',
    filters: ['hostel', 'dates'],
    async build(req, f) {
      const { from, to } = dateRange(f);
      const s = hostelScope(req, 'a.hostel_id', f.hostel_id);
      const rows = await query(
        `SELECT a.admission_no, x.full_name, x.registration_no, h.name AS hostel, a.admission_date, a.checkout_date,
                DATEDIFF(a.checkout_date, a.admission_date) AS days_stayed, a.checkout_reason, a.deposit_adjusted, a.refund_amount,
                a.outstanding_amount, u.full_name AS checked_out_by
         FROM admissions a JOIN residents x ON x.id = a.resident_id JOIN hostels h ON h.id = a.hostel_id LEFT JOIN users u ON u.id = a.checked_out_by
         WHERE a.status = 'checked_out' AND a.checkout_date BETWEEN ? AND ? AND ${s.sql} ORDER BY a.checkout_date`,
        [from, to, ...s.params]
      );
      return {
        from, to,
        columns: [col('admission_no', 'Admission No'), col('full_name', 'Resident'), col('registration_no', 'Reg. No'), col('hostel', 'Hostel'),
          col('admission_date', 'Admitted', 'date'), col('checkout_date', 'Checked Out', 'date'), col('days_stayed', 'Days', 'number'),
          col('checkout_reason', 'Reason'), col('deposit_adjusted', 'Deposit Adjusted', 'money'), col('refund_amount', 'Refunded', 'money'),
          col('outstanding_amount', 'Outstanding', 'money'), col('checked_out_by', 'By')],
        rows,
        summary: [{ label: 'Checkouts', value: rows.length, type: 'number' }, { label: 'Refunded', value: sum(rows, 'refund_amount'), type: 'money' },
          { label: 'Outstanding', value: sum(rows, 'outstanding_amount'), type: 'money' }],
      };
    },
  },

  // ------------------------------------------------------------------ Finance
  'fee-collection': {
    title: 'Fee Collection',
    group: 'Finance',
    filters: ['hostel', 'dates', 'payment_method'],
    async build(req, f) {
      const { from, to } = dateRange(f);
      const s = hostelScope(req, 'p.hostel_id', f.hostel_id);
      const params = [from, to, ...s.params];
      let extra = '';
      if (f.payment_method) {
        extra = 'AND p.payment_method = ?';
        params.push(f.payment_method);
      }
      const rows = await query(
        `SELECT p.receipt_no, p.payment_date, x.registration_no, x.full_name, h.name AS hostel, p.payment_method, p.reference_no,
                p.amount, u.full_name AS received_by
         FROM payments p JOIN residents x ON x.id = p.resident_id JOIN hostels h ON h.id = p.hostel_id LEFT JOIN users u ON u.id = p.received_by
         WHERE p.status = 'posted' AND p.payment_method <> 'deposit_adjustment' AND p.payment_date BETWEEN ? AND ? AND ${s.sql} ${extra}
         ORDER BY p.payment_date, p.id`,
        params
      );
      rows.forEach((r) => {
        r.payment_method = PAYMENT_METHOD_LABELS[r.payment_method];
      });
      const methods = {};
      rows.forEach((r) => {
        methods[r.payment_method] = (methods[r.payment_method] || 0) + Number(r.amount);
      });
      return {
        from, to,
        columns: [col('receipt_no', 'Receipt'), col('payment_date', 'Date', 'date'), col('registration_no', 'Reg. No'), col('full_name', 'Resident'),
          col('hostel', 'Hostel'), col('payment_method', 'Method'), col('reference_no', 'Reference'), col('amount', 'Amount', 'money'), col('received_by', 'Received By')],
        rows,
        summary: [{ label: 'Total collected', value: sum(rows, 'amount'), type: 'money' }, { label: 'Payments', value: rows.length, type: 'number' },
          ...Object.entries(methods).map(([k, v]) => ({ label: k, value: v, type: 'money' }))],
      };
    },
  },

  'outstanding-fees': {
    title: 'Outstanding / Pending Fees',
    group: 'Finance',
    filters: ['hostel'],
    async build(req, f) {
      const s = hostelScope(req, 'i.hostel_id', f.hostel_id);
      const rows = await query(
        `SELECT x.registration_no, x.full_name, x.mobile, h.name AS hostel, a.admission_no, a.status AS admission_status,
                COUNT(i.id) AS invoices, MIN(i.due_date) AS oldest_due, DATEDIFF(CURDATE(), MIN(i.due_date)) AS days_overdue,
                SUM(i.total_amount) AS billed, SUM(i.paid_amount) AS paid, SUM(i.total_amount - i.paid_amount) AS outstanding
         FROM invoices i JOIN admissions a ON a.id = i.admission_id JOIN residents x ON x.id = i.resident_id JOIN hostels h ON h.id = i.hostel_id
         WHERE i.status IN ('unpaid','partially_paid') AND ${s.sql}
         GROUP BY a.id, x.registration_no, x.full_name, x.mobile, h.name, a.admission_no, a.status ORDER BY outstanding DESC`,
        s.params
      );
      rows.forEach((r) => {
        r.days_overdue = Math.max(0, r.days_overdue);
      });
      return {
        columns: [col('registration_no', 'Reg. No'), col('full_name', 'Resident'), col('mobile', 'Mobile'), col('hostel', 'Hostel'), col('admission_no', 'Admission'),
          col('admission_status', 'Stay Status'), col('invoices', 'Invoices', 'number'), col('oldest_due', 'Oldest Due', 'date'),
          col('days_overdue', 'Days Overdue', 'number'), col('billed', 'Billed', 'money'), col('paid', 'Paid', 'money'), col('outstanding', 'Outstanding', 'money')],
        rows,
        summary: [{ label: 'Residents with dues', value: rows.length, type: 'number' }, { label: 'Total outstanding', value: sum(rows, 'outstanding'), type: 'money' }],
      };
    },
  },

  expenses: {
    title: 'Expense Report',
    group: 'Finance',
    filters: ['hostel', 'dates', 'category'],
    async build(req, f) {
      const { from, to } = dateRange(f);
      const s = hostelScope(req, 'e.hostel_id', f.hostel_id);
      const params = [from, to, ...s.params];
      let extra = '';
      if (f.category_id) {
        extra = 'AND e.category_id = ?';
        params.push(f.category_id);
      }
      const rows = await query(
        `SELECT e.expense_date, h.name AS hostel, c.name AS category, e.title, e.payment_method, e.amount, u.full_name AS added_by
         FROM expenses e JOIN hostels h ON h.id = e.hostel_id JOIN expense_categories c ON c.id = e.category_id LEFT JOIN users u ON u.id = e.added_by
         WHERE e.status = 'posted' AND e.expense_date BETWEEN ? AND ? AND ${s.sql} ${extra} ORDER BY e.expense_date, e.id`,
        params
      );
      const cats = {};
      rows.forEach((r) => {
        r.payment_method = PAYMENT_METHOD_LABELS[r.payment_method];
        cats[r.category] = (cats[r.category] || 0) + Number(r.amount);
      });
      return {
        from, to,
        columns: [col('expense_date', 'Date', 'date'), col('hostel', 'Hostel'), col('category', 'Category'), col('title', 'Title'),
          col('payment_method', 'Method'), col('amount', 'Amount', 'money'), col('added_by', 'Added By')],
        rows,
        summary: [{ label: 'Total expenses', value: sum(rows, 'amount'), type: 'money' },
          ...Object.entries(cats).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ label: k, value: v, type: 'money' }))],
      };
    },
  },

  // ------------------------------------------------------------------ Operations
  attendance: {
    title: 'Attendance Report',
    group: 'Operations',
    filters: ['hostel', 'dates'],
    async build(req, f) {
      const { from, to } = dateRange(f);
      const s = hostelScope(req, 'att.hostel_id', f.hostel_id);
      const rows = await query(
        `SELECT x.registration_no, x.full_name, h.name AS hostel, SUM(att.status = 'present') AS present, SUM(att.status = 'absent') AS absent,
                SUM(att.status = 'leave') AS on_leave, SUM(att.status = 'late') AS late, COUNT(*) AS marked,
                ROUND((SUM(att.status = 'present') + SUM(att.status = 'late')) / COUNT(*) * 100, 1) AS percent
         FROM attendance att JOIN residents x ON x.id = att.resident_id JOIN hostels h ON h.id = att.hostel_id
         WHERE att.attendance_date BETWEEN ? AND ? AND ${s.sql}
         GROUP BY x.id, x.registration_no, x.full_name, h.name ORDER BY h.name, x.full_name`,
        [from, to, ...s.params]
      );
      return {
        from, to,
        columns: [col('registration_no', 'Reg. No'), col('full_name', 'Resident'), col('hostel', 'Hostel'), col('present', 'Present', 'number'),
          col('absent', 'Absent', 'number'), col('on_leave', 'Leave', 'number'), col('late', 'Late', 'number'), col('marked', 'Days Marked', 'number'),
          col('percent', 'Attendance', 'percent')],
        rows,
        summary: [{ label: 'Residents', value: rows.length, type: 'number' }, { label: 'Absences', value: sum(rows, 'absent'), type: 'number' }],
      };
    },
  },

  visitors: {
    title: 'Visitor Report',
    group: 'Operations',
    filters: ['hostel', 'dates'],
    async build(req, f) {
      const { from, to } = dateRange(f);
      const s = hostelScope(req, 'v.hostel_id', f.hostel_id);
      const rows = await query(
        `SELECT v.visit_date, v.entry_time, v.exit_time, v.visitor_name, v.cnic, v.contact_number, v.relationship, x.full_name AS resident,
                h.name AS hostel, v.purpose
         FROM visitors v JOIN residents x ON x.id = v.resident_id JOIN hostels h ON h.id = v.hostel_id
         WHERE v.visit_date BETWEEN ? AND ? AND ${s.sql} ORDER BY v.visit_date, v.entry_time`,
        [from, to, ...s.params]
      );
      return {
        from, to,
        columns: [col('visit_date', 'Date', 'date'), col('entry_time', 'Entry'), col('exit_time', 'Exit'), col('visitor_name', 'Visitor'), col('cnic', 'CNIC'),
          col('contact_number', 'Contact'), col('relationship', 'Relation'), col('resident', 'Resident'), col('hostel', 'Hostel'), col('purpose', 'Purpose')],
        rows,
        summary: [{ label: 'Visits', value: rows.length, type: 'number' }, { label: 'Exit not recorded', value: rows.filter((r) => !r.exit_time).length, type: 'number' }],
      };
    },
  },

  complaints: {
    title: 'Complaint Report',
    group: 'Operations',
    filters: ['hostel', 'dates', 'complaint_status'],
    async build(req, f) {
      const { from, to } = dateRange(f);
      const s = hostelScope(req, 'c.hostel_id', f.hostel_id);
      const params = [from, to, ...s.params];
      let extra = '';
      if (f.status) {
        extra = 'AND c.status = ?';
        params.push(f.status);
      }
      const rows = await query(
        `SELECT c.complaint_no, DATE(c.created_at) AS created, h.name AS hostel, x.full_name AS resident, rm.room_number, c.category, c.subject,
                c.priority, c.status, c.assigned_to, c.resolution_date, DATEDIFF(COALESCE(c.resolution_date, CURDATE()), DATE(c.created_at)) AS days_open
         FROM complaints c JOIN hostels h ON h.id = c.hostel_id LEFT JOIN residents x ON x.id = c.resident_id LEFT JOIN rooms rm ON rm.id = c.room_id
         WHERE DATE(c.created_at) BETWEEN ? AND ? AND ${s.sql} ${extra} ORDER BY c.id`,
        params
      );
      rows.forEach((r) => {
        r.category = r.category.replace(/_/g, ' ');
      });
      const count = (st) => rows.filter((r) => r.status === st).length;
      return {
        from, to,
        columns: [col('complaint_no', 'No'), col('created', 'Date', 'date'), col('hostel', 'Hostel'), col('resident', 'Resident'), col('room_number', 'Room'),
          col('category', 'Category'), col('subject', 'Subject'), col('priority', 'Priority'), col('status', 'Status'), col('assigned_to', 'Assigned To'),
          col('resolution_date', 'Resolved', 'date'), col('days_open', 'Days', 'number')],
        rows,
        summary: [{ label: 'Complaints', value: rows.length, type: 'number' }, { label: 'Open', value: count('open') + count('in_progress'), type: 'number' },
          { label: 'Resolved', value: count('resolved'), type: 'number' }, { label: 'Rejected', value: count('rejected'), type: 'number' }],
      };
    },
  },

  // ------------------------------------------------------------------ Super Admin
  'hostel-occupancy': {
    title: 'Hostel-wise Occupancy',
    group: 'Hostels',
    superAdmin: true,
    filters: [],
    async build() {
      const rows = await query(
        `SELECT h.name AS hostel, h.code, h.city, h.hostel_type, COUNT(DISTINCT r.id) AS rooms,
                COALESCE(SUM(b.status <> 'inactive' AND r.status <> 'inactive'),0) AS capacity, COALESCE(SUM(b.status = 'occupied'),0) AS occupied,
                COALESCE(SUM(b.status = 'available' AND r.status NOT IN ('maintenance','inactive')),0) AS available,
                (SELECT COUNT(*) FROM residents x WHERE x.hostel_id = h.id AND x.status = 'active' AND x.deleted_at IS NULL) AS residents
         FROM hostels h LEFT JOIN rooms r ON r.hostel_id = h.id AND r.deleted_at IS NULL LEFT JOIN room_beds b ON b.room_id = r.id
         WHERE h.deleted_at IS NULL GROUP BY h.id, h.name, h.code, h.city, h.hostel_type ORDER BY h.name`
      );
      rows.forEach((r) => {
        r.occupancy = r.capacity ? Math.round((r.occupied / r.capacity) * 1000) / 10 : 0;
      });
      const cap = sum(rows, 'capacity');
      return {
        columns: [col('hostel', 'Hostel'), col('code', 'Code'), col('city', 'City'), col('hostel_type', 'Type'), col('rooms', 'Rooms', 'number'),
          col('capacity', 'Beds', 'number'), col('occupied', 'Occupied', 'number'), col('available', 'Available', 'number'),
          col('residents', 'Residents', 'number'), col('occupancy', 'Occupancy', 'percent')],
        rows,
        summary: [{ label: 'Hostels', value: rows.length, type: 'number' }, { label: 'Total beds', value: cap, type: 'number' },
          { label: 'Occupancy', value: cap ? Math.round((sum(rows, 'occupied') / cap) * 1000) / 10 : 0, type: 'percent' }],
      };
    },
  },

  'hostel-revenue': {
    title: 'Hostel-wise Revenue & Expenses',
    group: 'Hostels',
    superAdmin: true,
    filters: ['dates'],
    async build(req, f) {
      const { from, to } = dateRange(f);
      const rows = await query(
        `SELECT h.name AS hostel, h.city,
           (SELECT COALESCE(SUM(i.total_amount),0) FROM invoices i WHERE i.hostel_id = h.id AND i.status <> 'cancelled' AND i.invoice_date BETWEEN ? AND ?) AS billed,
           (SELECT COALESCE(SUM(p.amount),0) FROM payments p WHERE p.hostel_id = h.id AND p.status = 'posted' AND p.payment_method <> 'deposit_adjustment' AND p.payment_date BETWEEN ? AND ?) AS collected,
           (SELECT COALESCE(SUM(f.amount),0) FROM refunds f WHERE f.hostel_id = h.id AND f.status = 'posted' AND f.refund_date BETWEEN ? AND ?) AS refunds,
           (SELECT COALESCE(SUM(e.amount),0) FROM expenses e WHERE e.hostel_id = h.id AND e.status = 'posted' AND e.expense_date BETWEEN ? AND ?) AS expenses,
           (SELECT COALESCE(SUM(i.total_amount - i.paid_amount),0) FROM invoices i WHERE i.hostel_id = h.id AND i.status IN ('unpaid','partially_paid')) AS outstanding
         FROM hostels h WHERE h.deleted_at IS NULL ORDER BY h.name`,
        [from, to, from, to, from, to, from, to]
      );
      rows.forEach((r) => {
        r.net = r.collected - r.refunds - r.expenses;
      });
      return {
        from, to,
        columns: [col('hostel', 'Hostel'), col('city', 'City'), col('billed', 'Billed', 'money'), col('collected', 'Collected', 'money'),
          col('refunds', 'Refunds', 'money'), col('expenses', 'Expenses', 'money'), col('net', 'Net', 'money'), col('outstanding', 'Outstanding (all time)', 'money')],
        rows,
        summary: ['collected', 'refunds', 'expenses', 'net', 'outstanding'].map((k) => ({ label: k[0].toUpperCase() + k.slice(1), value: sum(rows, k), type: 'money' })),
      };
    },
  },

  'hostel-expenses': {
    title: 'Hostel-wise Expenses by Category',
    group: 'Hostels',
    superAdmin: true,
    filters: ['dates'],
    async build(req, f) {
      const { from, to } = dateRange(f);
      const rows = await query(
        `SELECT h.name AS hostel, c.name AS category, COUNT(*) AS entries, SUM(e.amount) AS amount
         FROM expenses e JOIN hostels h ON h.id = e.hostel_id JOIN expense_categories c ON c.id = e.category_id
         WHERE e.status = 'posted' AND e.expense_date BETWEEN ? AND ? GROUP BY h.id, h.name, c.id, c.name ORDER BY h.name, amount DESC`,
        [from, to]
      );
      return {
        from, to,
        columns: [col('hostel', 'Hostel'), col('category', 'Category'), col('entries', 'Entries', 'number'), col('amount', 'Amount', 'money')],
        rows,
        summary: [{ label: 'Total expenses', value: sum(rows, 'amount'), type: 'money' }],
      };
    },
  },

  'admin-activity': {
    title: 'Administrator Activity',
    group: 'Hostels',
    superAdmin: true,
    filters: ['dates'],
    async build(req, f) {
      const { from, to } = dateRange(f);
      const rows = await query(
        `SELECT u.full_name, u.email, r.display_name AS role, u.status, u.last_login_at,
                SUM(l.action = 'auth.login') AS logins, SUM(l.action LIKE 'admission.%') AS admissions,
                SUM(l.action LIKE 'payment.%') AS payments, SUM(l.action LIKE 'expense.%') AS expenses,
                SUM(l.action NOT LIKE 'auth.%') AS total_actions, MAX(l.created_at) AS last_activity
         FROM users u JOIN roles r ON r.id = u.role_id
         LEFT JOIN audit_logs l ON l.user_id = u.id AND DATE(l.created_at) BETWEEN ? AND ?
         WHERE u.deleted_at IS NULL GROUP BY u.id, u.full_name, u.email, r.display_name, u.status, u.last_login_at
         ORDER BY total_actions DESC, u.full_name`,
        [from, to]
      );
      return {
        from, to,
        columns: [col('full_name', 'Name'), col('email', 'Email'), col('role', 'Role'), col('status', 'Status'), col('last_login_at', 'Last Login', 'datetime'),
          col('logins', 'Logins', 'number'), col('admissions', 'Admission Actions', 'number'), col('payments', 'Payment Actions', 'number'),
          col('expenses', 'Expense Actions', 'number'), col('total_actions', 'Total Actions', 'number'), col('last_activity', 'Last Activity', 'datetime')],
        rows,
        summary: [{ label: 'Users', value: rows.length, type: 'number' }, { label: 'Actions', value: sum(rows, 'total_actions'), type: 'number' }],
      };
    },
  },

  'financial-summary': {
    title: 'Monthly Financial Summary',
    group: 'Finance',
    filters: ['hostel', 'dates'],
    async build(req, f) {
      const from = f.from || `${addDays(today(), -365).slice(0, 7)}-01`;
      const to = f.to || today();
      const m = (col) => hostelScope(req, col, f.hostel_id);
      const grouped = async (sql, column) => {
        const sc = m(column);
        const rows = await query(sql.replace('__S__', sc.sql), [from, to, ...sc.params]);
        return Object.fromEntries(rows.map((r) => [r.ym, Number(r.v)]));
      };
      const billed = await grouped(`SELECT DATE_FORMAT(i.invoice_date,'%Y-%m') ym, SUM(i.total_amount) v FROM invoices i WHERE i.status <> 'cancelled' AND i.invoice_date BETWEEN ? AND ? AND __S__ GROUP BY ym`, 'i.hostel_id');
      const collected = await grouped(`SELECT DATE_FORMAT(p.payment_date,'%Y-%m') ym, SUM(p.amount) v FROM payments p WHERE p.status = 'posted' AND p.payment_method <> 'deposit_adjustment' AND p.payment_date BETWEEN ? AND ? AND __S__ GROUP BY ym`, 'p.hostel_id');
      const refunds = await grouped(`SELECT DATE_FORMAT(f.refund_date,'%Y-%m') ym, SUM(f.amount) v FROM refunds f WHERE f.status = 'posted' AND f.refund_date BETWEEN ? AND ? AND __S__ GROUP BY ym`, 'f.hostel_id');
      const expenses = await grouped(`SELECT DATE_FORMAT(e.expense_date,'%Y-%m') ym, SUM(e.amount) v FROM expenses e WHERE e.status = 'posted' AND e.expense_date BETWEEN ? AND ? AND __S__ GROUP BY ym`, 'e.hostel_id');
      const months = [];
      for (let ym = from.slice(0, 7); ym <= to.slice(0, 7); ) {
        months.push(ym);
        const [y, mo] = ym.split('-').map(Number);
        ym = mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}`;
      }
      const rows = months.map((ym) => {
        const r = { month: ym, billed: billed[ym] || 0, collected: collected[ym] || 0, refunds: refunds[ym] || 0, expenses: expenses[ym] || 0 };
        r.net = r.collected - r.refunds - r.expenses;
        r.collection_rate = r.billed ? Math.round((r.collected / r.billed) * 1000) / 10 : 0;
        return r;
      });
      return {
        from, to,
        columns: [col('month', 'Month'), col('billed', 'Billed', 'money'), col('collected', 'Collected', 'money'), col('refunds', 'Refunds', 'money'),
          col('expenses', 'Expenses', 'money'), col('net', 'Net Income', 'money'), col('collection_rate', 'Collection Rate', 'percent')],
        rows,
        summary: ['billed', 'collected', 'refunds', 'expenses', 'net'].map((k) => ({ label: k[0].toUpperCase() + k.slice(1), value: sum(rows, k), type: 'money' })),
      };
    },
  },
};

/** Reports the current user can run. */
function availableReports(req) {
  return Object.entries(REPORTS)
    .filter(([, r]) => !r.superAdmin || isSuperAdmin(req))
    .map(([key, r]) => ({ key, title: r.title, group: r.group, filters: r.filters }));
}

async function runReport(req, key, filters) {
  const def = REPORTS[key];
  if (!def) throw ApiError.notFound('Unknown report');
  if (def.superAdmin && !isSuperAdmin(req)) throw ApiError.forbidden('This report is available to the Super Admin only');
  if (filters.from && filters.to && filters.from > filters.to) throw ApiError.badRequest('"From" date must be before "To" date');
  const result = await def.build(req, filters);
  let hostelName = 'All hostels';
  if (filters.hostel_id) {
    const h = await queryOne('SELECT name FROM hostels WHERE id = ?', [filters.hostel_id]);
    hostelName = h ? h.name : hostelName;
  } else if (!isSuperAdmin(req)) {
    hostelName = 'All assigned hostels';
  }
  return { key, title: def.title, hostelName, generatedAt: new Date().toISOString(), ...result };
}

module.exports = { availableReports, runReport, monthRange };
