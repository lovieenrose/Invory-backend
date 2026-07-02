const ApiError = require('../utils/ApiError');

/**
 * Validates req.body/query/params against a Zod schema map, e.g.:
 *   validate({ body: createProductSchema })
 * Throws a 400 ApiError with field-level details on failure, and replaces
 * the request data with the parsed (type-coerced, defaulted) result.
 */
function validate(schemas) {
  return (req, res, next) => {
    for (const key of ['body', 'query', 'params']) {
      const schema = schemas[key];
      if (!schema) continue;

      const result = schema.safeParse(req[key]);
      if (!result.success) {
        const details = result.error.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
        }));
        throw ApiError.badRequest('Validation failed', details);
      }
      req[key] = result.data;
    }
    next();
  };
}

module.exports = validate;
