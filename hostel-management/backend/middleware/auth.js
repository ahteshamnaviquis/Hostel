/**
 * Authentication (JWT) and authorization (role / permission) middleware.
 */
const jwt = require('jsonwebtoken');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');
const userModel = require('../models/userModel');

/**
 * Verifies the Bearer token and loads the CURRENT user state from the database,
 * so deactivation, permission and hostel changes take effect immediately.
 */
async function authenticate(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) throw ApiError.unauthorized();

    let payload;
    try {
      payload = jwt.verify(token, env.jwt.secret);
    } catch {
      throw ApiError.unauthorized('Your session has expired. Please sign in again.');
    }

    const ctx = await userModel.loadAuthContext(payload.sub);
    if (!ctx || ctx.user.status !== 'active') {
      throw ApiError.unauthorized('Your account is not active. Please contact the Super Admin.');
    }
    // Tokens issued before the last password change / reset are rejected
    if (ctx.user.password_changed_at) {
      const changedAt = Math.floor(new Date(ctx.user.password_changed_at.replace(' ', 'T') + '+05:00').getTime() / 1000);
      if (payload.iat < changedAt) throw ApiError.unauthorized('Your password was changed. Please sign in again.');
    }

    req.user = {
      id: ctx.user.id,
      fullName: ctx.user.full_name,
      email: ctx.user.email,
      role: ctx.user.role,
      permissions: ctx.permissions,
      hostelIds: ctx.user.role === 'super_admin' ? null : ctx.hostels.map((h) => h.id),
    };
    return next();
  } catch (error) {
    return next(error);
  }
}

/** Allows only the given roles. */
const requireRole =
  (...roles) =>
  (req, res, next) => {
    if (!req.user) return next(ApiError.unauthorized());
    if (!roles.includes(req.user.role)) return next(ApiError.forbidden());
    return next();
  };

/** Requires at least one of the given permission codes (Super Admin always passes). */
const requirePermission =
  (...codes) =>
  (req, res, next) => {
    if (!req.user) return next(ApiError.unauthorized());
    if (req.user.role === 'super_admin') return next();
    if (codes.some((code) => req.user.permissions.includes(code))) return next();
    return next(ApiError.forbidden('You do not have permission to perform this action'));
  };

const superAdminOnly = requireRole('super_admin');

module.exports = { authenticate, requireRole, requirePermission, superAdminOnly };
