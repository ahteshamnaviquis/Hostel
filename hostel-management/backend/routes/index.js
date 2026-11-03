/**
 * API route registry. Every module mounts its router here under /api.
 */
const express = require('express');
const { authenticate, superAdminOnly } = require('../middleware/auth');
const userController = require('../controllers/userController');
const { buildingRouter, floorRouter, roomRouter } = require('./propertyRoutes');
const { admissionRouter, allocationRouter, transferRouter } = require('./admissionRoutes');
const { feeTypeRouter, feeRouter, invoiceRouter, paymentRouter, refundRouter } = require('./feeRoutes');
const { expenseCategoryRouter, expenseRouter, financeRouter, attendanceRouter, visitorRouter, complaintRouter } = require('./operationsRoutes');
const { settingsRouter, auditRouter } = require('./systemRoutes');

const router = express.Router();

router.use('/health', require('./healthRoutes'));
router.use('/auth', require('./authRoutes'));                              // CHUNK 2
router.use('/users', require('./userRoutes'));                             // CHUNK 2 / 14
router.get('/permissions', authenticate, superAdminOnly, userController.listPermissions);
router.use('/dashboard', require('./dashboardRoutes'));                    // CHUNK 3
router.use('/hostels', require('./hostelRoutes'));                         // CHUNK 3
router.use('/buildings', buildingRouter);                                  // CHUNK 4
router.use('/floors', floorRouter);
router.use('/rooms', roomRouter);
router.use('/residents', require('./residentRoutes'));                     // CHUNK 5
router.use('/admissions', admissionRouter);                                // CHUNK 6 / 9
router.use('/allocations', allocationRouter);
router.use('/transfers', transferRouter);
router.use('/fee-types', feeTypeRouter);                                   // CHUNK 7
router.use('/fees', feeRouter);
router.use('/invoices', invoiceRouter);
router.use('/payments', paymentRouter);
router.use('/refunds', refundRouter);
router.use('/expense-categories', expenseCategoryRouter);                  // CHUNK 8
router.use('/expenses', expenseRouter);
router.use('/finance', financeRouter);
router.use('/attendance', attendanceRouter);                               // CHUNK 10
router.use('/visitors', visitorRouter);                                    // CHUNK 11
router.use('/complaints', complaintRouter);                                // CHUNK 12
router.use('/notifications', require('./notificationRoutes'));             // CHUNK 13
router.use('/reports', require('./reportRoutes'));                         // CHUNK 14
router.use('/settings', settingsRouter);                                   // CHUNK 15
router.use('/audit-logs', auditRouter);

module.exports = router;
