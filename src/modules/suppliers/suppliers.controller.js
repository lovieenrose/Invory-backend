const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/ApiResponse');
const ApiError = require('../../utils/ApiError');

const list = asyncHandler(async (req, res) => {
  const { data, error } = await req.db
    .from('suppliers')
    .select('*')
    .eq('owner_id', req.user.id)
    .order('name');

  if (error) throw ApiError.internal(error.message);
  return new ApiResponse(200, data).send(res);
});

const getOne = asyncHandler(async (req, res) => {
  const { data, error } = await req.db
    .from('suppliers')
    .select('*, purchase_orders(id, status, expected_date, total_cost)')
    .eq('id', req.params.id)
    .eq('owner_id', req.user.id)
    .single();

  if (error) throw ApiError.notFound('Supplier not found');
  return new ApiResponse(200, data).send(res);
});

const create = asyncHandler(async (req, res) => {
  const { data, error } = await req.db
    .from('suppliers')
    .insert({ ...req.body, owner_id: req.user.id })
    .select()
    .single();

  if (error) throw ApiError.badRequest(error.message);
  return new ApiResponse(201, data, 'Supplier created').send(res, 201);
});

const update = asyncHandler(async (req, res) => {
  const { data, error } = await req.db
    .from('suppliers')
    .update(req.body)
    .eq('id', req.params.id)
    .eq('owner_id', req.user.id)
    .select()
    .single();

  if (error) throw ApiError.badRequest(error.message);
  if (!data) throw ApiError.notFound('Supplier not found');
  return new ApiResponse(200, data, 'Supplier updated').send(res);
});

const remove = asyncHandler(async (req, res) => {
  const { error } = await req.db
    .from('suppliers')
    .delete()
    .eq('id', req.params.id)
    .eq('owner_id', req.user.id);

  if (error) throw ApiError.badRequest(error.message);
  return new ApiResponse(200, null, 'Supplier deleted').send(res);
});

module.exports = { list, getOne, create, update, remove };
