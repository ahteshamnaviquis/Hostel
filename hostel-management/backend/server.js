/**
 * Hostel Management System - API server entry point.
 */
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const env = require('./config/env');
const { pool } = require('./config/db');
const apiRoutes = require('./routes');
const notFound = require('./middleware/notFound');
const errorHandler = require('./middleware/errorHandler');
const { startReminderJob } = require('./services/reminderService');

const app = express();

// Security & parsing
app.disable('x-powered-by');
// Behind a reverse proxy (nginx) set TRUST_PROXY=1 so rate limiting and audit IPs use the real client IP
if (process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY) || 1);
app.use(helmet({ crossOriginResourcePolicy: { policy: 'same-site' } }));
app.use(
  cors({
    origin(origin, callback) {
      // Allow non-browser clients (curl, Postman) and configured frontend origins
      if (!origin || env.corsOrigins.includes(origin)) return callback(null, true);
      return callback(null, false);
    },
    credentials: true,
  })
);
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
if (!env.isProduction) app.use(morgan('dev'));

// Routes
app.get('/', (req, res) => {
  res.json({ success: true, message: `${env.appName} API`, data: { health: '/api/health' } });
});
app.use('/api', apiRoutes);

// 404 + error handling (must be last)
app.use(notFound);
app.use(errorHandler);

const server = app.listen(env.port, () => {
  console.log(`[server] ${env.appName} API running on http://localhost:${env.port} (${env.nodeEnv})`);
  if (process.env.NODE_ENV !== 'test') startReminderJob(env.reminderIntervalMinutes);
});

// Graceful shutdown
const shutdown = (signal) => {
  console.log(`[server] ${signal} received, shutting down...`);
  server.close(async () => {
    await pool.end().catch(() => {});
    process.exit(0);
  });
};
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

module.exports = app;
