const { supabaseAdmin, getUserScopedClient } = require('../config/supabase');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

/**
 * Verifies the Supabase access token sent as `Authorization: Bearer <token>`.
 * On success, attaches:
 *   req.user   -> the authenticated Supabase user
 *   req.db     -> a Supabase client scoped to that user (RLS enforced)
 *
 * All protected routes should read/write through req.db, never supabaseAdmin,
 * so that Postgres Row Level Security remains the source of truth for
 * per-user data isolation (defense in depth beyond the application layer).
 */
const requireAuth = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    throw ApiError.unauthorized('Missing access token');
  }

  const { data, error } = await supabaseAdmin.auth.getUser(token);

  if (error || !data?.user) {
    throw ApiError.unauthorized('Invalid or expired session');
  }

  req.user = data.user;
  req.db = getUserScopedClient(token);
  next();
});

module.exports = { requireAuth };
