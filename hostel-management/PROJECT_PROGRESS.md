# Hostel Management System (Pakistan) – Project Progress

_Last updated: 2026-11-03_

## Chunk status

| # | Chunk | Status |
|---|-------|--------|
| 1 | Project Setup and Foundation | ✅ Completed |
| 2 | Authentication and User Roles | ⏳ Pending (awaiting approval) |
| 3 | Super Admin Dashboard and Hostel Management | ⏳ Pending |
| 4 | Building, Floor and Room Management | ⏳ Pending |
| 5 | Resident Management | ⏳ Pending |
| 6 | Admissions and Room Allocation | ⏳ Pending |
| 7 | Fees and Payments | ⏳ Pending |
| 8 | Expenses and Financial Dashboard | ⏳ Pending |
| 9 | Check-in and Check-out | ⏳ Pending |
| 10 | Attendance Management | ⏳ Pending |
| 11 | Visitor Management | ⏳ Pending |
| 12 | Complaints and Maintenance | ⏳ Pending |
| 13 | Notifications | ⏳ Pending |
| 14 | Reports and Exports | ⏳ Pending |
| 15 | Audit Logs and Final Settings | ⏳ Pending |

---

## CHUNK 1 – Project Setup and Foundation ✅

### Delivered
- **Backend** (Node.js + Express): env config, MySQL pool (`mysql2/promise`, parameterised queries, `withTransaction()` helper), helmet, CORS allow-list, JSON body limits, request logging (dev), consistent JSON error responses, 404 handler, graceful shutdown.
- **API health check**: `GET /api/health` reports API + MySQL status (200 when healthy, 503 when the DB is unreachable — the API itself keeps running).
- **Database initialisation**: `npm run db:init` creates the database, applies versioned migrations (tracked in `schema_migrations`) and runs idempotent seeds.
- **Full database schema** (migration `001_initial_schema.sql`) – 31 tables + `schema_migrations`.
- **Frontend** (React 18 + Vite + Tailwind CSS v4 + React Router + Axios + Recharts + lucide icons): responsive sidebar (off-canvas on mobile) and top bar (page title, notifications dropdown, user menu, logout confirmation), login page UI with validation, Super Admin dashboard layout with **sample data** (clearly labelled), placeholder pages for every module that name the chunk that will deliver it, 404 page, live API/DB status indicator on the login page.
- **Reusable components**: Button, FormField, Card, StatCard, PageHeader (breadcrumbs), Badge, Alert, Spinner/PageLoader, EmptyState, DataTable, Modal, ConfirmDialog, ApiStatus, dashboard charts.

### API endpoints
| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | API info |
| GET | `/api/health` | API + database health report |

### Database (migration 001)
Access control: `roles`, `permissions`, `role_permissions`, `users`, `user_permissions`, `user_hostels`
Property: `hostels`, `buildings`, `floors`, `rooms`, `room_beds`
Residents: `residents`, `resident_documents`
Stay: `admissions`, `room_allocations`, `room_transfers`
Finance: `fee_types`, `resident_fee_structures`, `invoices`, `invoice_items`, `payments`, `payment_allocations`, `refunds`, `expense_categories`, `expenses`
Operations: `attendance`, `visitors`, `complaints`
System: `notifications`, `audit_logs`, `system_settings`

Seed data: 2 roles, 11 permissions, default Hostel Admin permissions, 11 fee types, 11 expense categories, 16 global settings (PKR, DD/MM/YYYY, Asia/Karachi, receipt/invoice prefixes, fee due day, notification toggles).

### Tested
- `db:init` on MariaDB 10.11 (MySQL-compatible): fresh run and re-run (idempotent).
- DB-level business rules verified with real inserts (rolled back): double bed allocation rejected, one active bed per resident, one open admission per resident, duplicate attendance (resident + date) rejected, duplicate monthly invoice rejected (allowed again after cancellation), overpaid invoice rejected, zero-bed room rejected.
- API: health 200 (DB up) / 503 (wrong DB password), 404 route, malformed JSON → 400, CORS header for the frontend origin.
- Frontend: production build passes; browser test of login validation, login → dashboard, sidebar navigation, placeholder pages, 404, logout confirmation, mobile layout (no horizontal overflow) and mobile menu; no console errors or warnings.

---

## Important development decisions

1. **Vite instead of Create React App** – CRA is deprecated; Vite is the current standard React toolchain. `src/App.jsx` structure is unchanged.
2. **Tailwind CSS v4** chosen over Bootstrap for a cleaner custom SaaS look. Brand colour (deep teal) is defined as tokens in `src/index.css`.
3. **Dev proxy**: the frontend calls `/api`; Vite proxies to `http://localhost:5000`. In production set `VITE_API_BASE_URL`.
4. **`.env` is not committed** – `backend/.env.example` is the template (`cp .env.example .env`). Credentials stay in the backend only.
5. **Business rules enforced in the database as well as in code**, using STORED generated columns + UNIQUE indexes:
   - `room_allocations.active_bed_id` → a bed cannot have two active residents.
   - `room_allocations.active_resident_id` → a resident cannot hold two active beds.
   - `admissions.open_resident_id` → one pending/active admission per resident.
   - `invoices.monthly_admission_id + billing_month` → no duplicate monthly invoice.
   - `attendance (resident_id, attendance_date)` unique → no duplicate attendance.
   - CHECK constraints: room beds > 0, non-negative money, `paid_amount <= total_amount`.
6. **Occupied/available beds are derived from `room_beds`**, not stored twice on `rooms`, so counts can never drift.
7. **Financial records are never deleted** – invoices are `cancelled`, payments/refunds `reversed`, expenses `void` (with who/when/why). Master records use `deleted_at` soft deletes.
8. **Check-in/check-out stored on `admissions`** (one admission = one stay) rather than a separate table – keeps the model simple and history-preserving.
9. **`user_permissions`** table added (not in the original list) so the Super Admin can configure permissions per administrator; `role_permissions` holds role defaults.
10. **Room types** are an ENUM (`single`, `double`, `triple`, `four_seater`, `dormitory`, `custom`) with capacity set per room – no extra table needed.
11. **`hostel_id` on every operational table** to make hostel-level data isolation simple and fast to enforce in queries.
12. **Money** is `DECIMAL(12,2)` in PKR; MySQL session timezone `+05:00` (PKT); dates returned as strings to avoid timezone shifts.
13. **Province** stored as text and validated against Pakistan's provinces/territories in the API (list in `frontend/src/utils/constants.js`).

## Known limitations after CHUNK 1
- No authentication yet – the login form only validates input and opens the dashboard preview (CHUNK 2).
- Dashboard numbers are **sample data** (`frontend/src/utils/sampleData.js`) – replaced with live data in CHUNK 3.
- No Super Admin account is seeded yet (needs bcrypt, CHUNK 2).
- Module pages other than Dashboard are placeholders.
- MySQL DDL auto-commits, so a migration that fails partway may need manual cleanup before re-running.
