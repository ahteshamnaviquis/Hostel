/**
 * Consistent JSON response helpers.
 * Success: { success: true, message, data, meta? }
 * Error:   { success: false, message, details? }   (see middleware/errorHandler.js)
 */
const sendSuccess = (res, { data = null, message = 'OK', statusCode = 200, meta } = {}) => {
  const body = { success: true, message, data };
  if (meta) body.meta = meta;
  return res.status(statusCode).json(body);
};

module.exports = { sendSuccess };
