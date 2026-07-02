const ApiError = require('../utils/ApiError');
const env = require('../config/env');

/**
 * Catches 404s for unmatched routes.
 */
function notFoundHandler(req, res, next) {
  next(ApiError.notFound(`Route not found: ${req.method} ${req.originalUrl}`));
}

/**
 * Global error handler. Must be registered last in the middleware chain.
 * Normalizes both operational errors (ApiError) and unexpected exceptions
 * into a single consistent JSON response shape.
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  let { statusCode, message, details } = err;

  if (!(err instanceof ApiError)) {
    statusCode = 500;
    message = env.nodeEnv === 'production' ? 'Internal server error' : err.message;
  }

  statusCode = statusCode || 500;

  if (env.nodeEnv !== 'production' && statusCode >= 500) {
    // eslint-disable-next-line no-console
    console.error(err.stack);
  }

  res.status(statusCode).json({
    success: false,
    message: message || 'Something went wrong',
    ...(details ? { details } : {}),
    ...(env.nodeEnv !== 'production' && statusCode >= 500 ? { stack: err.stack } : {}),
  });
}

module.exports = { notFoundHandler, errorHandler };
