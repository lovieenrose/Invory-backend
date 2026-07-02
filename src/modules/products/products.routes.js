const { Router } = require('express');
const { z } = require('zod');
const validate = require('../../middleware/validate');
const { requireAuth } = require('../../middleware/auth');
const controller = require('./products.controller');

const router = Router();
router.use(requireAuth);

const productSchema = z.object({
  name: z.string().min(1),
  sku: z.string().min(1),
  barcode: z.string().optional().nullable(),
  category_id: z.string().uuid().optional().nullable(),
  supplier_id: z.string().uuid().optional().nullable(),
  cost_price: z.number().nonnegative(),
  selling_price: z.number().nonnegative(),
  stock_quantity: z.number().int().nonnegative().default(0),
  reorder_level: z.number().int().nonnegative().default(5),
  unit: z.string().default('pc'),
  image_url: z.string().url().optional().nullable(),
  description: z.string().optional().nullable(),
});

const adjustmentSchema = z.object({
  change: z.number().int().refine((v) => v !== 0, 'Change cannot be zero'),
  reason: z.enum(['recount', 'damaged', 'lost', 'returned', 'correction', 'other']),
  notes: z.string().optional().nullable(),
});

const querySchema = z.object({
  search: z.string().optional(),
  category_id: z.string().uuid().optional(),
  low_stock: z.enum(['true', 'false']).optional(),
  page: z.string().optional(),
  pageSize: z.string().optional(),
});

// GET /api/products?search=&category_id=&low_stock=true&page=1&pageSize=20
router.get('/', validate({ query: querySchema }), controller.list);
router.get('/:id', controller.getOne);
router.post('/', validate({ body: productSchema }), controller.create);
router.put('/:id', validate({ body: productSchema.partial() }), controller.update);
router.delete('/:id', controller.remove);

// Stock adjustment (manual correction — automated deductions happen via sales/incoming-stock)
router.post('/:id/adjust-stock', validate({ body: adjustmentSchema }), controller.adjustStock);
router.get('/:id/adjustments', controller.listAdjustments);

module.exports = router;
