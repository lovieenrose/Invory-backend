/**
 * Exchange Rate Service
 * Fetches real-time exchange rates from free API and caches them in the database
 */

const env = require('../config/env');
const { supabaseAdmin } = require('../config/supabase');

// Using Open Exchange Rates API (free tier: 1000 requests/month)
// Free tier only supports USD as base currency
// Fallback: Use exchangerate-api.com or other free service
const EXCHANGE_RATE_API_URL = 'https://api.exchangerate-api.com/v4/latest';

/**
 * Fetch exchange rates from API and store in database
 */
async function fetchAndStoreExchangeRates(baseCurrency = 'USD') {
  try {
    const response = await fetch(`${EXCHANGE_RATE_API_URL}/${baseCurrency}`);
    if (!response.ok) {
      throw new Error(`Exchange rate API returned status ${response.status}`);
    }

    const data = await response.json();

    if (!data.rates) {
      throw new Error('Invalid API response: missing rates');
    }

    // Support currencies from the app
    const supportedCurrencies = ['PHP', 'USD', 'EUR', 'SGD', 'JPY', 'KRW'];

    // Transform rates to our format
    const rates = Object.entries(data.rates)
      .filter(([currency]) => supportedCurrencies.includes(currency))
      .map(([toCurrency, rate]) => ({
        from_currency: baseCurrency,
        to_currency: toCurrency,
        rate: parseFloat(rate),
        rate_source: 'exchangerate-api.com',
        recorded_at: new Date().toISOString(),
      }));

    if (rates.length === 0) {
      throw new Error('No supported currencies found in API response');
    }

    // Upsert rates into database
    const { error } = await supabaseAdmin
      .from('exchange_rates')
      .upsert(rates, {
        onConflict: 'from_currency, to_currency, recorded_at',
      });

    if (error) {
      throw new Error(`Failed to store rates: ${error.message}`);
    }

    // Update rates_last_updated
    await supabaseAdmin
      .from('system_settings')
      .update({ rates_last_updated: new Date().toISOString() })
      .neq('id', 'null-condition'); // Update all rows

    // eslint-disable-next-line no-console
    console.log(`✅ Exchange rates updated for base: ${baseCurrency} (${rates.length} pairs)`);

    return { success: true, ratesCount: rates.length };
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('❌ Failed to fetch exchange rates:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Get latest rate from database with fallback
 */
async function getLatestRate(fromCurrency, toCurrency) {
  try {
    const { data, error } = await supabaseAdmin
      .from('exchange_rates')
      .select('rate, recorded_at')
      .eq('from_currency', fromCurrency)
      .eq('to_currency', toCurrency)
      .order('recorded_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !data) {
      throw new Error(`No rate found for ${fromCurrency}/${toCurrency}`);
    }

    return { rate: data.rate, recorded_at: data.recorded_at };
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to get rate:', error.message);
    return null;
  }
}

/**
 * Convert amount using stored exchange rates
 */
async function convertAmount(amount, fromCurrency, toCurrency) {
  if (fromCurrency === toCurrency) {
    return { converted: amount, rate: 1, fromCurrency, toCurrency };
  }

  const rateData = await getLatestRate(fromCurrency, toCurrency);
  if (!rateData) {
    throw new Error(`Exchange rate not available for ${fromCurrency} to ${toCurrency}`);
  }

  return {
    converted: parseFloat((amount * rateData.rate).toFixed(2)),
    rate: rateData.rate,
    fromCurrency,
    toCurrency,
    rateTimestamp: rateData.recorded_at,
  };
}

/**
 * Periodic task to update exchange rates (call from a cron job)
 */
async function scheduleRateUpdates(intervalMinutes = 60) {
  // Update rates every hour (or specified interval)
  setInterval(async () => {
    const supportedBases = ['USD', 'PHP'];
    for (const baseCurrency of supportedBases) {
      await fetchAndStoreExchangeRates(baseCurrency);
    }
  }, intervalMinutes * 60 * 1000);

  // Initial fetch
  for (const baseCurrency of ['USD', 'PHP']) {
    await fetchAndStoreExchangeRates(baseCurrency);
  }

  // eslint-disable-next-line no-console
  console.log(`🔄 Exchange rate updates scheduled every ${intervalMinutes} minutes`);
}

module.exports = {
  fetchAndStoreExchangeRates,
  getLatestRate,
  convertAmount,
  scheduleRateUpdates,
};
