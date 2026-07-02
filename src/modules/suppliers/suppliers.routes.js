const { Router } = require('express');
const { z } = require('zod');
const validate = require('../../middleware/validate');
const { requireAuth } = require('../../middleware/auth');
const controller = require('./suppliers.controller');

const router = Router();
router.use(requireAuth);

const supplierSchema = z.object({
  name: z.string().min(1),
  contact_person: z.string().optional().nullable(),
  email: z.string().email().optional().nullable(),
  phone: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

router.get('/', controller.list);
router.get('/:id', controller.getOne);
router.post('/', validate({ body: supplierSchema }), controller.create);
router.put('/:id', validate({ body: supplierSchema.partial() }), controller.update);
router.delete('/:id', controller.remove);

module.exports = router;
