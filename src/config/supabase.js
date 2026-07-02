const { createClient } = require('@supabase/supabase-js');
const env = require('./env');

/**
 * Admin client — uses the service role key, bypasses Row Level Security.
 * ONLY use this inside trusted server-side logic (e.g. background jobs,
 * cross-user aggregation). Never expose this client or its key to clients.
 */
const supabaseAdmin = createClient(env.supabase.url, env.supabase.serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/**
 * Creates a request-scoped Supabase client authenticated as the calling user.
 * This lets Postgres Row Level Security (RLS) policies enforce per-user data
 * isolation automatically, instead of trusting the application layer alone.
 */
function getUserScopedClient(accessToken) {
  return createClient(env.supabase.url, env.supabase.anonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

module.exports = { supabaseAdmin, getUserScopedClient };
