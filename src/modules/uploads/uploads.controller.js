const streamifier = require('streamifier');
const cloudinary = require('../../config/cloudinary');
const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/ApiResponse');
const ApiError = require('../../utils/ApiError');

function streamUpload(buffer, folder) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: 'image', transformation: [{ width: 800, height: 800, crop: 'limit', quality: 'auto' }] },
      (error, result) => (error ? reject(error) : resolve(result)),
    );
    streamifier.createReadStream(buffer).pipe(stream);
  });
}

const uploadProductImage = asyncHandler(async (req, res) => {
  if (!req.file) throw ApiError.badRequest('No image file provided');

  const result = await streamUpload(req.file.buffer, `invory/${req.user.id}/products`);

  return new ApiResponse(200, { url: result.secure_url, public_id: result.public_id }, 'Image uploaded').send(res);
});

module.exports = { uploadProductImage };
