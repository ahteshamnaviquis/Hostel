# Hostel Management System (Pakistan) – Project Progress

_Last updated: 2026-11-03_

## Chunk status

| # | Chunk | Status |
|---|-------|--------|
| 1 | Project Setup and Foundation | ✅ Completed |
| 2 | Authentication and User Roles | ✅ Completed |
| 3 | Super Admin Dashboard and Hostel Management | ✅ Completed |
| 4 | Building, Floor and Room Management | ✅ Completed |
| 5 | Resident Management | ✅ Completed |
| 6 | Admissions and Room Allocation | ✅ Completed |
| 7 | Fees and Payments | ✅ Completed |
| 8 | Expenses and Financial Dashboard | ✅ Completed |
| 9 | Check-in and Check-out | ✅ Completed |
| 10 | Attendance Management | ✅ Completed |
| 11 | Visitor Management | ✅ Completed |
| 12 | Complaints and Maintenance | ✅ Completed |
| 13 | Notifications | ✅ Completed |
| 14 | Reports and Exports | ✅ Completed |
| 15 | Audit Logs and Final Settings | ✅ Completed |

CHUNKS 2–15 were built together at the owner's request ("continue with all chunks at once").

---

## How to run

```bash
# Backend
cd hostel-management/backend
npm install
cp .env.example .env          # set DB_USER / DB_PASSWORD / JWT_SECRET
npm run db:init               # database, tables, seed data, Super Admin
npm run dev                   # http://localhost:5000

# Frontend (second terminal)
cd hostel-management/frontend
npm install
npm run dev                   # http://localhost:5173
```

Default Super Admin (created by `db:init` from `.env`): **superadmin@hostel.pk / Admin@12345** – change it after first login.

Optional:
- `npm run db:seed-demo` (backend, server running) – demo hostels, rooms, residents, payments, expenses, attendance, visitors, complaints. Demo admins: `admin@demo.pk`, `rabia@demo.pk` (password `Admin@12345`). **Never run on production.**
- `npm run test:api` (backend, server running) – 121 end-to-end checks of business rules, isolation and security.

---

## What each chunk delivers

### CHUNK 1 – Foundation
Express API skeleton, MySQL pool, env config, health check, `db:init` migration runner, full schema, React/Vite/Tailwind shell, reusable UI components.

### CHUNK 2 – Authentication & roles
- JWT login (email or username), bcrypt (12 rounds), login rate limit (10 failed / 15 min / IP).
- Every request re-loads the user: deactivation, permission and hostel changes take effect immediately.
- Tokens issued before a password change / reset are rejected.
- Super Admin creates administrators, assigns hostels, configures per-admin permissions, resets passwords, activates/deactivates.
- Frontend: AuthContext, protected routes, permission-aware sidebar, 401 → automatic sign-out, profile + change password.

### CHUNK 3 – Dashboards & hostels
- Live dashboards from the database (no sample data): hostels, admins, buildings, rooms, capacity, occupied/available beds, occupancy %, residents, new admissions, leaving soon, fees collected, pending fees, expenses, revenue, open complaints.
- Charts: hostel-wise occupancy, monthly collection vs expenses, occupied vs available, hostel-wise revenue (Super Admin) / room status and paid vs pending (Hostel Admin).
- Recent admissions, payments, transfers, complaints, check-ins/outs, activities, quick actions.
- Hostel CRUD, details page with statistics, activate/deactivate, assign administrators.
- Top-bar hostel switcher filters every page.

### CHUNK 4 – Buildings, floors, rooms, beds
- Hierarchy Hostel → Building → Floor → Room → Beds. Beds (B1, B2 …) are created automatically from "total beds".
- Capacity can never be reduced below occupied beds; occupied rooms cannot be deactivated or deleted.
- Room status (available / partially / fully occupied) is recalculated automatically; maintenance & inactive are manual. Individual beds can be put under maintenance.
- Room types: single, double, triple, four-seater, dormitory, custom. Rent and deposit per room.

### CHUNK 5 – Residents
- Full registration form (personal, education/employment, guardian), CNIC auto-format & validation, gender checked against hostel type (boys/girls/mixed).
- Search (name, CNIC, mobile, reg. no, student ID), filters, pagination, profile with tabs, edit, suspend / re-activate / cancel.
- Private documents (CNIC/B-Form, student card, photo, other) and profile picture – stored outside the web root, downloaded only through authenticated, hostel-checked endpoints.

### CHUNK 6 – Admissions & allocation
- New admission: choose resident → visual picker of free beds → rent/deposit/admission fee/discount/extra monthly charges.
- One transaction: admission, allocation, bed + room status, fee structure, initial invoices, audit log, notification.
- Transfers keep the old allocation (status `transferred`), release the old bed, record date + reason, optionally change rent.
- Cancel an admission made by mistake (only before any payment).

### CHUNK 7 – Fees & payments
- Fee types (rent, deposit, admission, mess, electricity, gas, laundry, internet, other, late fine, discount).
- Per-admission fee structure with effective dates; monthly generation (never duplicates); manual invoices; late fines.
- Payments: partial payments, FIFO allocation to oldest dues (or chosen invoices), surplus kept as advance credit and applied automatically to new invoices.
- Printable receipts (hostel, receipt no, resident, room, date, fee details, amount, remaining balance, method, received by).
- Payment reversal (kept for audit), invoice cancellation (only unpaid), refunds (advance / deposit / other) with limits.

### CHUNK 8 – Expenses & finance
- Expenses with categories, receipt attachment, edit, void with reason (never deleted). Filters and category totals.
- Financial summary: billed, collected, expenses, refunds, net income, outstanding; 12-month trend; by category, by payment method, by hostel.

### CHUNK 9 – Check-in / check-out
- Pending admissions (bed reserved) → check-in. Leaving-soon list, current residents, check-out history.
- Checkout preview → confirm: deposit adjusted against dues (recorded as a non-cash `deposit_adjustment` payment), refunds recorded, bed released only on confirmation, fee lines stopped, resident marked checked out. A resident cannot be checked out twice. Dues remaining after checkout can still be collected.

### CHUNK 10 – Attendance
- Daily sheet of residents staying on that date; P / A / Leave / Late (+ entry time), remarks, "mark all present". Re-saving updates (unique resident + date).
- Monthly report with attendance %, history with filters.

### CHUNK 11 – Visitors
- Entry (resident, visitor, CNIC, contact, relationship, date, time, purpose), exit, edit, "currently inside", search and date filters.

### CHUNK 12 – Complaints
- Register (auto room from resident), categories, priority, assignment, status workflow open → in progress → resolved / rejected (resolution remarks required), complete history timeline.

### CHUNK 13 – Notifications
- In-app notifications to Super Admins + the hostel's admins: new admission, new complaint, fees due in 3 days, overdue payments, upcoming checkouts, complaints open > 2 days, maintenance reminders, monthly fees not generated.
- Reminder job runs hourly (`REMINDER_INTERVAL_MINUTES`) and on demand; de-duplicated per period; toggles in Settings. Bell with unread count (polls every minute) and notifications page.

### CHUNK 14 – Reports
- 16 reports: resident list, room occupancy, available beds, admissions, checkouts, fee collection, outstanding fees, expenses, attendance, visitors, complaints, monthly financial summary; Super Admin: hostel-wise occupancy, hostel-wise revenue & expenses, hostel-wise expenses by category, administrator activity.
- Date range, hostel, status, category and payment-method filters; on-screen preview, print, **PDF** (pdfkit) and **Excel** (exceljs) export.

### CHUNK 15 – Audit logs, settings, security review
- Audit log of logins (incl. failed), admissions, allocations, transfers, payments, reversals, refunds, expenses, checkouts, settings and other changes – with user, hostel, IP, before/after values. Filterable viewer.
- Settings: app name, currency, date format, receipt/invoice prefixes, receipt footer, fee due day, generation day, late fine, notification toggles (validated).

---

## API endpoints (all under `/api`, JSON, Bearer token except login/health)

| Area | Endpoints |
|------|-----------|
| Health | `GET /health` |
| Auth | `POST /auth/login`, `GET /auth/me`, `POST /auth/logout`, `PUT /auth/profile`, `PUT /auth/change-password` |
| Users (SA) | `GET/POST /users`, `GET/PUT /users/:id`, `PATCH /users/:id/status`, `PUT /users/:id/hostels`, `PUT /users/:id/permissions`, `POST /users/:id/reset-password`, `GET /permissions` |
| Dashboard | `GET /dashboard?hostel_id=` |
| Hostels | `GET /hostels`, `GET /hostels/options`, `GET /hostels/:id`; SA: `POST /hostels`, `PUT /hostels/:id`, `PATCH /hostels/:id/status`, `PUT /hostels/:id/admins` |
| Property | `GET/POST /buildings`, `PUT/DELETE /buildings/:id`; `GET/POST /floors`, `PUT/DELETE /floors/:id`; `GET/POST /rooms`, `GET /rooms/available`, `GET/PUT/DELETE /rooms/:id`, `PATCH /rooms/:id/status`, `PATCH /rooms/:id/beds/:bedId` |
| Residents | `GET/POST /residents`, `GET/PUT /residents/:id`, `PATCH /residents/:id/status`, `GET/POST /residents/:id/photo`, `POST /residents/:id/documents`, `GET /residents/:id/documents/:docId/download`, `DELETE /residents/:id/documents/:docId` |
| Admissions | `GET/POST /admissions`, `GET /admissions/:id`, `POST /admissions/:id/check-in`, `POST /admissions/:id/transfer`, `POST /admissions/:id/cancel`, `GET /admissions/:id/checkout-preview`, `POST /admissions/:id/checkout`, `POST/DELETE /admissions/:id/fee-structures[/:structureId]`, `GET /allocations`, `GET /transfers` |
| Fees | `GET /fee-types`, `GET /fees/accounts`, `GET/POST /invoices`, `GET /invoices/:id`, `POST /invoices/:id/cancel`, `POST /invoices/generate-monthly`, `POST /invoices/apply-late-fines`, `GET/POST /payments`, `GET /payments/:id/receipt`, `POST /payments/:id/reverse`, `GET/POST /refunds` |
| Expenses | `GET /expense-categories`, `GET/POST /expenses`, `PUT /expenses/:id`, `POST /expenses/:id/void`, `GET /expenses/:id/receipt`, `GET /finance/summary` |
| Attendance | `GET /attendance/sheet`, `POST /attendance`, `GET /attendance/history`, `GET /attendance/monthly` |
| Visitors | `GET/POST /visitors`, `PUT /visitors/:id`, `POST /visitors/:id/exit` |
| Complaints | `GET/POST /complaints`, `GET/PUT /complaints/:id` |
| Notifications | `GET /notifications`, `PATCH /notifications/:id/read`, `PATCH /notifications/read-all`, `POST /notifications/run-reminders` (SA) |
| Reports | `GET /reports`, `GET /reports/:key?format=json|pdf|xlsx&hostel_id=&from=&to=&status=&category_id=&payment_method=` |
| System (SA) | `GET/PUT /settings`, `GET /audit-logs` |

## Database changes

- **001_initial_schema** – 31 tables (see CHUNK 1).
- **002_complaint_updates_and_adjustments** – `complaint_updates` (status history) and `deposit_adjustment` payment method.
- `db:init` also creates the first Super Admin if none exists.

## Testing performed
- Database: tested on **MySQL 8.0.46** and **MariaDB 10.11** (fresh `db:init`, re-run, full API test and demo seed on both).
- `npm run test:api`: **121/121 passed** – auth, isolation (admin cannot read/write other hostels), permissions revoked live, double bed allocation, capacity, duplicate monthly invoices, partial/advance payments, reversals, transfers with history, checkout twice, deposit settlement, attendance duplicates, visitor exit rules, complaint workflow, notifications, every report + PDF/Excel export, audit trail, settings validation, file-upload restrictions, SQL-injection attempt. No 5xx errors in server log.
- Browser (Playwright): every page as Super Admin and Hostel Admin – no console errors, page errors or failed API calls; access-denied pages for unauthorised routes; mobile layout without horizontal scroll; interactive flows (new admission with bed picker, collect payment → receipt, attendance save, checkout settlement, Excel download, logout).

## Important development decisions (in addition to CHUNK 1 decisions)
1. **Business rules enforced in the database** (unique indexes on generated columns, CHECK constraints) *and* in services with row locks (`SELECT … FOR UPDATE`) inside transactions; beds are locked in id order to avoid deadlocks.
2. **Hostel isolation**: `hostelScope()` / `findScoped()` helpers are used for every query on hostel data; Super Admin = global.
3. **Per-admin permissions** are copied from the role defaults when an admin is created and then edited individually (`user_permissions`).
4. **Payment allocation** is FIFO by due date; surplus becomes advance credit (`payments.unallocated_amount`) which is automatically applied to future invoices. Invoice `paid_amount` is maintained from allocations.
5. **Security deposit** is tracked as an invoice item; "held" = collected − refunded − adjusted. Adjustment at checkout is a non-cash payment (`deposit_adjustment`, receipt prefix `ADJ`) excluded from revenue figures.
6. **Revenue** = posted cash/bank/wallet payments (excluding deposit adjustments); net income = revenue − refunds − expenses.
7. **Uploads** are not served statically; only JPG/PNG/WEBP/PDF (extension + MIME), random names, size limit.
8. **Reports** are defined once on the backend and rendered to JSON, PDF and Excel – exports always match the on-screen data and permissions.
9. **Notifications** use a dedupe key so automatic reminders are not repeated; email/SMS/WhatsApp can be added later as additional channels.
10. **Validation**: a small schema validator whitelists fields (no mass assignment), converts types and returns field-level errors shown under form inputs.

## Known limitations / possible next steps
- No email/SMS/WhatsApp delivery yet (in-app only, as required for the initial version).
- Monthly rent is not prorated for mid-month admissions/transfers (full month charged; adjust via discount or manual invoice).
- Settings are global; per-hostel overrides are supported by the schema (`system_settings.hostel_id`) but not exposed in the UI.
- Fee type list is fixed (seeded); custom fee types would need a small admin screen.
- JWT is stored in browser storage; for higher security deploy behind HTTPS and consider httpOnly cookies.
- Set `TRUST_PROXY=1` when running behind nginx so rate limiting and audit IPs see real client IPs.
