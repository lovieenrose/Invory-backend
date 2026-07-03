const streamifier = require('streamifier');
const cloudinary = require('../../config/cloudinary');
const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/ApiResponse');
const ApiError = require('../../utils/ApiError');

const CATEGORY_BACKGROUNDS = {
  'liquid blends': '#DDF5E8',
  'packing materials': '#EFE3D2',
  'single peptides': '#F8DDE8',
  'skin boosters': '#FFF3C8',
  supplies: '#FFE2CC',
  topicals: '#E9DDF8',
  waters: '#DCEBFF',
};

const DEFAULT_BACKGROUND = '#F3F6FA';

function normalizeCategoryName(name = '') {
  return name.trim().toLowerCase();
}

function getCategoryBackground(categoryName) {
  return CATEGORY_BACKGROUNDS[normalizeCategoryName(categoryName)] || DEFAULT_BACKGROUND;
}

async function getCategoryName(req) {
  const categoryId = req.body.category_id;
  if (!categoryId) return req.body.category_name || '';

  const { data, error } = await req.db
    .from('categories')
    .select('name')
    .eq('id', categoryId)
    .eq('owner_id', req.user.id)
    .maybeSingle();

  if (error) throw ApiError.badRequest(error.message);
  return data?.name || req.body.category_name || '';
}

function streamUpload(buffer, folder, backgroundColor) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: 'image',
        transformation: [
          {
            width: 800,
            height: 800,
            crop: 'pad',
            gravity: 'center',
            background: `rgb:${backgroundColor.replace('#', '')}`,
            quality: 'auto',
            format: 'jpg',
          },
        ],
      },
      (error, result) => (error ? reject(error) : resolve(result)),
    );
    streamifier.createReadStream(buffer).pipe(stream);
  });
}

const uploadProductImage = asyncHandler(async (req, res) => {
  if (!req.file) throw ApiError.badRequest('No image file provided');

  const categoryName = await getCategoryName(req);
  const backgroundColor = getCategoryBackground(categoryName);
  const result = await streamUpload(req.file.buffer, `invory/${req.user.id}/products`, backgroundColor);

  return new ApiResponse(
    200,
    {
      url: result.secure_url,
      public_id: result.public_id,
      background_color: backgroundColor,
    },
    'Image uploaded',
  ).send(res);
});

module.exports = { uploadProductImage };
