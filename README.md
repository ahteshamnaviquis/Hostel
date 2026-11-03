# Hostel Management System – Pakistan

A web-based hostel management platform for hostels in Pakistan: multiple hostels and administrators, buildings/floors/rooms/beds, residents, admissions & bed allocation, fees in PKR with receipts, expenses, check-in/out, attendance, visitors, complaints, notifications, reports (PDF/Excel) and audit logs.

```
hostel-management/
├── backend/    Node.js + Express REST API (MySQL, JWT, bcrypt)
├── frontend/   React (Vite) + Tailwind CSS + React Router + Axios + Recharts
└── PROJECT_PROGRESS.md   ← features, API list, decisions, testing
```

## Requirements
- Node.js 18+ (tested with Node 22)
- MySQL 8.0+ (or MariaDB 10.6+)

## 1. Backend

```bash
cd hostel-management/backend
npm install
cp .env.example .env        # edit DB_USER, DB_PASSWORD and set a long random JWT_SECRET
npm run db:init             # creates database, tables, seed data and the first Super Admin
npm run dev                 # http://localhost:5000  (or: npm start)
```

Check: http://localhost:5000/api/health → `"database": { "status": "connected" }`.

First login: **superadmin@hostel.pk / Admin@12345** (from `.env`) – change the password from *My Profile*.

Cannot log in as Super Admin ("Invalid email/username or password")? Run `npm run admin:reset` in `backend` – it creates the Super Admin, or resets its password, from `SUPER_ADMIN_EMAIL` / `SUPER_ADMIN_PASSWORD` in `.env`.

Optional (with the server running):
```bash
npm run db:seed-demo        # demo hostels, residents, payments... (not for production)
npm run test:api            # end-to-end API test (121 checks)
```

## 2. Frontend

```bash
cd hostel-management/frontend
npm install
npm run dev                 # http://localhost:5173
```

The dev server proxies `/api` to `http://localhost:5000`. For production: copy `.env.example` to `.env`, set `VITE_API_BASE_URL`, run `npm run build` and serve `dist/` (with SPA fallback to `index.html`).

## Roles
- **Super Admin** – all hostels: hostels, administrators & permissions, every module, reports, audit logs, settings.
- **Hostel Admin** – only assigned hostels, only the modules the Super Admin enabled.
