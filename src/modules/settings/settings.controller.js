const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/ApiResponse');
const ApiError = require('../../utils/ApiError');
const { supabaseAdmin } = require('../../config/supabase');

/**
 * Get current system settings (currency, display mode, etc.)
 */
const getSystemSettings = asyncHandler(async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('system_settings')
    .select('*')
    .single();

  if (error || !data) {
    // Create default settings if none exist
    const { data: created, error: createError } = await supabaseAdmin
      .from('system_settings')
      .insert({
        base_currency: 'PHP',
        display_mode: 'display_only',
        auto_update_rates: true,
      })
      .select()
      .single();

    if (createError) throw ApiError.internal('Failed to create system settings');
    return new ApiResponse(200, { settings: created }).send(res);
  }

  return new ApiResponse(200, { settings: data }).send(res);
});

/**
 * Update system settings (base currency, display mode, etc.)
 * Only authenticated users can update (controller responsibility)
 */
const updateSystemSettings = asyncHandler(async (req, res) => {
  const { base_currency, display_mode, auto_update_rates } = req.body;

  // Validate display_mode
  if (display_mode && !['display_only', 'automatic_conversion'].includes(display_mode)) {
    throw ApiError.badRequest('Invalid display_mode. Must be "display_only" or "automatic_conversion"');
  }

  // Validate base_currency exists
  if (base_currency) {
    const { data: currency, error: currencyError } = await supabaseAdmin
      .from('supported_currencies')
      .select('code')
      .eq('code', base_currency)
      .single();

    if (currencyError || !currency) {
      throw ApiError.badRequest(`Currency ${base_currency} not supported`);
    }
  }

  const updateData = {};
  if (base_currency) updateData.base_currency = base_currency;
  if (display_mode !== undefined) updateData.display_mode = display_mode;
  if (auto_update_rates !== undefined) updateData.auto_update_rates = auto_update_rates;

  const { data: updated, error } = await supabaseAdmin
    .from('system_settings')
    .update(updateData)
    .select()
    .single();

  if (error) throw ApiError.internal('Failed to update system settings');

  return new ApiResponse(200, { settings: updated }, 'Settings updated successfully').send(res);
});

/**
 * Store exchange rates in database
 * This is called periodically by the backend to cache rates
 */
const upsertExchangeRates = asyncHandler(async (req, res) => {
  const { rates } = req.body;

  if (!rates || !Array.isArray(rates) || rates.length === 0) {
    throw ApiError.badRequest('rates must be a non-empty array');
  }

  // Validate each rate
  const validRates = rates.map((r) => {
    if (!r.from_currency || !r.to_currency || r.rate === undefined) {
      throw ApiError.badRequest('Each rate must have from_currency, to_currency, and rate');
    }
    return {
      from_currency: r.from_currency.toUpperCase(),
      to_currency: r.to_currency.toUpperCase(),
      rate: parseFloat(r.rate),
      rate_source: r.rate_source || 'open_exchange_rates',
      recorded_at: r.recorded_at || new Date().toISOString(),
    };
  });

  // Upsert rates (insert or update if exists)
  const { data: inserted, error } = await supabaseAdmin
    .from('exchange_rates')
    .upsert(validRates, {
      onConflict: 'from_currency, to_currency, recorded_at',
    })
    .select();

  if (error) throw ApiError.internal('Failed to store exchange rates');

  // Update the rates_last_updated timestamp
  await supabaseAdmin
    .from('system_settings')
    .update({ rates_last_updated: new Date().toISOString() })
    .eq('id', (await supabaseAdmin.from('system_settings').select('id').single()).data.id);

  return new ApiResponse(201, { rates: inserted }, 'Exchange rates stored successfully').send(res);
});

/**
 * Convert an amount from one currency to another using latest rates
 */
const convertCurrency = asyncHandler(async (req, res) => {
  const { amount, from_currency, to_currency } = req.query;

  if (!amount || !from_currency || !to_currency) {
    throw ApiError.badRequest('amount, from_currency, and to_currency are required');
  }

  const numAmount = parseFloat(amount);
  if (isNaN(numAmount) || numAmount < 0) {
    throw ApiError.badRequest('amount must be a valid positive number');
  }

  // Get the latest rate
  const { data: rateData, error: rateError } = await supabaseAdmin
    .from('exchange_rates')
    .select('rate')
    .eq('from_currency', from_currency)
    .eq('to_currency', to_currency)
    .order('recorded_at', { ascending: false })
    .limit(1)
    .single();

  if (rateError || !rateData) {
    throw ApiError.notFound(`Exchange rate for ${from_currency} to ${to_currency} not found`);
  }

  const convertedAmount = numAmount * rateData.rate;

  return new ApiResponse(200, {
    original_amount: numAmount,
    from_currency,
    to_currency,
    rate: rateData.rate,
    converted_amount: convertedAmount,
  }).send(res);
});

module.exports = {
  getSystemSettings,
  updateSystemSettings,
  upsertExchangeRates,
  convertCurrency,
};
