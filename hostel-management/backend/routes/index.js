/**
 * API route registry. Every module mounts its router here under /api.
 */
const express = require('express');
const healthRoutes = require('./healthRoutes');

const router = express.Router();

router.use('/health', healthRoutes);

// Future chunks will mount: /auth, /users, /hostels, /buildings, /floors, /rooms,
// /residents, /admissions, /fees, /payments, /expenses, /attendance, /visitors,
// /complaints, /notifications, /reports, /settings, /audit-logs

module.exports = router;
