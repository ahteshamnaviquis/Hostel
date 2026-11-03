const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/response');
const dashboardService = require('../services/dashboardService');

// GET /api/dashboard?hostel_id=
const getDashboard = asyncHandler(async (req, res) => {
  sendSuccess(res, { data: await dashboardService.getDashboard(req, req.q.hostel_id) });
});

module.exports = { getDashboard };
