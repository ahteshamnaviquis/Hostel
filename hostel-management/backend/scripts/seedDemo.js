/**
 * OPTIONAL demo data for trying the system (uses the real API, so all business rules apply).
 *
 *   npm run db:init       (fresh database)
 *   npm start             (in another terminal)
 *   npm run db:seed-demo
 *
 * Creates 2 hostels, buildings/floors/rooms, a hostel admin (admin@demo.pk / Admin@12345),
 * residents with admissions, payments, expenses, attendance, visitors and complaints.
 * Do NOT run on a production database.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const API = process.env.API_URL || 'http://localhost:5000/api';
const today = new Date(Date.now() + 5 * 3600e3).toISOString().slice(0, 10);
const addDays = (d, n) => {
  const x = new Date(`${d}T00:00:00Z`);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
};
const monthOf = (d) => d.slice(0, 7);

let token;
async function call(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${json.message} ${JSON.stringify(json.details || '')}`);
  return json.data;
}
async function upload(path, fields) {
  const form = new FormData();
  Object.entries(fields).forEach(([k, v]) => form.append(k, v));
  const res = await fetch(`${API}${path}`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
  const json = await res.json();
  if (!res.ok) throw new Error(`${path} -> ${json.message}`);
  return json.data;
}

const BOYS = ['Muhammad Usman', 'Ali Raza', 'Hamza Tariq', 'Bilal Ahmed', 'Saad Malik', 'Umar Farooq', 'Hassan Javed', 'Zain Abbas', 'Ahmed Nawaz', 'Fahad Iqbal', 'Talha Saeed', 'Danish Khan'];
const GIRLS = ['Ayesha Siddiqui', 'Fatima Noor', 'Zainab Khan', 'Maryam Aslam', 'Hira Shahid', 'Sana Rehman', 'Iqra Yousaf', 'Amna Bashir'];
const FATHERS = ['Muhammad Akram', 'Tariq Mehmood', 'Javed Iqbal', 'Abdul Rasheed', 'Ghulam Hussain', 'Khalid Mahmood', 'Shahid Latif', 'Nasir Ali'];
const INSTITUTIONS = ['University of the Punjab', 'UET Lahore', 'FAST-NUCES', 'COMSATS University', 'NUST Islamabad', 'Quaid-i-Azam University', 'LUMS', 'Systems Ltd (Employee)'];

async function main() {
  token = (await call('POST', '/auth/login', { identifier: process.env.SUPER_ADMIN_EMAIL || 'superadmin@hostel.pk', password: process.env.SUPER_ADMIN_PASSWORD || 'Admin@12345' })).token;
  const existing = await call('GET', '/hostels?search=DEMO-');
  if (existing.length) {
    console.log('Demo data already exists - skipping.');
    return;
  }
  console.log('Creating demo hostels...');
  const hostels = [
    { name: 'Gulberg Boys Hostel', code: 'DEMO-GBH', hostel_type: 'boys', address: '45-B Main Boulevard, Gulberg III', city: 'Lahore', province: 'Punjab', contact_number: '042-35761234', email: 'gulberg@demo.pk', warden_name: 'Rana Shafiq', warden_contact: '0300-4455667' },
    { name: 'Blue Area Girls Hostel', code: 'DEMO-BAG', hostel_type: 'girls', address: 'Plot 12, Jinnah Avenue, Blue Area', city: 'Islamabad', province: 'Islamabad Capital Territory', contact_number: '051-2876543', email: 'bluearea@demo.pk', warden_name: 'Shazia Parveen', warden_contact: '0333-5566778' },
  ];
  const created = [];
  for (const h of hostels) created.push(await call('POST', '/hostels', { ...h, status: 'active' }));
  await call('POST', '/users', { full_name: 'Kashif Mehmood', email: 'admin@demo.pk', username: 'kashif', phone: '0321-1234567', password: 'Admin@12345', role: 'hostel_admin', hostel_ids: [created[0].id] });
  await call('POST', '/users', { full_name: 'Rabia Anwar', email: 'rabia@demo.pk', phone: '0345-7654321', password: 'Admin@12345', role: 'hostel_admin', hostel_ids: [created[1].id] });

  let s = 0;
  for (const [hi, hostel] of created.entries()) {
    console.log(`Building rooms for ${hostel.name}...`);
    const blocks = hi === 0 ? ['Block A', 'Block B'] : ['Main Building'];
    const beds = [];
    for (const blockName of blocks) {
      const b = await call('POST', '/buildings', { hostel_id: hostel.id, name: blockName });
      for (const [fi, fname] of ['Ground Floor', 'First Floor'].entries()) {
        const f = await call('POST', '/floors', { building_id: b.id, floor_number: fi, name: fname });
        const prefix = `${blockName === 'Block B' ? 'B' : 'A'}-${fi + 1}`;
        const plan = [['single', 1, 22000], ['double', 2, 16000], ['triple', 3, 13000], ['four_seater', 4, 11000]];
        for (const [ri, [type, n, rent]] of plan.entries()) {
          const room = await call('POST', '/rooms', {
            floor_id: f.id, room_number: `${prefix}0${ri + 1}`, room_type: type, total_beds: n, monthly_rent: rent, security_deposit: rent,
            facilities: ri === 0 ? 'Attached Bath, AC, Wi-Fi, Study Table' : 'Wi-Fi, Cupboard, Study Table, Fan',
          });
          room.beds.forEach((bd) => beds.push(bd.id));
        }
      }
    }
    const names = hi === 0 ? BOYS : GIRLS;
    const feeTypes = await call('GET', '/fee-types');
    const mess = feeTypes.find((f) => f.code === 'mess_fee').id;
    for (const [i, name] of names.entries()) {
      s += 1;
      const r = await call('POST', '/residents', {
        hostel_id: hostel.id, full_name: name, father_name: FATHERS[i % FATHERS.length], gender: hi === 0 ? 'male' : 'female',
        cnic: `3520${hi}-${String(1234500 + s).padStart(7, '0')}-${s % 10}`, date_of_birth: `200${i % 6}-0${(i % 9) + 1}-1${i % 9}`,
        mobile: `030${i % 9}-${String(4567890 + s).slice(0, 7)}`, whatsapp: `030${i % 9}-${String(4567890 + s).slice(0, 7)}`,
        institution: INSTITUTIONS[i % INSTITUTIONS.length], department: ['Computer Science', 'Electrical Engineering', 'Business', 'Physics'][i % 4],
        class_designation: ['BSCS 3rd Semester', 'BSc Engg Final Year', 'MBA', 'MPhil'][i % 4], student_employee_id: `STD-${2024000 + s}`,
        city: ['Multan', 'Faisalabad', 'Sialkot', 'Bahawalpur', 'Peshawar', 'Sargodha'][i % 6], province: 'Punjab', permanent_address: `House ${10 + i}, Street ${i + 2}`,
        guardian_name: FATHERS[i % FATHERS.length], guardian_relationship: 'Father', guardian_phone: `0301-${String(7000000 + s)}`,
      });
      if (i >= names.length - 2) continue; // keep a couple of pending registrations
      const admissionDate = addDays(today, -(95 - i * 6));
      const adm = await call('POST', '/admissions', {
        resident_id: r.id, bed_id: beds[i * 2 % beds.length] === undefined ? beds[i] : beds[(i * 2) % beds.length], admission_date: admissionDate,
        expected_leaving_date: i % 4 === 0 ? addDays(today, 5 + i) : addDays(today, 200), admission_fee: 5000,
        extra_fees: i % 2 === 0 ? [{ fee_type_id: mess, amount: 9000 }] : [],
      }).catch(async () => call('POST', '/admissions', { resident_id: r.id, bed_id: beds.find((x, k) => k % 3 === i % 3) || beds[0], admission_date: admissionDate }));
      // Pay the admission invoices + most monthly bills
      const inv = await call('GET', `/invoices?admission_id=${adm.id}&status=outstanding&limit=50`);
      const due = inv.reduce((sum, x) => sum + x.balance, 0);
      const methods = ['cash', 'jazzcash', 'easypaisa', 'bank_transfer'];
      if (due) await call('POST', '/payments', { admission_id: adm.id, amount: due, payment_date: admissionDate, payment_method: methods[i % 4], reference_no: i % 4 ? `TXN${100000 + s}` : undefined });
    }

    // Monthly invoices for the last 3 months
    for (const m of [addDays(today, -60), addDays(today, -30), today].map(monthOf)) {
      await call('POST', '/invoices/generate-monthly', { hostel_id: hostel.id, billing_month: m });
    }
    // Pay most invoices (some residents keep dues)
    const accounts = await call('GET', `/fees/accounts?hostel_id=${hostel.id}&only_due=true&limit=100`);
    for (const [i, a] of accounts.entries()) {
      if (i % 3 === 2) continue;
      const amount = i % 4 === 0 ? Math.round(a.outstanding / 2) : a.outstanding;
      await call('POST', '/payments', { admission_id: a.admission_id, amount, payment_date: addDays(today, -(i % 10)), payment_method: ['cash', 'jazzcash', 'easypaisa'][i % 3] });
    }

    console.log('Expenses, attendance, visitors, complaints...');
    const expenseSeed = [[1, 'LESCO / IESCO electricity bill', 48000], [2, 'SNGPL gas bill', 15500], [3, 'Water tanker', 6000], [4, 'PTCL Flash Fiber internet', 12000],
      [5, 'Mess groceries', 85000], [6, 'Staff salaries', 120000], [7, 'Plumbing repairs', 7500], [8, 'Cleaning supplies', 4800], [10, 'Security guard', 35000]];
    for (const back of [60, 30, 2]) {
      for (const [cat, title, amt] of expenseSeed) {
        await upload('/expenses', { hostel_id: hostel.id, category_id: cat, title, amount: String(Math.round(amt * (hi ? 0.6 : 1) * (1 + (back % 7) / 50))), expense_date: addDays(today, -back - cat % 5), payment_method: cat % 2 ? 'bank_transfer' : 'cash' });
      }
    }
    for (const back of [3, 2, 1, 0]) {
      const date = addDays(today, -back);
      const sheet = await call('GET', `/attendance/sheet?hostel_id=${hostel.id}&date=${date}`);
      if (!sheet.length) continue;
      await call('POST', '/attendance', {
        hostel_id: hostel.id, attendance_date: date,
        records: sheet.map((x, i) => ({ resident_id: x.resident_id, status: ['present', 'present', 'present', 'absent', 'late', 'leave', 'present'][(i + back) % 7], entry_time: '22:45' })),
      });
    }
    const active = await call('GET', `/residents?hostel_id=${hostel.id}&status=active&limit=5`);
    for (const [i, r] of active.entries()) {
      const v = await call('POST', '/visitors', { resident_id: r.id, visitor_name: `${FATHERS[(i + 3) % FATHERS.length]}`, cnic: `35202-${1111110 + i}-${i}`, contact_number: '0300-1112223', relationship: i % 2 ? 'Brother' : 'Father', visit_date: today, entry_time: `1${i + 1}:15`, purpose: 'Family visit' });
      if (i % 2 === 0) await call('POST', `/visitors/${v.id}/exit`, { exit_time: `1${i + 2}:30` });
    }
    const complaints = [['water', 'No water in washroom since morning', 'high'], ['internet', 'Wi-Fi very slow on first floor', 'medium'], ['electricity', 'Fan not working in room', 'urgent'], ['food_quality', 'Dinner quality complaint', 'low']];
    for (const [i, [category, subject, priority]] of complaints.entries()) {
      const c = await call('POST', '/complaints', { hostel_id: hostel.id, resident_id: active[i % active.length]?.id, category, subject, priority });
      if (i === 0) await call('PUT', `/complaints/${c.id}`, { status: 'resolved', priority, assigned_to: 'Plumber Aslam', resolution_remarks: 'Motor repaired and tank refilled' });
      if (i === 1) await call('PUT', `/complaints/${c.id}`, { status: 'in_progress', priority, assigned_to: 'IT - Waqas' });
    }
  }
  await call('POST', '/notifications/run-reminders');
  console.log('\nDemo data ready.');
  console.log('  Super Admin : superadmin@hostel.pk / Admin@12345');
  console.log('  Hostel Admin: admin@demo.pk / Admin@12345 (Gulberg Boys Hostel)');
  console.log('  Hostel Admin: rabia@demo.pk / Admin@12345 (Blue Area Girls Hostel)');
}

main().catch((e) => {
  console.error('Seeding failed:', e.message);
  process.exit(1);
});
