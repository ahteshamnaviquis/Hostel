const express = require('express');
const ctrl = require('../controllers/systemController');
const { authenticate, superAdminOnly } = require('../middleware/auth');
const { validate, listQuery } = require('../utils/validator');

const settingsRouter = express.Router();
settingsRouter.use(authenticate);
settingsRouter.get('/', ctrl.getSettings);
settingsRouter.put('/', superAdminOnly, (req, res, next) => {
  if (!req.body || typeof req.body.settings !== 'object' || Array.isArray(req.body.settings)) {
    return res.status(422).json({ success: false, message: 'settings object is required' });
  }
  return next();
}, ctrl.updateSettings);

const auditRouter = express.Router();
auditRouter.use(authenticate, superAdminOnly);
auditRouter.get(
  '/',
  validate(listQuery({ user_id: { type: 'id' }, action: { type: 'string', max: 60 }, from: { type: 'date' }, to: { type: 'date' }, limit: { type: 'int', min: 1, max: 200, default: 25 } }), 'query'),
  ctrl.listAuditLogs
);

module.exports = { settingsRouter, auditRouter };
