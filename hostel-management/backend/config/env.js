/**
 * Centralised environment configuration.
 * All process.env access should go through this module so that
 * defaults and type conversion live in one place.
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const toInt = (value, fallback) => {
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
};

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',
  port: toInt(process.env.PORT, 5000),
  appName: process.env.APP_NAME || 'Hostel Management System',
  corsOrigins: (process.env.CORS_ORIGIN || 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),

  db: {
    host: process.env.DB_HOST || 'localhost',
    port: toInt(process.env.DB_PORT, 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'hostel_management',
    connectionLimit: toInt(process.env.DB_CONNECTION_LIMIT, 10),
    timezone: process.env.DB_TIMEZONE || '+05:00',
  },

  jwt: {
    secret: process.env.JWT_SECRET || '',
    expiresIn: process.env.JWT_EXPIRES_IN || '8h',
  },

  superAdmin: {
    name: process.env.SUPER_ADMIN_NAME || 'Super Admin',
    email: process.env.SUPER_ADMIN_EMAIL || 'superadmin@hostel.pk',
    password: process.env.SUPER_ADMIN_PASSWORD || 'Admin@12345',
  },

  reminderIntervalMinutes: toInt(process.env.REMINDER_INTERVAL_MINUTES, 60),

  uploads: {
    dir: path.join(__dirname, '..', process.env.UPLOAD_DIR || 'uploads'),
    maxSizeMb: toInt(process.env.MAX_UPLOAD_SIZE_MB, 5),
  },
};

const WEAK_SECRETS = ['', 'change_this_to_a_long_random_secret'];
if (WEAK_SECRETS.includes(env.jwt.secret) || env.jwt.secret.length < 32) {
  if (env.isProduction) {
    throw new Error('JWT_SECRET must be set to a long random value (32+ characters) in production');
  }
  // eslint-disable-next-line no-console
  console.warn('[config] WARNING: JWT_SECRET is weak or missing - set a long random value in .env');
  if (!env.jwt.secret) env.jwt.secret = 'dev-only-insecure-secret-change-me-please-0000';
}

module.exports = env;
