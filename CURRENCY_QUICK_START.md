# Global Currency Management System - Quick Start Guide

## ⚡ 5-Minute Setup

### Step 1: Run Database Migrations (2 min)

1. Open [Supabase SQL Editor](https://app.supabase.com/project/_/sql/new)
2. Run migration scripts in this order:

```sql
-- First: Copy-paste contents of supabase/currency_migration.sql
-- Second: Copy-paste contents of supabase/currency_policies.sql
```

### Step 2: Restart Backend (1 min)

```bash
cd Invory-backend
npm run dev
# You should see: ✅ Exchange rates updated for base: USD (6 pairs)
# And: 🔄 Exchange rate updates scheduled every 60 minutes
```

### Step 3: Test Frontend (1 min)

1. Navigate to http://localhost:5173/settings
2. See the Settings page with currency selector
3. Try changing the base currency
4. Observe the display mode options

### Step 4: Verify APIs (1 min)

```bash
# Test currency list
curl http://localhost:5001/api/currencies

# Test settings
curl http://localhost:5001/api/settings

# Test conversion
curl http://localhost:5001/api/settings/convert?amount=100&from_currency=USD&to_currency=PHP
```

✅ You're done! The system is now running.

---

## 🎯 Integration Checklist

### Required (Must Do)
- [x] Database migrations run
- [x] Backend restarted
- [x] Frontend displaying Settings page
- [ ] Visit `/settings` and test currency selection

### Optional (Nice to Have)
- [ ] Update Inventory page to show product prices in currency format
- [ ] Update Sales dashboard to display totals in currency format
- [ ] Update Financials page to show amounts in currency format
- [ ] Add currency symbol to all input fields

---

## 🔌 API Quick Reference

### Get Supported Currencies
```bash
curl http://localhost:5001/api/currencies
```

### Get Current Settings
```bash
curl http://localhost:5001/api/settings
```
Returns: `{ base_currency: 'USD', display_mode: 'display_only' }`

### Update Settings
```bash
curl -X PUT http://localhost:5001/api/settings \
  -H "Authorization: Bearer <your-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "base_currency": "PHP",
    "display_mode": "automatic_conversion"
  }'
```

### Convert Amount
```bash
curl http://localhost:5001/api/settings/convert?amount=100&from_currency=USD&to_currency=PHP
```
Returns: `{ converted_amount: 5650, rate: 56.5 }`

### Get Exchange Rates
```bash
curl http://localhost:5001/api/currencies/rates/latest?from_currency=USD&to_currencies=PHP,EUR,SGD
```

---

## 💻 Frontend Integration Examples

### Display Currency in Component
```jsx
import CurrencyDisplay from '../components/common/CurrencyDisplay';

<CurrencyDisplay amount={1500} originalCurrency="USD" />
// Shows: $1,500.00 or ₱75,000.00 depending on base currency
```

### Format Currency Manually
```jsx
import { formatCurrency } from '../utils/currency';

formatCurrency(1500, 'PHP') // ₱1,500.00
```

### Get Currency Context
```jsx
import { useCurrency } from '../context/CurrencyContext';

const { baseCurrency, formatAmount } = useCurrency();

<p>{formatAmount(1500)}</p> // Uses base currency
```

---

## 📊 Supported Currencies

| Code | Name | Symbol | Locale |
|------|------|--------|--------|
| PHP | Philippine Peso | ₱ | fil-PH |
| USD | US Dollar | $ | en-US |
| EUR | Euro | € | de-DE |
| SGD | Singapore Dollar | S$ | en-SG |
| JPY | Japanese Yen | ¥ | ja-JP |
| KRW | South Korean Won | ₩ | ko-KR |

---

## ⚙️ Display Modes

### Display Only (Default)
```
✓ Symbol and formatting change only
✓ Stored values stay in original currency
✓ Faster, no API calls
✓ Best for: Multi-currency businesses
```

### Automatic Conversion
```
✓ Values converted using exchange rates
✓ Original values preserved in database
✓ Exchange rates updated hourly
✓ Best for: International reporting
```

---

## 🧪 Testing

### Test 1: Currency Selection
1. Go to Settings
2. Select "PHP" as base currency
3. Click Save
4. Verify success message

### Test 2: Display Mode
1. Go to Settings
2. Select "Automatic Conversion"
3. Click Save
4. Check that rates loaded successfully

### Test 3: API Conversion
```bash
curl http://localhost:5001/api/settings/convert?amount=1000&from_currency=USD&to_currency=PHP
# Should return: { converted_amount: 56500, rate: 56.5 }
```

---

## 🐛 Troubleshooting

### Exchange Rates Not Loading
```
✓ Check backend console for "Exchange rates updated" message
✓ Verify exchangerate-api.com is accessible
✓ Wait 60 seconds (rates update on schedule)
✓ Try manual: POST /api/settings/exchange-rates
```

### Settings Page Not Loading
```
✓ Check browser console for errors
✓ Verify CurrencyProvider is wrapping the app
✓ Check network tab - /api/settings should return 200
✓ Clear browser cache and reload
```

### Conversion Showing Wrong Value
```
✓ Verify /currencies/rates/latest returns current rates
✓ Check system_settings table: SELECT * FROM system_settings;
✓ Verify display_mode is correct
✓ Test with /settings/convert endpoint directly
```

---

## 📚 Full Documentation

For detailed implementation instructions, see:
- **Backend**: `CURRENCY_API_DOCUMENTATION.md`
- **Frontend**: `CURRENCY_IMPLEMENTATION_GUIDE.md`
- **Database**: `supabase/currency_migration.sql`

---

## 🚀 Next Steps

### Short Term (This Sprint)
1. Test currency selection in Settings
2. Verify exchange rates are updating
3. Test display modes

### Medium Term (Next Sprint)
1. Update Inventory to use CurrencyDisplay
2. Update Sales to show currency totals
3. Update Dashboard to display currency amounts

### Long Term (Future)
1. Per-product currency support
2. Multi-currency invoicing
3. Real-time rate WebSocket
4. Custom rate overrides

---

## 📞 Support

If you get stuck:
1. Check the Full Documentation links above
2. Review example components in the guides
3. Check backend logs: `npm run dev` output
4. Check browser console for errors
5. Verify database migrations ran successfully

---

**Last Updated**: 2026-07-02  
**Version**: 1.0.0  
**Status**: Production Ready
