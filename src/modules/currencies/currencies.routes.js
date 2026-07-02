const { Router } = require('express');
const controller = require('./currencies.controller');

const router = Router();

/**
 * GET /api/currencies - list all supported currencies
 */
router.get('/', controller.listCurrencies);

/**
 * GET /api/currencies/:code - get a specific currency
 */
router.get('/:code', controller.getCurrencyByCode);

/**
 * GET /api/currencies/rates/latest - get latest exchange rates
 * Query: from_currency=USD&to_currencies=PHP,EUR,SGD
 */
router.get('/rates/latest', controller.getLatestRates);

/**
 * GET /api/currencies/rates/historical - get historical rates
 * Query: from_currency=USD&to_currency=PHP&days=30
 */
router.get('/rates/historical', controller.getHistoricalRates);

module.exports = router;
