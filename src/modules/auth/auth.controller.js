const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/ApiResponse');
const ApiError = require('../../utils/ApiError');
const { supabaseAdmin, getUserScopedClient } = require('../../config/supabase');

/**
 * Registers a new seller account. We create the Supabase auth user first,
 * then a corresponding `business_profiles` row (1:1 with auth.users), so
 * every downstream table can foreign-key against business_profiles.id
 * and rely on RLS `auth.uid() = owner_id` policies.
 */
const register = asyncHandler(async (req, res) => {
  const { email, password, businessName, fullName } = req.body;

  const { data: signUpData, error: signUpError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (signUpError) throw ApiError.badRequest(signUpError.message);

  const userId = signUpData.user.id;

  const { error: profileError } = await supabaseAdmin.from('business_profiles').insert({
    owner_id: userId,
    business_name: businessName,
    full_name: fullName || null,
  });

  if (profileError) {
    // Roll back the auth user so we don't leave an orphaned account behind
    await supabaseAdmin.auth.admin.deleteUser(userId);
    throw ApiError.internal('Failed to create business profile');
  }

  const { data: session, error: sessionError } = await supabaseAdmin.auth.signInWithPassword({
    email,
    password,
  });
  if (sessionError) throw ApiError.internal(sessionError.message);

  return new ApiResponse(201, {
    user: session.user,
    session: session.session,
  }, 'Account created successfully').send(res, 201);
});

const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const { data, error } = await supabaseAdmin.auth.signInWithPassword({ email, password });
  if (error) throw ApiError.unauthorized('Invalid email or password');

  return new ApiResponse(200, { user: data.user, session: data.session }, 'Logged in').send(res);
});

const logout = asyncHandler(async (req, res) => {
  const token = req.headers.authorization.slice(7);
  const scoped = getUserScopedClient(token);
  await scoped.auth.signOut();
  return new ApiResponse(200, null, 'Logged out').send(res);
});

const me = asyncHandler(async (req, res) => {
  const { data, error } = await req.db
    .from('business_profiles')
    .select('*')
    .eq('owner_id', req.user.id)
    .single();

  if (error) throw ApiError.notFound('Business profile not found');

  return new ApiResponse(200, { user: req.user, profile: data }).send(res);
});

module.exports = { register, login, logout, me };
