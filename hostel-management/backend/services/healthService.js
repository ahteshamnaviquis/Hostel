/**
 * Builds the API health report (server + database status).
 */
const env = require('../config/env');
const db = require('../config/db');
const systemModel = require('../models/systemModel');

async function getHealthReport() {
  const report = {
    status: 'ok',
    app: env.appName,
    environment: env.nodeEnv,
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
    database: { status: 'disconnected' },
  };

  try {
    await db.ping();
    const info = await systemModel.getDatabaseInfo();
    report.database = {
      status: 'connected',
      name: env.db.database,
      serverVersion: info.version,
      migrationsApplied: info.migrations.length,
      initialised: info.migrations.length > 0,
    };
  } catch (error) {
    report.status = 'degraded';
    report.database = {
      status: 'disconnected',
      error: env.isProduction ? 'Database unavailable' : `${error.code || 'ERROR'}: ${error.message}`,
    };
  }

  return report;
}

module.exports = { getHealthReport };
