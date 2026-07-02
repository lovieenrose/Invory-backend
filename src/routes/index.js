const { Router } = require('express');

const router = Router();

/**
 * Feature-based module registry. Adding a new business capability (e.g.
 * "invoices", "returns", "team-members") means dropping a folder into
 * src/modules and adding one line here — nothing else in the app needs
 * to change. This is what keeps the architecture scalable.
 */
router.use('/auth', require('../modules/auth/auth.routes'));
router.use('/categories', require('../modules/categories/categories.routes'));
router.use('/suppliers', require('../modules/suppliers/suppliers.routes'));
router.use('/products', require('../modules/products/products.routes'));
router.use('/incoming-stock', require('../modules/incoming-stock/incoming.routes'));
router.use('/sales', require('../modules/sales/sales.routes'));
router.use('/financials', require('../modules/financials/financials.routes'));
router.use('/uploads', require('../modules/uploads/uploads.routes'));

module.exports = router;
