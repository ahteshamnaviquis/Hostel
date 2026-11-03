const asyncHandler = require('../utils/asyncHandler');
const healthService = require('../services/healthService');

/**
 * GET /api/health
 * 200 when the API and database are reachable, 503 when the database is down.
 */
const getHealth = asyncHandler(async (req, res) => {
  const report = await healthService.getHealthReport();
  const statusCode = report.status === 'ok' ? 200 : 503;
  res.status(statusCode).json({
    success: report.status === 'ok',
    message: report.status === 'ok' ? 'API is healthy' : 'API is running but the database is unavailable',
    data: report,
  });
});

module.exports = { getHealth };
