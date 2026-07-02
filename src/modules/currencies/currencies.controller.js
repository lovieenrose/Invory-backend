const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/ApiResponse');
const ApiError = require('../../utils/ApiError');
const { supabaseAdmin } = require('../../config/supabase');

/**
 * Get all supported currencies
 */
const listCurrencies = asyncHandler(async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('supported_currencies')
    .select('*')
    .eq('is_active', true)
    .order('code', { ascending: true });

  if (error) throw ApiError.internal('Failed to fetch currencies');

  return new ApiResponse(
    200,
    { currencies: data },
    'Currencies retrieved successfully'
  ).send(res);
});

/**
 * Get a specific currency by code
 */
const getCurrencyByCode = asyncHandler(async (req, res) => {
  const { code } = req.params;

  const { data, error } = await supabaseAdmin
    .from('supported_currencies')
    .select('*')
    .eq('code', code)
    .single();

  if (error || !data) throw ApiError.notFound(`Currency ${code} not found`);

  return new ApiResponse(200, { currency: data }).send(res);
});

/**
 * Get latest exchange rates (cached for performance)
 */
const getLatestRates = asyncHandler(async (req, res) => {
  const { from_currency = 'PHP', to_currencies } = req.query;

  if (!to_currencies) {
    throw ApiError.badRequest('to_currencies query parameter is required');
  }

  const toCurrenciesArray = to_currencies.split(',').map((c) => c.trim().toUpperCase());

  // Get the latest rate for each currency pair
  const { data: rates, error } = await supabaseAdmin
    .from('exchange_rates')
    .select('from_currency, to_currency, rate, recorded_at')
    .eq('from_currency', from_currency)
    .in('to_currency', toCurrenciesArray)
    .order('recorded_at', { ascending: false })
    .limit(toCurrenciesArray.length);

  if (error) throw ApiError.internal('Failed to fetch exchange rates');

  // Transform to object for easier access
  const ratesMap = {};
  rates.forEach((r) => {
    ratesMap[r.to_currency] = { rate: r.rate, recorded_at: r.recorded_at };
  });

  return new ApiResponse(200, {
    from_currency,
    rates: ratesMap,
    timestamp: new Date().toISOString(),
  }).send(res);
});

/**
 * Get historical exchange rates for a date range
 */
const getHistoricalRates = asyncHandler(async (req, res) => {
  const { from_currency, to_currency, days = 30 } = req.query;

  if (!from_currency || !to_currency) {
    throw ApiError.badRequest('from_currency and to_currency are required');
  }

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - parseInt(days, 10));

  const { data: rates, error } = await supabaseAdmin
    .from('exchange_rates')
    .select('*')
    .eq('from_currency', from_currency)
    .eq('to_currency', to_currency)
    .gte('recorded_at', startDate.toISOString())
    .order('recorded_at', { ascending: true });

  if (error) throw ApiError.internal('Failed to fetch historical rates');

  return new ApiResponse(200, {
    from_currency,
    to_currency,
    days: parseInt(days, 10),
    rates,
  }).send(res);
});

module.exports = {
  listCurrencies,
  getCurrencyByCode,
  getLatestRates,
  getHistoricalRates,
};
