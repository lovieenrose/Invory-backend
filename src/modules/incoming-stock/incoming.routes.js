const { Router } = require('express');
const { z } = require('zod');
const validate = require('../../middleware/validate');
const { requireAuth } = require('../../middleware/auth');
const controller = require('./incoming.controller');

const router = Router();
router.use(requireAuth);

const poItemSchema = z.object({
  product_id: z.string().uuid(),
  quantity_ordered: z.number().int().positive(),
  unit_cost: z.number().nonnegative(),
});

const createPoSchema = z.object({
  supplier_id: z.string().uuid(),
  expected_date: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  items: z.array(poItemSchema).min(1, 'At least one item is required'),
});

const updateStatusSchema = z.object({
  status: z.enum(['pending', 'in_transit', 'cancelled']),
});

const receiveSchema = z.object({
  // Optional partial receipt: quantities per item; defaults to full ordered qty
  items: z
    .array(z.object({ item_id: z.string().uuid(), quantity_received: z.number().int().nonnegative() }))
    .optional(),
});

// GET /api/incoming-stock?status=pending
router.get('/', controller.list);
router.get('/:id', controller.getOne);
router.post('/', validate({ body: createPoSchema }), controller.create);
router.patch('/:id/status', validate({ body: updateStatusSchema }), controller.updateStatus);

// Marking as received automatically updates inventory quantities + valuation
router.post('/:id/receive', validate({ body: receiveSchema }), controller.receive);

module.exports = router;
