const express = require('express');
const ctrl = require('../controllers/notificationController');
const { authenticate, superAdminOnly } = require('../middleware/auth');
const { validate, validateId } = require('../utils/validator');

const router = express.Router();
router.use(authenticate);
router.get('/', validate({ unread: { type: 'bool' }, page: { type: 'int', min: 1, default: 1 }, limit: { type: 'int', min: 1, max: 100, default: 20 } }, 'query'), ctrl.list);
router.patch('/read-all', ctrl.markAllRead);
router.patch('/:id/read', validateId(), ctrl.markRead);
router.post('/run-reminders', superAdminOnly, ctrl.run);

module.exports = router;
