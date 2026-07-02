# Backend Currency Management System

## Overview

The Invory backend now includes comprehensive currency management capabilities with automatic exchange rate fetching, multi-currency transaction support, and flexible display modes.

## New API Endpoints

### Currencies Endpoints

#### GET /api/currencies
List all supported currencies
```bash
curl http://localhost:5001/api/currencies
```
Response:
```json
{
  "success": true,
  "message": "Currencies retrieved successfully",
  "data": {
    "currencies": [
      {
        "code": "PHP",
        "name": "Philippine Peso",
        "symbol": "₱",
        "locale": "fil-PH",
        "decimal_places": 2,
        "is_active": true
      },
      // ... more currencies
    ]
  }
}
```

#### GET /api/currencies/:code
Get specific currency details
```bash
curl http://localhost:5001/api/currencies/PHP
```

#### GET /api/currencies/rates/latest?from_currency=USD&to_currencies=PHP,EUR,SGD
Get latest exchange rates
```bash
curl http://localhost:5001/api/currencies/rates/latest?from_currency=USD&to_currencies=PHP,EUR,SGD
```
Response:
```json
{
  "success": true,
  "data": {
    "from_currency": "USD",
    "rates": {
      "PHP": { "rate": 56.5, "recorded_at": "2026-07-02T10:00:00Z" },
      "EUR": { "rate": 0.92, "recorded_at": "2026-07-02T10:00:00Z" },
      "SGD": { "rate": 1.34, "recorded_at": "2026-07-02T10:00:00Z" }
    },
    "timestamp": "2026-07-02T13:35:39.537Z"
  }
}
```

#### GET /api/currencies/rates/historical?from_currency=USD&to_currency=PHP&days=30
Get historical exchange rates for date range
```bash
curl http://localhost:5001/api/currencies/rates/historical?from_currency=USD&to_currency=PHP&days=30
```

### Settings Endpoints

#### GET /api/settings
Get current system settings (including base currency and display mode)
```bash
curl http://localhost:5001/api/settings
```
Response:
```json
{
  "success": true,
  "data": {
    "settings": {
      "id": "uuid",
      "base_currency": "USD",
      "display_mode": "display_only",
      "auto_update_rates": true,
      "rates_last_updated": "2026-07-02T13:35:00Z",
      "created_at": "2026-07-02T00:00:00Z",
      "updated_at": "2026-07-02T13:35:00Z"
    }
  }
}
```

#### PUT /api/settings
Update system settings (requires authentication)
```bash
curl -X PUT http://localhost:5001/api/settings \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "base_currency": "PHP",
    "display_mode": "automatic_conversion",
    "auto_update_rates": true
  }'
```

#### GET /api/settings/convert?amount=100&from_currency=USD&to_currency=PHP
Convert amount between currencies using latest rates
```bash
curl http://localhost:5001/api/settings/convert?amount=100&from_currency=USD&to_currency=PHP
```
Response:
```json
{
  "success": true,
  "data": {
    "original_amount": 100,
    "from_currency": "USD",
    "to_currency": "PHP",
    "rate": 56.5,
    "converted_amount": 5650
  }
}
```

#### POST /api/settings/exchange-rates
Store exchange rates (service role key only)
```bash
curl -X POST http://localhost:5001/api/settings/exchange-rates \
  -H "Content-Type: application/json" \
  -d '{
    "rates": [
      {
        "from_currency": "USD",
        "to_currency": "PHP",
        "rate": 56.5,
        "rate_source": "exchangerate-api.com"
      },
      // ... more rates
    ]
  }'
```

## Database Tables

### supported_currencies
Stores available currencies for the system.
```sql
CREATE TABLE supported_currencies (
  code TEXT PRIMARY KEY,              -- 'USD', 'PHP', etc.
  name TEXT NOT NULL,                 -- 'United States Dollar'
  symbol TEXT NOT NULL,               -- '$', '₱', etc.
  locale TEXT NOT NULL,               -- 'en-US', 'fil-PH', etc.
  decimal_places INTEGER DEFAULT 2,   -- Number of decimal places
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### system_settings
Stores global app configuration.
```sql
CREATE TABLE system_settings (
  id UUID PRIMARY KEY,
  base_currency TEXT REFERENCES supported_currencies(code),
  display_mode TEXT DEFAULT 'display_only',  -- or 'automatic_conversion'
  auto_update_rates BOOLEAN DEFAULT true,
  rates_last_updated TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);
```

### exchange_rates
Historical exchange rate cache.
```sql
CREATE TABLE exchange_rates (
  id UUID PRIMARY KEY,
  from_currency TEXT REFERENCES supported_currencies(code),
  to_currency TEXT REFERENCES supported_currencies(code),
  rate NUMERIC(18,6) NOT NULL,        -- e.g., 56.500000
  rate_source TEXT DEFAULT 'exchangerate-api.com',
  recorded_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(from_currency, to_currency, recorded_at)
);
```

## Exchange Rate Service

The exchange rate service automatically fetches and caches exchange rates.

### Configuration

Rates are updated every **60 minutes** (configurable in server.js):
```javascript
scheduleRateUpdates(60); // minutes
```

Supported base currencies for updates:
- USD
- PHP

### API Used

**exchangerate-api.com** (Free tier)
- 1500 requests/month limit
- Updates every 60 minutes
- Support for all ISO currencies

### Automatic Features

1. **Startup Rate Fetching**: Rates fetched on server start
2. **Periodic Updates**: Rates fetched every hour
3. **Fallback**: Falls back to last known rate if API unavailable
4. **Graceful Degradation**: Missing rates don't break conversions

### Manual Rate Update

Manually trigger rate update:
```javascript
const { fetchAndStoreExchangeRates } = require('./services/exchangeRateService');

await fetchAndStoreExchangeRates('USD');
// Returns: { success: true, ratesCount: 5 }
```

## Multi-Currency Transaction Support

All transaction tables now support original currency tracking:

### Products Table
```sql
-- New columns
original_currency TEXT REFERENCES supported_currencies(code);
cost_price_original NUMERIC(12,2);
selling_price_original NUMERIC(12,2);

-- Example: Product entered in USD shows in PHP
product.cost_price = 5650;            -- USD value converted to PHP
product.cost_price_original = 100;    -- Original USD value
product.original_currency = 'USD';    -- Track original currency
```

### Purchase Orders
```sql
original_currency TEXT;
total_cost_original NUMERIC(12,2);
```

### Sales Orders
```sql
original_currency TEXT;
subtotal_original NUMERIC(12,2);
discount_original NUMERIC(12,2);
total_original NUMERIC(12,2);
total_cost_original NUMERIC(12,2);
```

### Expenses
```sql
original_currency TEXT;
amount_original NUMERIC(12,2);
```

## Implementation in Controllers

### Example: Recording a Sale with Currency

```javascript
const salesToCreate = {
  order_number: generateOrderNumber(),
  subtotal: convertedSubtotal,
  discount: convertedDiscount,
  total: convertedTotal,
  total_cost: convertedCost,
  
  // Currency tracking for audit trail
  original_currency: 'USD',
  subtotal_original: 1000,
  discount_original: 100,
  total_original: 900,
  total_cost_original: 450,
};

const { data, error } = await supabaseAdmin
  .from('sales_orders')
  .insert(salesToCreate);
```

### Example: Converting Product Prices

```javascript
const { convertAmount } = require('../services/exchangeRateService');

// When recording in different currency
const { converted, rate } = await convertAmount(
  product.cost_price,
  product.original_currency,
  baseCurrency
);

// Store both original and converted
product.cost_price_original = product.cost_price;
product.original_currency = product.original_currency;
product.cost_price = converted;
```

## Error Handling

### Exchange Rate Not Found
```json
{
  "success": false,
  "message": "Exchange rate for USD to PHP not found",
  "details": null,
  "statusCode": 404
}
```

### Invalid Currency
```json
{
  "success": false,
  "message": "Currency XYZ not supported",
  "details": null,
  "statusCode": 400
}
```

### API Failure
Exchange rate service logs errors and continues with cached rates:
```
❌ Failed to fetch exchange rates: Network error
→ System continues with last cached rates
```

## Testing

### Test Exchange Rate Fetching
```bash
# Check if rates are being fetched
tail -f backend-logs.txt | grep "Exchange rates"

# Verify rates in database
SELECT * FROM exchange_rates ORDER BY recorded_at DESC LIMIT 5;
```

### Test Currency Conversion
```bash
curl http://localhost:5001/api/settings/convert?amount=100&from_currency=USD&to_currency=PHP

# Should return converted amount based on latest rate
```

### Test Display Mode Settings
```bash
# Get current settings
curl http://localhost:5001/api/settings

# Update to conversion mode
curl -X PUT http://localhost:5001/api/settings \
  -H "Authorization: Bearer <token>" \
  -d '{"display_mode": "automatic_conversion"}'
```

## Performance Considerations

1. **Rate Caching**: Rates cached in database, no API calls per conversion
2. **Indexed Queries**: Indexes on exchange_rates for fast lookups
3. **Batch Inserts**: Multiple rates inserted in single operation
4. **Connection Pooling**: Exchange rate service reuses connections

## Security

1. **RLS Policies**: Exchange rates readable by all, writable only by service role
2. **Input Validation**: All currency codes validated against supported_currencies
3. **Rate Limits**: Standard rate limiting applies to all endpoints
4. **No API Key Exposure**: Exchange rate API key not sent to client

## Future Enhancements

1. Real-time rate updates via WebSocket
2. Custom rate overrides by admin
3. Rate change alerts and notifications
4. Multi-provider rate redundancy
5. Per-currency conversion fees
6. Blockchain-based rate verification

## Monitoring

Monitor these database tables for insights:
- `system_settings.rates_last_updated` - When rates were last updated
- `exchange_rates` count - Growth over time
- `exchange_rates.recorded_at` - Verify hourly updates
- Transaction `*_original` columns - Verify currency tracking

## Troubleshooting

### Rates not updating
1. Check backend logs for "Exchange rates" messages
2. Verify exchangerate-api.com is accessible from server
3. Check `system_settings.rates_last_updated`
4. Manually trigger: `fetchAndStoreExchangeRates('USD')`

### Conversion showing wrong value
1. Query latest rate: `SELECT rate FROM exchange_rates WHERE from_currency='USD' AND to_currency='PHP' ORDER BY recorded_at DESC LIMIT 1`
2. Verify rate is current (within last hour)
3. Test with /settings/convert endpoint
4. Check display_mode setting

### Missing currencies
1. Verify `supported_currencies` table has all needed currencies
2. Run currency_migration.sql to initialize
3. Check `is_active = true` for currencies
