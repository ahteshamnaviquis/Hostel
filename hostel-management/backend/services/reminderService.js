/**
 * Automatic in-app reminders (CHUNK 13). Runs on a timer and on demand.
 * Each reminder has a dedupe key so it is created at most once per user per period.
 */
const { query } = require('../config/db');
const { notifyHostel } = require('./notificationService');
const settingsService = require('./settingsService');
const { today, addDays, currentMonth } = require('../utils/helpers');

const fmt = (n) => `Rs. ${Math.round(Number(n) || 0).toLocaleString('en-PK')}`;

async function runReminders() {
  const s = await settingsService.getSettings();
  const d = today();
  const month = currentMonth();
  let created = 0;

  if (s.notify_fee_due !== false) {
    const rows = await query(
      `SELECT hostel_id, COUNT(*) AS n, SUM(total_amount - paid_amount) AS amount FROM invoices
       WHERE status IN ('unpaid','partially_paid') AND due_date BETWEEN ? AND ? GROUP BY hostel_id`,
      [d, addDays(d, 3)]
    );
    for (const r of rows) {
      created += await notifyHostel(null, {
        hostelId: r.hostel_id, type: 'fee_due', title: 'Fees due soon',
        message: `${r.n} invoice(s) totalling ${fmt(r.amount)} are due within 3 days`, link: '/fees?tab=invoices&status=outstanding',
        dedupeKey: `fee_due:${r.hostel_id}:${d}`,
      });
    }
  }

  if (s.notify_overdue !== false) {
    const rows = await query(
      `SELECT hostel_id, COUNT(*) AS n, COUNT(DISTINCT resident_id) AS residents, SUM(total_amount - paid_amount) AS amount FROM invoices
       WHERE status IN ('unpaid','partially_paid') AND due_date < ? GROUP BY hostel_id`,
      [d]
    );
    for (const r of rows) {
      created += await notifyHostel(null, {
        hostelId: r.hostel_id, type: 'overdue_payment', title: 'Overdue payments',
        message: `${r.residents} resident(s) have ${r.n} overdue invoice(s) totalling ${fmt(r.amount)}`, link: '/fees?tab=invoices&status=overdue',
        dedupeKey: `overdue:${r.hostel_id}:${d}`,
      });
    }
  }

  if (s.notify_upcoming_checkout !== false) {
    const days = Number(s.checkout_reminder_days) || 7;
    const rows = await query(
      `SELECT a.id, a.hostel_id, a.expected_leaving_date, x.full_name FROM admissions a JOIN residents x ON x.id = a.resident_id
       WHERE a.status = 'active' AND a.expected_leaving_date BETWEEN ? AND ?`,
      [d, addDays(d, days)]
    );
    for (const r of rows) {
      created += await notifyHostel(null, {
        hostelId: r.hostel_id, type: 'upcoming_checkout', title: 'Upcoming checkout',
        message: `${r.full_name} is expected to leave on ${r.expected_leaving_date.split('-').reverse().join('/')}`, link: `/admissions/${r.id}`,
        dedupeKey: `checkout:${r.id}:${r.expected_leaving_date}`,
      });
    }
  }

  if (s.notify_complaints !== false) {
    const rows = await query(
      `SELECT hostel_id, COUNT(*) AS n, SUM(priority IN ('high','urgent')) AS urgent FROM complaints
       WHERE status IN ('open','in_progress') AND created_at < ? GROUP BY hostel_id`,
      [`${addDays(d, -2)} 23:59:59`]
    );
    for (const r of rows) {
      created += await notifyHostel(null, {
        hostelId: r.hostel_id, type: 'open_complaints', title: 'Complaints pending',
        message: `${r.n} complaint(s) open for more than 2 days${Number(r.urgent) ? ` (${r.urgent} high/urgent)` : ''}`, link: '/complaints?status=pending',
        dedupeKey: `complaints:${r.hostel_id}:${d}`,
      });
    }
  }

  // Maintenance reminder: rooms / beds under maintenance (weekly)
  const week = `${d.slice(0, 4)}-W${Math.ceil(Number(d.slice(8, 10)) / 7)}-${d.slice(5, 7)}`;
  const maint = await query(
    `SELECT r.hostel_id, COUNT(DISTINCT r.id) AS rooms FROM rooms r LEFT JOIN room_beds b ON b.room_id = r.id
     WHERE r.deleted_at IS NULL AND (r.status = 'maintenance' OR b.status = 'maintenance') GROUP BY r.hostel_id`
  );
  for (const r of maint) {
    created += await notifyHostel(null, {
      hostelId: r.hostel_id, type: 'maintenance', title: 'Maintenance reminder',
      message: `${r.rooms} room(s) have rooms or beds under maintenance`, link: '/rooms?status=maintenance',
      dedupeKey: `maintenance:${r.hostel_id}:${week}`,
    });
  }

  // Monthly fee generation reminder
  if (Number(d.slice(8, 10)) >= (Number(s.monthly_generation_day) || 1)) {
    const rows = await query(
      `SELECT a.hostel_id, COUNT(*) AS n FROM admissions a
       WHERE a.status = 'active' AND a.admission_date <= ? AND NOT EXISTS (
         SELECT 1 FROM invoices i WHERE i.admission_id = a.id AND i.billing_month = ? AND i.invoice_type = 'monthly' AND i.status <> 'cancelled')
       GROUP BY a.hostel_id`,
      [d, month]
    );
    for (const r of rows) {
      created += await notifyHostel(null, {
        hostelId: r.hostel_id, type: 'fee_generation', title: 'Monthly fees not generated',
        message: `${r.n} resident(s) have no invoice for ${month} yet. Generate monthly fees.`, link: '/fees?tab=invoices',
        dedupeKey: `generate:${r.hostel_id}:${month}`,
      });
    }
  }
  return created;
}

let timer = null;
function startReminderJob(intervalMinutes) {
  if (!intervalMinutes) return;
  const run = () => runReminders().catch((e) => console.error('[reminders] failed:', e.message));
  setTimeout(run, 10 * 1000);
  timer = setInterval(run, intervalMinutes * 60 * 1000);
  timer.unref();
}

module.exports = { runReminders, startReminderJob };
