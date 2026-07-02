const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/ApiResponse');
const ApiError = require('../../utils/ApiError');

const list = asyncHandler(async (req, res) => {
  let query = req.db
    .from('purchase_orders')
    .select('*, supplier:suppliers(id, name), items:purchase_order_items(id, quantity_ordered, quantity_received, unit_cost)')
    .eq('owner_id', req.user.id)
    .order('created_at', { ascending: false });

  if (req.query.status) query = query.eq('status', req.query.status);

  const { data, error } = await query;
  if (error) throw ApiError.internal(error.message);
  return new ApiResponse(200, data).send(res);
});

const getOne = asyncHandler(async (req, res) => {
  const { data, error } = await req.db
    .from('purchase_orders')
    .select('*, supplier:suppliers(*), items:purchase_order_items(*, product:products(id, name, sku))')
    .eq('id', req.params.id)
    .eq('owner_id', req.user.id)
    .single();

  if (error) throw ApiError.notFound('Purchase order not found');
  return new ApiResponse(200, data).send(res);
});

/**
 * Creates a purchase order with its line items in one call. Uses the
 * `create_purchase_order` Postgres function so the order header + items
 * insert atomically (no risk of a PO existing with zero items on a
 * mid-request failure).
 */
const create = asyncHandler(async (req, res) => {
  const { supplier_id: supplierId, expected_date: expectedDate, notes, handling_fee: handlingFee = 0, shipping_fee: shippingFee = 0, items } = req.body;

  const totalCost = items.reduce((sum, i) => sum + i.quantity_ordered * i.unit_cost, 0) + handlingFee + shippingFee;

  const { data, error } = await req.db.rpc('create_purchase_order', {
    p_owner_id: req.user.id,
    p_supplier_id: supplierId,
    p_expected_date: expectedDate || null,
    p_notes: notes || null,
    p_total_cost: totalCost,
    p_handling_fee: handlingFee,
    p_shipping_fee: shippingFee,
    p_items: items,
  });

  if (error) throw ApiError.badRequest(error.message);
  return new ApiResponse(201, data, 'Purchase order created').send(res, 201);
});

const updateStatus = asyncHandler(async (req, res) => {
  const { data: existingOrder, error: findError } = await req.db
    .from('purchase_orders')
    .select('status')
    .eq('id', req.params.id)
    .eq('owner_id', req.user.id)
    .single();

  if (findError || !existingOrder) {
    throw ApiError.notFound('Purchase order not found');
  }

  if (req.body.status === 'received' && existingOrder.status !== 'received') {
    const { data: receivedData, error: receivedError } = await req.db.rpc('receive_purchase_order', {
      p_po_id: req.params.id,
      p_owner_id: req.user.id,
      p_items: null,
    });

    if (receivedError) throw ApiError.badRequest(receivedError.message);
    return new ApiResponse(200, receivedData, 'Delivery received — inventory updated').send(res);
  }

  const { data, error } = await req.db
    .from('purchase_orders')
    .update({ status: req.body.status })
    .eq('id', req.params.id)
    .eq('owner_id', req.user.id)
    .select()
    .single();

  if (error) throw ApiError.badRequest(error.message);
  if (!data) throw ApiError.notFound('Purchase order not found');
  return new ApiResponse(200, data, 'Status updated').send(res);
});

const update = asyncHandler(async (req, res) => {
  const payload = {};
  if (req.body.status !== undefined) payload.status = req.body.status;
  if (req.body.expected_date !== undefined) payload.expected_date = req.body.expected_date || null;
  if (req.body.notes !== undefined) payload.notes = req.body.notes || null;
  if (req.body.handling_fee !== undefined) payload.handling_fee = req.body.handling_fee;
  if (req.body.shipping_fee !== undefined) payload.shipping_fee = req.body.shipping_fee;

  const { data: existingOrder, error: findError } = await req.db
    .from('purchase_orders')
    .select('total_cost, handling_fee, shipping_fee, status')
    .eq('id', req.params.id)
    .eq('owner_id', req.user.id)
    .single();

  if (findError || !existingOrder) {
    throw ApiError.notFound('Purchase order not found');
  }

  // Recalculate the purchase order total when fee values change.
  if (req.body.handling_fee !== undefined || req.body.shipping_fee !== undefined) {
    const existingHandling = Number(existingOrder.handling_fee) || 0;
    const existingShipping = Number(existingOrder.shipping_fee) || 0;
    const updatedHandling = req.body.handling_fee !== undefined ? Number(req.body.handling_fee) || 0 : existingHandling;
    const updatedShipping = req.body.shipping_fee !== undefined ? Number(req.body.shipping_fee) || 0 : existingShipping;

    payload.total_cost = Number(existingOrder.total_cost || 0) - existingHandling - existingShipping + updatedHandling + updatedShipping;
  }

  const { data, error } = await req.db
    .from('purchase_orders')
    .update(payload)
    .eq('id', req.params.id)
    .eq('owner_id', req.user.id)
    .select()
    .single();

  if (error) throw ApiError.badRequest(error.message);
  if (!data) throw ApiError.notFound('Purchase order not found');

  if (payload.status === 'received' && existingOrder.status !== 'received') {
    const { data: receivedData, error: receivedError } = await req.db.rpc('receive_purchase_order', {
      p_po_id: req.params.id,
      p_owner_id: req.user.id,
      p_items: null,
    });
    if (receivedError) throw ApiError.badRequest(receivedError.message);
    return new ApiResponse(200, receivedData, 'Delivery received — inventory updated').send(res);
  }

  const shouldSyncExpenses = existingOrder.status === 'received' && (req.body.handling_fee !== undefined || req.body.shipping_fee !== undefined);
  if (shouldSyncExpenses) {
    const { error: syncError } = await req.db.rpc('sync_purchase_order_expenses', {
      p_po_id: req.params.id,
      p_owner_id: req.user.id,
    });
    if (syncError) throw ApiError.internal(syncError.message);
  }

  return new ApiResponse(200, data, 'Purchase order updated').send(res);
});

/**
 * The core automation of this module: marking a delivery as Received
 * atomically (a) increments each product's stock_quantity by the received
 * quantity, (b) updates the product's cost_price to the latest purchase
 * cost (moving cost basis), (c) writes a stock_adjustments audit row per
 * item, and (d) flips the PO to 'received' — all inside a single Postgres
 * transaction via the `receive_purchase_order` function, so inventory
 * valuation is never left inconsistent.
 */
const receive = asyncHandler(async (req, res) => {
  const { data, error } = await req.db.rpc('receive_purchase_order', {
    p_po_id: req.params.id,
    p_owner_id: req.user.id,
    p_items: req.body.items || null, // null => receive full ordered quantity for every item
  });

  if (error) throw ApiError.badRequest(error.message);
  return new ApiResponse(200, data, 'Delivery received — inventory updated').send(res);
});

module.exports = { list, getOne, create, update, updateStatus, receive };
