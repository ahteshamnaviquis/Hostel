const jwt = require('jsonwebtoken');
const env = require('../config/env');
const { query } = require('../config/db');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/response');
const { hashPassword, verifyPassword } = require('../utils/password');
const userModel = require('../models/userModel');
const { logAudit } = require('../services/auditService');
const settingsService = require('../services/settingsService');

const signToken = (user) => jwt.sign({ sub: user.id, role: user.role }, env.jwt.secret, { expiresIn: env.jwt.expiresIn });

/** Shape returned to the frontend for the logged-in user. */
async function buildSession(userId) {
  const ctx = await userModel.loadAuthContext(userId);
  const settings = await settingsService.getSettings();
  return {
    id: ctx.user.id,
    fullName: ctx.user.full_name,
    email: ctx.user.email,
    username: ctx.user.username,
    phone: ctx.user.phone,
    role: ctx.user.role,
    roleLabel: ctx.user.role_label,
    lastLoginAt: ctx.user.last_login_at,
    permissions: ctx.permissions,
    hostels: ctx.hostels,
    settings: {
      appName: settings.app_name,
      currency: settings.currency,
      currencySymbol: settings.currency_symbol,
      dateFormat: settings.date_format,
    },
  };
}

// POST /api/auth/login
const login = asyncHandler(async (req, res) => {
  const { identifier, password } = req.body;
  const user = await userModel.findForLogin(identifier);
  const valid = user ? await verifyPassword(password, user.password_hash) : false;

  if (!valid) {
    if (user) {
      await logAudit(null, req, { action: 'auth.login_failed', entityType: 'user', entityId: user.id, description: 'Invalid password' });
    }
    throw ApiError.unauthorized('Invalid email/username or password');
  }
  if (user.status !== 'active') throw ApiError.forbidden('Your account is not active. Please contact the Super Admin.');

  await query('UPDATE users SET last_login_at = NOW() WHERE id = ?', [user.id]);
  req.user = { id: user.id };
  await logAudit(null, req, { action: 'auth.login', entityType: 'user', entityId: user.id, description: `${user.full_name} logged in` });

  sendSuccess(res, { message: 'Login successful', data: { token: signToken(user), user: await buildSession(user.id) } });
});

// GET /api/auth/me
const me = asyncHandler(async (req, res) => {
  sendSuccess(res, { data: await buildSession(req.user.id) });
});

// POST /api/auth/logout  (JWT is stateless - the client discards the token; we just audit)
const logout = asyncHandler(async (req, res) => {
  await logAudit(null, req, { action: 'auth.logout', entityType: 'user', entityId: req.user.id, description: `${req.user.fullName} logged out` });
  sendSuccess(res, { message: 'Logged out' });
});

// PUT /api/auth/profile
const updateProfile = asyncHandler(async (req, res) => {
  const { full_name, phone } = req.body;
  await query('UPDATE users SET full_name = ?, phone = ? WHERE id = ?', [full_name, phone, req.user.id]);
  await logAudit(null, req, { action: 'profile.update', entityType: 'user', entityId: req.user.id, description: 'Updated own profile' });
  sendSuccess(res, { message: 'Profile updated', data: await buildSession(req.user.id) });
});

// PUT /api/auth/change-password
const changePassword = asyncHandler(async (req, res) => {
  const { current_password, new_password } = req.body;
  const user = await userModel.findForLogin(req.user.email);
  if (!(await verifyPassword(current_password, user.password_hash))) {
    throw new ApiError(422, 'Current password is incorrect', { current_password: 'Current password is incorrect' });
  }
  if (current_password === new_password) {
    throw new ApiError(422, 'New password must be different', { new_password: 'New password must be different from the current one' });
  }
  await query('UPDATE users SET password_hash = ?, password_changed_at = NOW() WHERE id = ?', [await hashPassword(new_password), user.id]);
  await logAudit(null, req, { action: 'auth.password_change', entityType: 'user', entityId: user.id, description: 'Changed own password' });
  // Issue a fresh token (older tokens are now invalid). Wait 1s so iat >= password_changed_at.
  await new Promise((r) => setTimeout(r, 1000));
  sendSuccess(res, { message: 'Password changed successfully', data: { token: signToken(user) } });
});

module.exports = { login, me, logout, updateProfile, changePassword };
