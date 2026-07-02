/**
 * Wraps an async controller so any thrown error/rejected promise is passed
 * to next(), avoiding repetitive try/catch blocks in every controller.
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = asyncHandler;
