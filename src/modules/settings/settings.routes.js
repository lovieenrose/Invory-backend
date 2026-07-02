const { Router } = require('express');
const { z } = require('zod');
const validate = require('../../middleware/validate');
const { requireAuth } = require('../../middleware/auth');
const controller = require('./settings.controller');

const router = Router();

const updateSettingsSchema = z.object({
  base_currency: z.string().length(3).toUpperCase().optional(),
  display_mode: z.enum(['display_only', 'automatic_conversion']).optional(),
  auto_update_rates: z.boolean().optional(),
});

const upsertRatesSchema = z.object({
  rates: z.array(
    z.object({
      from_currency: z.string().length(3).toUpperCase(),
      to_currency: z.string().length(3).toUpperCase(),
      rate: z.number().positive(),
      rate_source: z.string().optional(),
      recorded_at: z.string().datetime().optional(),
    })
  ).nonempty(),
});

/**
 * GET /api/settings - Get current system settings
 */
router.get('/', controller.getSystemSettings);

/**
 * PUT /api/settings - Update system settings (requires auth)
 */
router.put(
  '/',
  requireAuth,
  validate({ body: updateSettingsSchema }),
  controller.updateSystemSettings
);

/**
 * POST /api/settings/exchange-rates - Store/update exchange rates
 * Only backend service role can call this
 */
router.post(
  '/exchange-rates',
  validate({ body: upsertRatesSchema }),
  controller.upsertExchangeRates
);

/**
 * GET /api/settings/convert - Convert currency amount
 * Query: amount=100&from_currency=USD&to_currency=PHP
 */
router.get('/convert', controller.convertCurrency);

module.exports = router;
