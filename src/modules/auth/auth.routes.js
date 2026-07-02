const { Router } = require('express');
const { z } = require('zod');
const validate = require('../../middleware/validate');
const { requireAuth } = require('../../middleware/auth');
const controller = require('./auth.controller');

const router = Router();

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  businessName: z.string().min(1, 'Business name is required'),
  fullName: z.string().min(1).optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// POST /api/auth/register - creates a Supabase auth user + a business profile row
router.post('/register', validate({ body: registerSchema }), controller.register);

// POST /api/auth/login - signs in and returns session tokens
router.post('/login', validate({ body: loginSchema }), controller.login);

// POST /api/auth/logout - invalidates the current session
router.post('/logout', requireAuth, controller.logout);

// GET /api/auth/me - returns the current user + business profile
router.get('/me', requireAuth, controller.me);

module.exports = router;
