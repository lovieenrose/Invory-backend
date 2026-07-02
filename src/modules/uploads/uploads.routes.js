const { Router } = require('express');
const multer = require('multer');
const { requireAuth } = require('../../middleware/auth');
const controller = require('./uploads.controller');

const router = Router();
router.use(requireAuth);

// Buffer upload (not disk) — forwarded directly to Cloudinary's upload stream
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Only image files are allowed'));
    }
    cb(null, true);
  },
});

// POST /api/uploads/product-image — returns { url, public_id } for use as products.image_url
router.post('/product-image', upload.single('image'), controller.uploadProductImage);

module.exports = router;
