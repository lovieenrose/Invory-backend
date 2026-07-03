const { Router } = require('express');
const { z } = require('zod');
const validate = require('../../middleware/validate');
const { requireAuth } = require('../../middleware/auth');
const controller = require('./product-sets.controller');

const setItemSchema = z.object({
  product_id: z.string().uuid(),
  quantity: z.number().int().positive(),
});

const productSetSchema = z.object({
  name: z.string().min(1),
  color: z.string().regex(/^#([0-9A-Fa-f]{6})$/, 'Color must be a valid hex code').optional().nullable(),
  icon: z.string().optional().nullable(),
  sort_order: z.number().int().optional(),
  items: z.array(setItemSchema).min(1, 'A set must include at least one product'),
});

const productSetUpdateSchema = productSetSchema.partial({ name: false }).extend({
  name: z.string().min(1).optional(),
});

const querySchema = z.object({
  page: z.string().optional(),
  pageSize: z.string().optional(),
});

const router = Router();
router.use(requireAuth);

router.get('/', validate({ query: querySchema }), controller.list);
router.get('/:id', controller.getOne);
router.post('/', validate({ body: productSetSchema }), controller.create);
router.put('/:id', validate({ body: productSetUpdateSchema }), controller.update);
router.delete('/:id', controller.remove);

module.exports = router;
