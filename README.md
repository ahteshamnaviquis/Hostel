# Hostel Management System – Pakistan

A web-based hostel management platform for hostels in Pakistan: multiple hostels and administrators, rooms and beds, residents, admissions, fees (PKR), expenses, attendance, visitors, complaints and reports.

```
hostel-management/
├── backend/    Node.js + Express REST API (MySQL)
├── frontend/   React (Vite) + Tailwind CSS
└── PROJECT_PROGRESS.md
```

See [`hostel-management/PROJECT_PROGRESS.md`](hostel-management/PROJECT_PROGRESS.md) for completed chunks and design decisions.

## Requirements
- Node.js 18+ (tested with Node 22)
- MySQL 8.0+ (or MariaDB 10.6+)

## 1. Backend

```bash
cd hostel-management/backend
npm install
cp .env.example .env        # then edit DB_USER / DB_PASSWORD
npm run db:init             # creates database, tables and seed data
npm run dev                 # http://localhost:5000  (or: npm start)
```

Check: open http://localhost:5000/api/health — `"database": { "status": "connected" }`.

## 2. Frontend

```bash
cd hostel-management/frontend
npm install
npm run dev                 # http://localhost:5173
```

The dev server proxies `/api` to `http://localhost:5000`. For production, copy `.env.example` to `.env`, set `VITE_API_BASE_URL`, and run `npm run build`.
