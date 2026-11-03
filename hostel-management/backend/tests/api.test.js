/**
 * End-to-end API test against a running server + real MySQL database.
 *
 *   npm run db:init      (once)
 *   npm start            (in another terminal)
 *   npm run test:api
 *
 * Creates its own uniquely-named data, so it can be re-run safely.
 * Env: API_URL (default http://localhost:5000/api), SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const API = process.env.API_URL || 'http://localhost:5000/api';
const SA = { identifier: process.env.SUPER_ADMIN_EMAIL || 'superadmin@hostel.pk', password: process.env.SUPER_ADMIN_PASSWORD || 'Admin@12345' };
const RUN = Date.now().toString(36).toUpperCase().slice(-5);
const today = new Date(Date.now() + 5 * 3600e3).toISOString().slice(0, 10);
const thisMonth = today.slice(0, 7);
const nextMonth = (() => {
  const [y, m] = thisMonth.split('-').map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
})();

let passed = 0;
let failed = 0;
const check = (name, condition, extra) => {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failed += 1;
    console.log(`  ✗ ${name}${extra !== undefined ? ` -> ${JSON.stringify(extra).slice(0, 300)}` : ''}`);
  }
};

async function call(token, method, path, body, { raw = false } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (raw) return res;
  const json = await res.json().catch(() => ({}));
  return { status: res.status, ...json };
}

async function upload(token, path, fields, file) {
  const form = new FormData();
  Object.entries(fields).forEach(([k, v]) => form.append(k, v));
  if (file) form.append(file.field, new Blob([file.content], { type: file.type }), file.name);
  const res = await fetch(`${API}${path}`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
  return { status: res.status, ...(await res.json()) };
}

async function main() {
  console.log(`API test run ${RUN} against ${API}\n`);

  console.log('CHUNK 2 - Authentication & roles');
  check('rejects wrong password', (await call(null, 'POST', '/auth/login', { ...SA, password: 'wrong-pass1' })).status === 401);
  check('rejects unauthenticated request', (await call(null, 'GET', '/hostels')).status === 401);
  const login = await call(null, 'POST', '/auth/login', SA);
  check('super admin login', login.status === 200 && login.data.token, login);
  const sa = login.data.token;
  check('super admin has all permissions', login.data.user.permissions.length >= 11);

  console.log('\nCHUNK 3 - Hostels');
  const hostelBody = (code, type, name) => ({
    name, code, hostel_type: type, address: 'Main Boulevard', city: 'Lahore', province: 'Punjab', contact_number: '042-35761234', status: 'active',
  });
  const badHostel = await call(sa, 'POST', '/hostels', { ...hostelBody(`X${RUN}`, 'boys', 'X'), province: 'Texas' });
  check('validates province', badHostel.status === 422 && badHostel.details.province, badHostel);
  const hA = (await call(sa, 'POST', '/hostels', hostelBody(`A${RUN}`, 'boys', `Test Boys ${RUN}`))).data;
  const hB = (await call(sa, 'POST', '/hostels', hostelBody(`B${RUN}`, 'girls', `Test Girls ${RUN}`))).data;
  check('creates hostels', hA?.id && hB?.id);
  check('duplicate hostel code rejected', (await call(sa, 'POST', '/hostels', hostelBody(`A${RUN}`, 'boys', 'Dup'))).status === 409);

  const admin = await call(sa, 'POST', '/users', {
    full_name: `Admin ${RUN}`, email: `admin${RUN.toLowerCase()}@test.pk`, password: 'Admin12345', role: 'hostel_admin', hostel_ids: [hA.id],
  });
  check('creates hostel admin with default permissions', admin.status === 201 && admin.data.permissions.includes('residents.manage') && !admin.data.permissions.includes('buildings.manage'), admin);
  check('weak password rejected', (await call(sa, 'POST', '/users', { full_name: 'W', email: `w${RUN}@t.pk`, password: 'abc' })).status === 422);
  let ad = (await call(null, 'POST', '/auth/login', { identifier: `admin${RUN.toLowerCase()}@test.pk`, password: 'Admin12345' })).data.token;
  check('admin login', Boolean(ad));
  const adHostels = await call(ad, 'GET', '/hostels?limit=200');
  check('admin sees only assigned hostel', adHostels.data.every((h) => h.id === hA.id) && adHostels.data.length === 1, adHostels.data);
  check('admin blocked from other hostel', (await call(ad, 'GET', `/hostels/${hB.id}`)).status === 403);
  check('admin blocked from user management', (await call(ad, 'GET', '/users')).status === 403);
  check('admin cannot create hostel', (await call(ad, 'POST', '/hostels', hostelBody(`C${RUN}`, 'boys', 'C'))).status === 403);
  check('admin without buildings.manage cannot add building', (await call(ad, 'POST', '/buildings', { hostel_id: hA.id, name: 'X' })).status === 403);

  console.log('\nCHUNK 4 - Buildings, floors, rooms, beds');
  const bld = (await call(sa, 'POST', '/buildings', { hostel_id: hA.id, name: 'Block A' })).data;
  const flr = (await call(sa, 'POST', '/floors', { building_id: bld.id, floor_number: 0, name: 'Ground Floor' })).data;
  check('building + floor created', bld?.id && flr?.id);
  check('duplicate floor number rejected', (await call(sa, 'POST', '/floors', { building_id: bld.id, floor_number: 0, name: 'G2' })).status === 409);
  const r1 = (await call(ad, 'POST', '/rooms', { floor_id: flr.id, room_number: '101', room_type: 'double', total_beds: 2, monthly_rent: 15000, security_deposit: 10000, facilities: 'Attached Bath, Wi-Fi' })).data;
  const r2 = (await call(ad, 'POST', '/rooms', { floor_id: flr.id, room_number: '102', room_type: 'single', total_beds: 1, monthly_rent: 20000, security_deposit: 10000 })).data;
  check('rooms created with beds', r1?.beds.length === 2 && r2?.beds.length === 1, r1);
  check('duplicate room number rejected', (await call(ad, 'POST', '/rooms', { floor_id: flr.id, room_number: '101', room_type: 'single', total_beds: 1, monthly_rent: 1 })).status === 409);

  console.log('\nCHUNK 5 - Residents');
  const resBody = (name, gender = 'male', cnic) => ({
    hostel_id: hA.id, full_name: name, father_name: 'Muhammad Akram', gender, mobile: '0300-1234567', cnic, institution: 'University of the Punjab',
    guardian_name: 'Akram', guardian_phone: '0301-7654321', province: 'Punjab',
  });
  const cnic = (n) => `35202-${String(1000000 + Number(n)).slice(-7)}-${n % 10}`;
  const seed = parseInt(RUN, 36) % 900000;
  const res1 = (await call(ad, 'POST', '/residents', resBody(`Ali Raza ${RUN}`, 'male', cnic(seed)))).data;
  const res2 = (await call(ad, 'POST', '/residents', resBody(`Usman Tariq ${RUN}`, 'male', cnic(seed + 1)))).data;
  const res3 = (await call(ad, 'POST', '/residents', resBody(`Hamza Khan ${RUN}`, 'male', cnic(seed + 2)))).data;
  check('residents registered with reg numbers', res1?.registration_no?.startsWith('RES-') && res3?.id, res1);
  check('female rejected in boys hostel', (await call(ad, 'POST', '/residents', resBody('Ayesha', 'female'))).status === 400);
  check('invalid CNIC rejected', (await call(ad, 'POST', '/residents', resBody('X', 'male', '123'))).status === 422);
  check('admin cannot register in other hostel', (await call(ad, 'POST', '/residents', { ...resBody('Y'), hostel_id: hB.id })).status === 403);
  const doc = await upload(ad, `/residents/${res1.id}/documents`, { document_type: 'cnic', title: 'CNIC front' }, { field: 'file', content: '%PDF-1.4 test', type: 'application/pdf', name: 'cnic.pdf' });
  check('document upload', doc.status === 201, doc);
  const badDoc = await upload(ad, `/residents/${res1.id}/documents`, { document_type: 'cnic' }, { field: 'file', content: 'MZ', type: 'application/x-msdownload', name: 'virus.exe' });
  check('executable upload rejected', badDoc.status === 400, badDoc);
  const dl = await call(ad, 'GET', `/residents/${res1.id}/documents/${doc.data.id}/download`, null, { raw: true });
  check('protected document download', dl.status === 200);
  check('document not publicly served', (await fetch(`${API.replace('/api', '')}/uploads/residents`)).status === 404);
  const search = await call(ad, 'GET', `/residents?search=${encodeURIComponent(`Ali Raza ${RUN}`)}`);
  check('resident search', search.data.length === 1);

  console.log('\nCHUNK 6 - Admission & allocation');
  const bed1 = r1.beds[0].id;
  const bed2 = r1.beds[1].id;
  const adm1 = await call(ad, 'POST', '/admissions', { resident_id: res1.id, bed_id: bed1, admission_date: today, admission_fee: 5000 });
  check('admission created with initial invoices', adm1.status === 201 && adm1.data.invoices.length === 2, adm1);
  const dupBed = await call(ad, 'POST', '/admissions', { resident_id: res2.id, bed_id: bed1, admission_date: today });
  check('double allocation of same bed rejected', dupBed.status === 409, dupBed);
  check('second admission for same resident rejected', (await call(ad, 'POST', '/admissions', { resident_id: res1.id, bed_id: bed2, admission_date: today })).status === 409);
  const adm2 = await call(ad, 'POST', '/admissions', { resident_id: res2.id, bed_id: bed2, admission_date: today, security_deposit: 0 });
  check('second bed allocated', adm2.status === 201, adm2);
  const room1 = (await call(ad, 'GET', `/rooms/${r1.id}`)).data;
  check('room becomes fully occupied', room1.status === 'fully_occupied' && room1.available_beds === 0, room1.status);
  check('capacity cannot be reduced below occupied', (await call(ad, 'PUT', `/rooms/${r1.id}`, { floor_id: flr.id, room_number: '101', room_type: 'double', total_beds: 1, monthly_rent: 15000 })).status === 409);
  check('full room has no available beds for 3rd resident', (await call(ad, 'GET', `/rooms/available?hostel_id=${hA.id}`)).data.every((r) => r.id !== r1.id));
  check('cannot deactivate occupied room', (await call(ad, 'PATCH', `/rooms/${r1.id}/status`, { status: 'inactive' })).status === 409);

  console.log('\nCHUNK 7 - Fees & payments');
  const a1 = adm1.data;
  let acc = (await call(ad, 'GET', `/admissions/${a1.id}`)).data;
  check('initial balance = deposit + admission fee + rent = 30000', acc.balance.outstanding === 30000, acc.balance);
  const p1 = await call(ad, 'POST', '/payments', { admission_id: a1.id, amount: 12000, payment_date: today, payment_method: 'cash' });
  check('partial payment recorded', p1.status === 201 && p1.data.allocated === 12000, p1);
  const p2 = await call(ad, 'POST', '/payments', { admission_id: a1.id, amount: 20000, payment_date: today, payment_method: 'jazzcash', reference_no: 'JC123' });
  check('overpayment kept as advance (2000)', p2.data.advance === 2000, p2.data);
  acc = (await call(ad, 'GET', `/admissions/${a1.id}`)).data;
  check('all invoices paid, advance 2000', acc.balance.outstanding === 0 && acc.balance.advance === 2000, acc.balance);
  const gen = await call(ad, 'POST', '/invoices/generate-monthly', { hostel_id: hA.id, billing_month: nextMonth });
  check('monthly fees generated for active residents', gen.status === 200 && gen.data.created === 2, gen);
  const gen2 = await call(ad, 'POST', '/invoices/generate-monthly', { hostel_id: hA.id, billing_month: nextMonth });
  check('re-running monthly generation creates no duplicates', gen2.data.created === 0 && gen2.data.skipped === 2, gen2.data);
  acc = (await call(ad, 'GET', `/admissions/${a1.id}`)).data;
  check('advance automatically applied to new invoice', acc.balance.advance === 0 && acc.balance.outstanding === 13000, acc.balance);
  const receipt = (await call(ad, 'GET', `/payments/${p2.data.id}/receipt`)).data;
  check('receipt has hostel, resident, room, allocations, balance', receipt.hostel_name && receipt.full_name && receipt.room?.room_number === '101' && receipt.allocations.length >= 1 && receipt.remaining_balance === 13000, receipt);
  const manual = await call(ad, 'POST', '/invoices', {
    admission_id: adm2.data.id, invoice_date: today, due_date: today,
    items: [{ fee_type_id: 5, amount: 1500, description: 'Electricity share' }, { fee_type_id: 11, amount: 500, description: 'Discount' }],
  });
  check('manual invoice with discount (1500 - 500 = 1000)', manual.status === 201 && manual.data.total_amount === 1000, manual);
  const p3 = await call(ad, 'POST', '/payments', { admission_id: adm2.data.id, amount: 1000, payment_date: today, payment_method: 'easypaisa', invoice_ids: [manual.data.id] });
  check('payment applied to selected invoice first', (await call(ad, 'GET', `/invoices/${manual.data.id}`)).data.status === 'paid', p3);
  check('cannot cancel invoice with payments', (await call(ad, 'POST', `/invoices/${manual.data.id}/cancel`, { reason: 'x' })).status === 409);
  const rev = await call(ad, 'POST', `/payments/${p3.data.id}/reverse`, { reason: 'Entered by mistake' });
  check('payment reversed -> invoice unpaid again', rev.status === 200 && (await call(ad, 'GET', `/invoices/${manual.data.id}`)).data.status === 'unpaid', rev);
  check('cannot reverse twice', (await call(ad, 'POST', `/payments/${p3.data.id}/reverse`, { reason: 'again' })).status === 409);
  check('cancel unpaid invoice', (await call(ad, 'POST', `/invoices/${manual.data.id}/cancel`, { reason: 'Wrong amount' })).status === 200);
  check('deposit refund blocked while staying', (await call(ad, 'POST', '/refunds', { admission_id: a1.id, refund_type: 'security_deposit', amount: 100, refund_date: today, payment_method: 'cash', reason: 'x' })).status === 409);
  const accounts = await call(ad, 'GET', `/fees/accounts?hostel_id=${hA.id}&only_due=true`);
  check('outstanding accounts list', accounts.data.length >= 1 && accounts.meta.totals.outstanding > 0, accounts.meta);

  console.log('\nCHUNK 6 - Room transfer');
  const tr = await call(ad, 'POST', `/admissions/${adm2.data.id}/transfer`, { to_bed_id: r2.beds[0].id, transfer_date: today, reason: 'Requested single room', monthly_rent: 20000 });
  check('transfer completed', tr.status === 200, tr);
  const trd = tr.data;
  check('previous allocation preserved as history', trd.allocations.length === 2 && trd.allocations.some((a) => a.status === 'transferred'), trd.allocations);
  check('rent updated on transfer', trd.monthly_rent === 20000);
  const room1b = (await call(ad, 'GET', `/rooms/${r1.id}`)).data;
  check('old bed released (room partially occupied)', room1b.status === 'partially_occupied' && room1b.available_beds === 1, room1b.status);
  check('transfer to occupied bed rejected', (await call(ad, 'POST', `/admissions/${adm2.data.id}/transfer`, { to_bed_id: bed1, transfer_date: today, reason: 'x' })).status === 409);

  console.log('\nCHUNK 8 - Expenses & finance');
  const exp = await upload(ad, '/expenses', { hostel_id: hA.id, category_id: 1, title: 'LESCO bill', amount: '25000', expense_date: today, payment_method: 'bank_transfer' }, { field: 'receipt', content: '%PDF-1.4', type: 'application/pdf', name: 'bill.pdf' });
  check('expense with receipt recorded', exp.status === 201, exp);
  const expBad = await upload(ad, '/expenses', { hostel_id: hA.id, category_id: 1, title: '', amount: '-5', expense_date: today, payment_method: 'cash' });
  check('expense validation', expBad.status === 422 && expBad.details.title && expBad.details.amount, expBad);
  check('expense void (not deleted)', (await call(ad, 'POST', `/expenses/${exp.data.id}/void`, { reason: 'Duplicate' })).status === 200);
  const exp2 = await upload(ad, '/expenses', { hostel_id: hA.id, category_id: 6, title: 'Guard salary', amount: '30000', expense_date: today, payment_method: 'cash' });
  check('second expense', exp2.status === 201);
  const fin = (await call(ad, 'GET', `/finance/summary?hostel_id=${hA.id}`)).data;
  check('finance summary: collected 32000, expenses 30000', fin.totals.collected === 32000 && fin.totals.expenses === 30000, fin.totals);

  console.log('\nCHUNK 9 - Check-out');
  const prev = (await call(ad, 'GET', `/admissions/${a1.id}/checkout-preview`)).data;
  check('checkout preview: deposit 10000 held, applied to 13000 dues', prev.depositHeld === 10000 && prev.depositApplied === 10000 && prev.remainingOutstanding === 3000, prev);
  const co = await call(ad, 'POST', `/admissions/${a1.id}/checkout`, { checkout_date: today, checkout_reason: 'Completed semester', adjust_deposit: true, process_refund: true });
  check('checkout completed', co.status === 200 && co.data.admission.status === 'checked_out', co);
  check('checkout twice rejected', (await call(ad, 'POST', `/admissions/${a1.id}/checkout`, { checkout_date: today, checkout_reason: 'again' })).status === 409);
  const room1c = (await call(ad, 'GET', `/rooms/${r1.id}`)).data;
  check('bed released after checkout', room1c.status === 'available' && room1c.available_beds === 2, room1c);
  const res1d = (await call(ad, 'GET', `/residents/${res1.id}`)).data;
  check('resident status checked_out', res1d.status === 'checked_out');
  const finalPay = await call(ad, 'POST', '/payments', { admission_id: a1.id, amount: 5000, payment_date: today, payment_method: 'cash' });
  check('dues collected after checkout, extra as advance', finalPay.data.advance === 2000, finalPay.data);
  const advRefund = await call(ad, 'POST', '/refunds', { admission_id: a1.id, refund_type: 'advance', amount: 2000, refund_date: today, payment_method: 'cash', reason: 'Overpaid' });
  check('advance refund', advRefund.status === 201, advRefund);
  check('refund above available rejected', (await call(ad, 'POST', '/refunds', { admission_id: a1.id, refund_type: 'advance', amount: 1, refund_date: today, payment_method: 'cash', reason: 'x' })).status === 400);
  const adm3 = await call(ad, 'POST', '/admissions', { resident_id: res3.id, bed_id: bed1, admission_date: today, check_in_now: false });
  check('pending admission (check-in later) on released bed', adm3.status === 201 && adm3.data.status === 'pending', adm3);
  check('cannot checkout pending admission', (await call(ad, 'POST', `/admissions/${adm3.data.id}/checkout`, { checkout_date: today, checkout_reason: 'x' })).status === 409);
  check('check-in', (await call(ad, 'POST', `/admissions/${adm3.data.id}/check-in`, { check_in_date: today })).data.status === 'active');

  console.log('\nCHUNK 10 - Attendance');
  const sheet = await call(ad, 'GET', `/attendance/sheet?hostel_id=${hA.id}&date=${today}`);
  check('attendance sheet lists current residents', sheet.data.length >= 2, sheet);
  const recs = sheet.data.map((r) => ({ resident_id: r.resident_id, status: 'present' }));
  check('attendance saved', (await call(ad, 'POST', '/attendance', { hostel_id: hA.id, attendance_date: today, records: recs })).status === 200);
  recs[0].status = 'late';
  recs[0].entry_time = '23:15';
  check('re-save updates (no duplicates)', (await call(ad, 'POST', '/attendance', { hostel_id: hA.id, attendance_date: today, records: recs })).status === 200);
  const hist = await call(ad, 'GET', `/attendance/history?hostel_id=${hA.id}&from=${today}&to=${today}&limit=200`);
  check('one record per resident per day', hist.meta.total === recs.length && hist.data.some((h) => h.status === 'late'), hist.meta);
  check('future attendance rejected', (await call(ad, 'POST', '/attendance', { hostel_id: hA.id, attendance_date: '2099-01-01', records: recs })).status === 400);
  const monthly = await call(ad, 'GET', `/attendance/monthly?hostel_id=${hA.id}&month=${thisMonth}`);
  check('monthly attendance report', monthly.data.length >= 2);

  console.log('\nCHUNK 11 - Visitors');
  const vis = await call(ad, 'POST', '/visitors', { resident_id: res2.id, visitor_name: 'Tariq Mehmood', cnic: '3520212345671', relationship: 'Father', visit_date: today, entry_time: '16:30' });
  check('visitor entry', vis.status === 201, vis);
  check('exit before entry rejected', (await call(ad, 'POST', `/visitors/${vis.data.id}/exit`, { exit_time: '15:00' })).status === 422);
  check('visitor exit', (await call(ad, 'POST', `/visitors/${vis.data.id}/exit`, { exit_time: '17:45' })).status === 200);
  check('exit twice rejected', (await call(ad, 'POST', `/visitors/${vis.data.id}/exit`, { exit_time: '18:00' })).status === 409);
  check('visitor for checked-out resident rejected', (await call(ad, 'POST', '/visitors', { resident_id: res1.id, visitor_name: 'X', visit_date: today, entry_time: '10:00' })).status === 409);

  console.log('\nCHUNK 12 - Complaints');
  const cmp = await call(ad, 'POST', '/complaints', { hostel_id: hA.id, resident_id: res2.id, category: 'water', subject: 'No water in washroom', priority: 'high' });
  check('complaint registered with room auto-filled', cmp.status === 201 && cmp.data.room_number === '102' && cmp.data.complaint_no.startsWith('CMP-'), cmp.data);
  check('resolving requires remarks', (await call(ad, 'PUT', `/complaints/${cmp.data.id}`, { status: 'resolved', priority: 'high' })).status === 422);
  await call(ad, 'PUT', `/complaints/${cmp.data.id}`, { status: 'in_progress', priority: 'high', assigned_to: 'Plumber Aslam' });
  const solved = await call(ad, 'PUT', `/complaints/${cmp.data.id}`, { status: 'resolved', priority: 'high', assigned_to: 'Plumber Aslam', resolution_remarks: 'Pipe replaced' });
  check('complaint resolved with full history', solved.data.status === 'resolved' && solved.data.updates.length === 3 && solved.data.resolution_date, solved.data);

  console.log('\nCHUNK 13 - Notifications');
  const nAdmin = await call(ad, 'GET', '/notifications');
  check('admin received admission/complaint notifications', nAdmin.data.some((n) => n.type === 'new_admission') && nAdmin.data.some((n) => n.type === 'complaint'), nAdmin.data.map((n) => n.type));
  const runRem = await call(sa, 'POST', '/notifications/run-reminders');
  check('reminder job runs', runRem.status === 200, runRem);
  check('mark all read', (await call(ad, 'PATCH', '/notifications/read-all')).status === 200 && (await call(ad, 'GET', '/notifications')).meta.unread === 0);

  console.log('\nCHUNK 3 - Dashboards');
  const dSa = (await call(sa, 'GET', '/dashboard')).data;
  check('super admin dashboard has global stats', dSa.stats.hostels >= 2 && dSa.stats.administrators >= 1 && dSa.charts.monthlyFinance.length === 6, dSa.stats);
  const dAd = (await call(ad, 'GET', '/dashboard')).data;
  check('admin dashboard scoped to own hostel', dAd.stats.hostels === 1 && dAd.stats.residents === 2 && dAd.charts.hostelOccupancy.length === 1, dAd.stats);

  console.log('\nCHUNK 14 - Reports');
  const reports = (await call(ad, 'GET', '/reports')).data;
  check('admin report list excludes super-admin reports', reports.length >= 10 && !reports.some((r) => r.key === 'admin-activity'));
  let allOk = true;
  for (const r of reports) {
    const out = await call(ad, 'GET', `/reports/${r.key}?hostel_id=${hA.id}`);
    if (out.status !== 200 || !Array.isArray(out.data.rows)) {
      allOk = false;
      console.log('    report failed', r.key, out.message);
    }
  }
  check('all admin reports run', allOk);
  check('admin blocked from super admin report', (await call(ad, 'GET', '/reports/admin-activity')).status === 403);
  for (const key of ['hostel-occupancy', 'hostel-revenue', 'hostel-expenses', 'admin-activity', 'financial-summary']) {
    const out = await call(sa, 'GET', `/reports/${key}`);
    check(`super admin report ${key}`, out.status === 200, out.message);
  }
  const xlsx = await call(ad, 'GET', `/reports/fee-collection?hostel_id=${hA.id}&format=xlsx`, null, { raw: true });
  const xbuf = Buffer.from(await xlsx.arrayBuffer());
  check('Excel export', xlsx.status === 200 && xbuf.slice(0, 2).toString() === 'PK');
  const pdf = await call(ad, 'GET', `/reports/room-occupancy?hostel_id=${hA.id}&format=pdf`, null, { raw: true });
  const pbuf = Buffer.from(await pdf.arrayBuffer());
  check('PDF export', pdf.status === 200 && pbuf.slice(0, 4).toString() === '%PDF');
  check('admin cannot report on other hostel', (await call(ad, 'GET', `/reports/residents?hostel_id=${hB.id}`)).status === 403);

  console.log('\nCHUNK 15 - Audit logs & settings');
  const logs = await call(sa, 'GET', `/audit-logs?search=${RUN}`);
  check('audit trail recorded', logs.status === 200 && logs.meta.total > 5);
  const logActions = (await call(sa, 'GET', '/audit-logs?limit=200')).data.map((l) => l.action);
  ['auth.login', 'admission.create', 'allocation.transfer', 'payment.create', 'refund.create', 'expense.create', 'admission.checkout'].forEach((a) =>
    check(`audit has ${a}`, logActions.includes(a))
  );
  check('admin cannot read audit logs', (await call(ad, 'GET', '/audit-logs')).status === 403);
  check('invalid setting rejected', (await call(sa, 'PUT', '/settings', { settings: { receipt_prefix: 'bad prefix!' } })).status === 422);
  check('setting saved', (await call(sa, 'PUT', '/settings', { settings: { late_fine_amount: 500 } })).status === 200);
  check('admin cannot change settings', (await call(ad, 'PUT', '/settings', { settings: { late_fine_amount: 1 } })).status === 403);

  console.log('\nSecurity');
  await call(sa, 'PATCH', `/users/${admin.data.id}/permissions`, {});
  await call(sa, 'PUT', `/users/${admin.data.id}/permissions`, { permission_codes: ['dashboard.view'] });
  check('revoked permission takes effect immediately', (await call(ad, 'GET', '/residents')).status === 403);
  await call(sa, 'PUT', `/users/${admin.data.id}/hostels`, { hostel_ids: [] });
  check('unassigned admin loses hostel access', (await call(ad, 'GET', `/hostels/${hA.id}`)).status === 403);
  await call(sa, 'PATCH', `/users/${admin.data.id}/status`, { status: 'inactive' });
  check('deactivated admin token rejected', (await call(ad, 'GET', '/auth/me')).status === 401);
  await call(sa, 'PATCH', `/users/${admin.data.id}/status`, { status: 'active' });
  await call(sa, 'POST', `/users/${admin.data.id}/reset-password`, { new_password: 'NewPass123' });
  check('old token invalid after password reset', (await call(ad, 'GET', '/auth/me')).status === 401);
  ad = (await call(null, 'POST', '/auth/login', { identifier: `admin${RUN.toLowerCase()}@test.pk`, password: 'NewPass123' })).data?.token;
  check('login with reset password', Boolean(ad));
  check('SQL injection attempt is harmless', (await call(sa, 'GET', `/residents?search=${encodeURIComponent("' OR 1=1 -- ")}`)).data.length === 0);

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
