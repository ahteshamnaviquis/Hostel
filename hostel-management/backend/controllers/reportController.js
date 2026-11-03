const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/response');
const reportService = require('../services/reportService');
const exportService = require('../services/exportService');
const settingsService = require('../services/settingsService');
const { logAudit } = require('../services/auditService');

// GET /api/reports
const list = asyncHandler(async (req, res) => {
  sendSuccess(res, { data: reportService.availableReports(req) });
});

// GET /api/reports/:key?format=json|xlsx|pdf&hostel_id=&from=&to=&status=...
const run = asyncHandler(async (req, res) => {
  const { format, ...filters } = req.q;
  const report = await reportService.runReport(req, req.params.key, filters);
  if (format === 'json') return sendSuccess(res, { data: report });

  const appName = await settingsService.getSetting('app_name', 'Hostel Management System');
  const fileBase = `${req.params.key}-${new Date().toISOString().slice(0, 10)}`;
  await logAudit(null, req, {
    action: 'report.export', hostelId: filters.hostel_id || null,
    description: `Exported ${report.title} as ${format.toUpperCase()} (${report.rows.length} rows)`,
  });
  if (format === 'xlsx') {
    const buffer = await exportService.toExcel(report, appName);
    res.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.set('Content-Disposition', `attachment; filename="${fileBase}.xlsx"`);
    return res.send(Buffer.from(buffer));
  }
  const pdf = await exportService.toPdf(report, appName);
  res.set('Content-Type', 'application/pdf');
  res.set('Content-Disposition', `attachment; filename="${fileBase}.pdf"`);
  return res.send(pdf);
});

module.exports = { list, run };
