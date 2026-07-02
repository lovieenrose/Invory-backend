const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/ApiResponse');
const ApiError = require('../../utils/ApiError');

/**
 * Fetches live product data and computes order economics without touching
 * the database. Shared by both `preview` (dry run for the POS UI) and as
 * the pre-flight check before `checkout` calls the atomic RPC.
 */
async function computeOrderEconomics(db, ownerId, items) {
  const productIds = items.map((i) => i.product_id);
  const { data: products, error } = await db
    .from('products')
    .select('id, name, sku, cost_price, selling_price, stock_quantity')
    .eq('owner_id', ownerId)
    .in('id', productIds);

  if (error) throw ApiError.internal(error.message);

  const productMap = new Map(products.map((p) => [p.id, p]));
  let totalCost = 0;
  let subtotal = 0;

  const lineItems = items.map((item) => {
    const product = productMap.get(item.product_id);
    if (!product) throw ApiError.badRequest(`Product ${item.product_id} not found`);
    if (product.stock_quantity < item.quantity) {
      throw ApiError.conflict(`Insufficient stock for "${product.name}" (available: ${product.stock_quantity})`);
    }

    const unitPrice = item.unit_price ?? product.selling_price;
    const lineCost = product.cost_price * item.quantity;
    const lineRevenue = unitPrice * item.quantity;

    totalCost += lineCost;
    subtotal += lineRevenue;

    return {
      product_id: product.id,
      product_name: product.name,
      sku: product.sku,
      quantity: item.quantity,
      unit_cost: product.cost_price,
      unit_price: unitPrice,
      line_cost: lineCost,
      line_revenue: lineRevenue,
      line_profit: lineRevenue - lineCost,
    };
  });

  return { lineItems, subtotal, totalCost };
}

const preview = asyncHandler(async (req, res) => {
  const { items, discount = 0 } = req.body;
  const { lineItems, subtotal, totalCost } = await computeOrderEconomics(req.db, req.user.id, items);

  const total = subtotal - discount;
  const grossProfit = total - totalCost;
  const marginPct = total > 0 ? (grossProfit / total) * 100 : 0;

  return new ApiResponse(200, {
    items: lineItems,
    subtotal,
    discount,
    total_cost: totalCost,
    total,
    gross_profit: grossProfit,
    margin_pct: Number(marginPct.toFixed(2)),
  }).send(res);
});

/**
 * Checkout: validates stock availability, then delegates to the
 * `create_sale_order` Postgres function which, in a single transaction,
 * (a) inserts the sales_order + sales_order_items rows with cost/price
 * snapshots, (b) decrements product stock_quantity, and (c) records a
 * stock_adjustments audit entry per line — guaranteeing stock deduction and
 * order creation never happen independently of each other.
 */
const checkout = asyncHandler(async (req, res) => {
  const { customer_name: customerName, customer_contact: customerContact, discount = 0, payment_method: paymentMethod, notes, items } = req.body;

  // Validate & price the order first so we fail fast with a clear message
  // before hitting the DB function.
  await computeOrderEconomics(req.db, req.user.id, items);

  const { data, error } = await req.db.rpc('create_sale_order', {
    p_owner_id: req.user.id,
    p_customer_name: customerName || null,
    p_customer_contact: customerContact || null,
    p_discount: discount,
    p_payment_method: paymentMethod,
    p_notes: notes || null,
    p_items: items,
  });

  if (error) throw ApiError.badRequest(error.message);
  return new ApiResponse(201, data, 'Sale completed').send(res, 201);
});

const list = asyncHandler(async (req, res) => {
  const { from, to, page = '1', pageSize = '20' } = req.query;
  const fromIdx = (parseInt(page, 10) - 1) * parseInt(pageSize, 10);
  const toIdx = fromIdx + parseInt(pageSize, 10) - 1;

  let query = req.db
    .from('sales_orders')
    .select('*, items:sales_order_items(id, product_name, quantity, unit_price, line_revenue, line_profit)', { count: 'exact' })
    .eq('owner_id', req.user.id)
    .order('created_at', { ascending: false });

  if (from) query = query.gte('created_at', from);
  if (to) query = query.lte('created_at', to);

  const { data, error, count } = await query.range(fromIdx, toIdx);
  if (error) throw ApiError.internal(error.message);

  return new ApiResponse(200, data, 'Success', { page: parseInt(page, 10), pageSize: parseInt(pageSize, 10), total: count }).send(res);
});

const getOne = asyncHandler(async (req, res) => {
  const { data, error } = await req.db
    .from('sales_orders')
    .select('*, items:sales_order_items(*)')
    .eq('id', req.params.id)
    .eq('owner_id', req.user.id)
    .single();

  if (error) throw ApiError.notFound('Order not found');
  return new ApiResponse(200, data).send(res);
});

/**
 * Quick aggregate used by the POS screen (today's sales count/revenue) —
 * heavier dashboard aggregation lives in the financials module.
 */
const summary = asyncHandler(async (req, res) => {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const { data, error } = await req.db
    .from('sales_orders')
    .select('total, gross_profit')
    .eq('owner_id', req.user.id)
    .gte('created_at', startOfDay.toISOString());

  if (error) throw ApiError.internal(error.message);

  const todayRevenue = data.reduce((s, o) => s + Number(o.total), 0);
  const todayProfit = data.reduce((s, o) => s + Number(o.gross_profit), 0);

  return new ApiResponse(200, {
    orders_today: data.length,
    revenue_today: todayRevenue,
    profit_today: todayProfit,
  }).send(res);
});

module.exports = { preview, checkout, list, getOne, summary };
