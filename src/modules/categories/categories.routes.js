const { Router } = require('express');
const { z } = require('zod');
const validate = require('../../middleware/validate');
const { requireAuth } = require('../../middleware/auth');
const controller = require('./categories.controller');

const router = Router();
router.use(requireAuth);

const categorySchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().nullable(),
});

router.get('/', controller.list);
router.post('/', validate({ body: categorySchema }), controller.create);
router.put('/:id', validate({ body: categorySchema }), controller.update);
router.delete('/:id', controller.remove);

module.exports = router;
