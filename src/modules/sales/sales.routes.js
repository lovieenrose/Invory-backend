const { Router } = require('express');
const { z } = require('zod');
const validate = require('../../middleware/validate');
const { requireAuth } = require('../../middleware/auth');
const controller = require('./sales.controller');

const router = Router();
router.use(requireAuth);

const saleItemSchema = z.object({
  product_id: z.string().uuid(),
  quantity: z.number().int().positive(),
  // Optional per-item override; if omitted, product's current selling_price is used.
  // This is how "adjustable markup/profit per item" is expressed.
  unit_price: z.number().nonnegative().optional(),
});

const createSaleSchema = z.object({
  customer_name: z.string().optional().nullable(),
  customer_contact: z.string().optional().nullable(),
  discount: z.number().nonnegative().default(0),
  shipping_fee: z.number().nonnegative().default(0),
  payment_method: z.enum(['bank_transfer', 'gcash', 'maya', 'cash', 'cod', 'others', 'maribank', 'gotyme', 'bpi']).default('bank_transfer'),
  notes: z.string().optional().nullable(),
  items: z.array(saleItemSchema).min(1, 'At least one item is required'),
});

const reverseSaleSchema = z.object({
  reason: z.string().optional().nullable(),
});

const querySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  page: z.string().optional(),
  pageSize: z.string().optional(),
});

// GET /api/sales?from=&to=&page=1&pageSize=20  — sales history
router.get('/', validate({ query: querySchema }), controller.list);
router.get('/summary', controller.summary);
router.get('/:id', controller.getOne);
router.post('/:id/reverse', validate({ body: reverseSaleSchema }), controller.reverse);

// POST /api/sales/preview — compute totals (COGS, revenue, margin) without committing stock
router.post('/preview', validate({ body: createSaleSchema }), controller.preview);

// POST /api/sales — checkout: deducts stock, records order + line items atomically
router.post('/', validate({ body: createSaleSchema }), controller.checkout);

module.exports = router;
