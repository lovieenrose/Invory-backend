const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/ApiResponse');
const ApiError = require('../../utils/ApiError');

const list = asyncHandler(async (req, res) => {
  const { data, error } = await req.db
    .from('product_sets')
    .select('*, items:product_set_items(product_id, quantity)')
    .eq('owner_id', req.user.id)
    .order('sort_order', { ascending: true });

  if (error) throw ApiError.internal(error.message);
  return new ApiResponse(200, data).send(res);
});

const getOne = asyncHandler(async (req, res) => {
  const { data, error } = await req.db
    .from('product_sets')
    .select('*, items:product_set_items(product_id, quantity)')
    .eq('id', req.params.id)
    .eq('owner_id', req.user.id)
    .single();

  if (error) throw ApiError.notFound('Product set not found');
  return new ApiResponse(200, data).send(res);
});

async function validateOwnedProducts(db, ownerId, items) {
  const productIds = items.map((item) => item.product_id);
  const { data: ownedProducts, error } = await db
    .from('products')
    .select('id')
    .eq('owner_id', ownerId)
    .in('id', productIds);

  if (error) throw ApiError.internal(error.message);
  const ownedIds = new Set((ownedProducts || []).map((p) => p.id));
  const missing = items.filter((item) => !ownedIds.has(item.product_id));
  if (missing.length) {
    throw ApiError.badRequest(`Product set contains invalid or inaccessible product(s): ${missing
      .map((item) => item.product_id)
      .join(', ')}`);
  }
}

const create = asyncHandler(async (req, res) => {
  const { items, ...payload } = req.body;
  await validateOwnedProducts(req.db, req.user.id, items);

  const { data: latest, error: latestError } = await req.db
    .from('product_sets')
    .select('sort_order')
    .eq('owner_id', req.user.id)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestError) throw ApiError.internal(latestError.message);

  const nextSortOrder = latest?.sort_order != null ? latest.sort_order + 1 : 0;
  const { data, error } = await req.db
    .from('product_sets')
    .insert({ ...payload, owner_id: req.user.id, sort_order: payload.sort_order ?? nextSortOrder })
    .select()
    .single();

  if (error) throw ApiError.badRequest(error.message);

  const setItems = items.map((item) => ({ ...item, product_set_id: data.id }));
  const { error: itemsError } = await req.db.from('product_set_items').insert(setItems);
  if (itemsError) {
    await req.db.from('product_sets').delete().eq('id', data.id);
    throw ApiError.badRequest(itemsError.message);
  }

  const { data: result, error: fetchError } = await req.db
    .from('product_sets')
    .select('*, items:product_set_items(product_id, quantity)')
    .eq('id', data.id)
    .single();

  if (fetchError) throw ApiError.internal(fetchError.message);
  return new ApiResponse(201, result, 'Product set created').send(res, 201);
});

const update = asyncHandler(async (req, res) => {
  const { items, ...payload } = req.body;

  if (items) {
    await validateOwnedProducts(req.db, req.user.id, items);
  }

  const { data, error } = await req.db
    .from('product_sets')
    .update(payload)
    .eq('id', req.params.id)
    .eq('owner_id', req.user.id)
    .select()
    .single();

  if (error) throw ApiError.badRequest(error.message);
  if (!data) throw ApiError.notFound('Product set not found');

  if (items) {
    const { error: deleteError } = await req.db
      .from('product_set_items')
      .delete()
      .eq('product_set_id', data.id);

    if (deleteError) throw ApiError.internal(deleteError.message);

    const setItems = items.map((item) => ({ ...item, product_set_id: data.id }));
    const { error: insertError } = await req.db.from('product_set_items').insert(setItems);
    if (insertError) throw ApiError.badRequest(insertError.message);
  }

  const { data: result, error: fetchError } = await req.db
    .from('product_sets')
    .select('*, items:product_set_items(product_id, quantity)')
    .eq('id', req.params.id)
    .single();

  if (fetchError) throw ApiError.internal(fetchError.message);
  return new ApiResponse(200, result, 'Product set updated').send(res);
});

const remove = asyncHandler(async (req, res) => {
  const { error } = await req.db
    .from('product_sets')
    .delete()
    .eq('id', req.params.id)
    .eq('owner_id', req.user.id);

  if (error) throw ApiError.badRequest(error.message);
  return new ApiResponse(200, null, 'Product set deleted').send(res);
});

module.exports = { list, getOne, create, update, remove };
