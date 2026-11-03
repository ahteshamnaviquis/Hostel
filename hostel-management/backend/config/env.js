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

  uploads: {
    dir: path.join(__dirname, '..', process.env.UPLOAD_DIR || 'uploads'),
    maxSizeMb: toInt(process.env.MAX_UPLOAD_SIZE_MB, 5),
  },
};

module.exports = env;
