const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/ApiResponse');
const ApiError = require('../../utils/ApiError');

const list = asyncHandler(async (req, res) => {
  const { search, category_id: categoryId, low_stock: lowStock, page = '1', pageSize = '20' } = req.query;

  const from = (parseInt(page, 10) - 1) * parseInt(pageSize, 10);
  const to = from + parseInt(pageSize, 10) - 1;

  let query = req.db
    .from('products')
    .select('*, category:categories(id, name), supplier:suppliers(id, name)', { count: 'exact' })
    .eq('owner_id', req.user.id);

  if (search) query = query.or(`name.ilike.%${search}%,sku.ilike.%${search}%,barcode.ilike.%${search}%`);
  if (categoryId) query = query.eq('category_id', categoryId);
  // low_stock is computed (stock_quantity <= reorder_level); Postgres can't
  // compare two columns via the JS filter builder, so we use a raw filter.
  if (lowStock === 'true') query = query.filter('stock_quantity', 'lte', 'reorder_level');

  const { data, error, count } = await query.order('name').range(from, to);

  if (error) throw ApiError.internal(error.message);

  return new ApiResponse(200, data, 'Success', {
    page: parseInt(page, 10),
    pageSize: parseInt(pageSize, 10),
    total: count,
  }).send(res);
});

const getOne = asyncHandler(async (req, res) => {
  const { data, error } = await req.db
    .from('products')
    .select('*, category:categories(id, name), supplier:suppliers(id, name)')
    .eq('id', req.params.id)
    .eq('owner_id', req.user.id)
    .single();

  if (error) throw ApiError.notFound('Product not found');
  return new ApiResponse(200, data).send(res);
});

const create = asyncHandler(async (req, res) => {
  const { data: existing } = await req.db
    .from('products')
    .select('id')
    .eq('owner_id', req.user.id)
    .eq('sku', req.body.sku)
    .maybeSingle();

  if (existing) throw ApiError.conflict(`SKU "${req.body.sku}" already exists`);

  const { data, error } = await req.db
    .from('products')
    .insert({ ...req.body, owner_id: req.user.id })
    .select()
    .single();

  if (error) throw ApiError.badRequest(error.message);
  return new ApiResponse(201, data, 'Product created').send(res, 201);
});

const update = asyncHandler(async (req, res) => {
  const { data, error } = await req.db
    .from('products')
    .update(req.body)
    .eq('id', req.params.id)
    .eq('owner_id', req.user.id)
    .select()
    .single();

  if (error) throw ApiError.badRequest(error.message);
  if (!data) throw ApiError.notFound('Product not found');
  return new ApiResponse(200, data, 'Product updated').send(res);
});

const remove = asyncHandler(async (req, res) => {
  const { error } = await req.db
    .from('products')
    .delete()
    .eq('id', req.params.id)
    .eq('owner_id', req.user.id);

  if (error) throw ApiError.badRequest(error.message);
  return new ApiResponse(200, null, 'Product deleted').send(res);
});

/**
 * Manual stock adjustment. Writes an audit row to `stock_adjustments` and
 * atomically updates the product's stock_quantity via the
 * `apply_stock_adjustment` Postgres function (see supabase/schema.sql),
 * so the audit trail and the live quantity never drift apart.
 */
const adjustStock = asyncHandler(async (req, res) => {
  const { change, reason, notes } = req.body;

  const { data, error } = await req.db.rpc('apply_stock_adjustment', {
    p_product_id: req.params.id,
    p_owner_id: req.user.id,
    p_change: change,
    p_reason: reason,
    p_notes: notes || null,
    p_source: 'manual',
  });

  if (error) throw ApiError.badRequest(error.message);
  return new ApiResponse(200, data, 'Stock adjusted').send(res);
});

const listAdjustments = asyncHandler(async (req, res) => {
  const { data, error } = await req.db
    .from('stock_adjustments')
    .select('*')
    .eq('product_id', req.params.id)
    .eq('owner_id', req.user.id)
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) throw ApiError.internal(error.message);
  return new ApiResponse(200, data).send(res);
});

module.exports = { list, getOne, create, update, remove, adjustStock, listAdjustments };
