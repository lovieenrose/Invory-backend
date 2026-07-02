const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/ApiResponse');
const ApiError = require('../../utils/ApiError');

const list = asyncHandler(async (req, res) => {
  const { data, error } = await req.db
    .from('categories')
    .select('*, products:products(count)')
    .eq('owner_id', req.user.id)
    .order('name');

  if (error) throw ApiError.internal(error.message);
  return new ApiResponse(200, data).send(res);
});

const create = asyncHandler(async (req, res) => {
  const { data, error } = await req.db
    .from('categories')
    .insert({ ...req.body, owner_id: req.user.id })
    .select()
    .single();

  if (error) throw ApiError.badRequest(error.message);
  return new ApiResponse(201, data, 'Category created').send(res, 201);
});

const update = asyncHandler(async (req, res) => {
  const { data, error } = await req.db
    .from('categories')
    .update(req.body)
    .eq('id', req.params.id)
    .eq('owner_id', req.user.id)
    .select()
    .single();

  if (error) throw ApiError.badRequest(error.message);
  if (!data) throw ApiError.notFound('Category not found');
  return new ApiResponse(200, data, 'Category updated').send(res);
});

const remove = asyncHandler(async (req, res) => {
  const { error } = await req.db
    .from('categories')
    .delete()
    .eq('id', req.params.id)
    .eq('owner_id', req.user.id);

  if (error) throw ApiError.badRequest(error.message);
  return new ApiResponse(200, null, 'Category deleted').send(res);
});

module.exports = { list, create, update, remove };
