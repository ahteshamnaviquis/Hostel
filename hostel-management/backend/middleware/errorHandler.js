const env = require('../config/env');

/**
 * Central error handler. Never leaks stack traces or SQL details in production.
 */
// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal server error';

  // Malformed JSON body
  if (err.type === 'entity.parse.failed') {
    statusCode = 400;
    message = 'Invalid JSON in request body';
  }

  // Common MySQL errors -> friendly messages
  if (err.code === 'ER_DUP_ENTRY') {
    statusCode = 409;
    message = 'A record with the same unique value already exists';
  } else if (err.code === 'ER_NO_REFERENCED_ROW_2' || err.code === 'ER_ROW_IS_REFERENCED_2') {
    statusCode = 409;
    message = 'Operation violates a data relationship';
  } else if (err.code === 'ECONNREFUSED' || err.code === 'ER_ACCESS_DENIED_ERROR' || err.code === 'ER_BAD_DB_ERROR') {
    statusCode = 503;
    message = 'Database is unavailable';
  }

  if (statusCode >= 500) {
    console.error('[error]', err);
  }

  const body = {
    success: false,
    message: statusCode >= 500 && env.isProduction ? 'Internal server error' : message,
  };
  if (err.details) body.details = err.details;
  if (!env.isProduction && statusCode >= 500) body.stack = err.stack;

  res.status(statusCode).json(body);
};

module.exports = errorHandler;
