const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/ApiResponse');
const ApiError = require('../../utils/ApiError');

const RANGE_DAYS = { '7d': 7, '30d': 30, '90d': 90, '12m': 365 };

/**
 * Aggregates every KPI the home dashboard needs into a single response.
 * Pulls from sales_orders, expenses, products, and purchase_orders in
 * parallel, then reduces them in JS. For very large datasets this logic
 * should move into a Postgres view/materialized view — see ARCHITECTURE.md.
 */
const dashboard = asyncHandler(async (req, res) => {
  const days = RANGE_DAYS[req.query.range];
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceIso = since.toISOString();

  const [salesRes, expensesRes, productsRes, pendingPoRes] = await Promise.all([
    req.db
      .from('sales_orders')
      .select('id, total, total_cost, gross_profit, created_at, items:sales_order_items(product_id, product_name, quantity, line_revenue, line_profit)')
      .eq('owner_id', req.user.id)
      .gte('created_at', sinceIso),
    req.db
      .from('expenses')
      .select('amount, category, expense_date')
      .eq('owner_id', req.user.id)
      .gte('expense_date', sinceIso),
    req.db
      .from('products')
      .select('id, name, stock_quantity, reorder_level, cost_price, selling_price')
      .eq('owner_id', req.user.id),
    req.db
      .from('purchase_orders')
      .select('id, status', { count: 'exact', head: false })
      .eq('owner_id', req.user.id)
      .in('status', ['pending', 'in_transit']),
  ]);

  if (salesRes.error) throw ApiError.internal(salesRes.error.message);
  if (expensesRes.error) throw ApiError.internal(expensesRes.error.message);
  if (productsRes.error) throw ApiError.internal(productsRes.error.message);
  if (pendingPoRes.error) throw ApiError.internal(pendingPoRes.error.message);

  const sales = salesRes.data;
  const expenses = expensesRes.data;
  const products = productsRes.data;

  const totalRevenue = sales.reduce((s, o) => s + Number(o.total), 0);
  const totalCogs = sales.reduce((s, o) => s + Number(o.total_cost), 0);
  const grossProfit = sales.reduce((s, o) => s + Number(o.gross_profit), 0);
  const totalExpenses = expenses.reduce((s, e) => s + Number(e.amount), 0);
  const netProfit = grossProfit - totalExpenses;

  const inventoryValue = products.reduce((s, p) => s + p.stock_quantity * Number(p.cost_price), 0);
  const lowStockItems = products.filter((p) => p.stock_quantity <= p.reorder_level);

  // Top-selling products by units sold within range
  const productTotals = new Map();
  for (const order of sales) {
    for (const item of order.items) {
      const entry = productTotals.get(item.product_id) || { product_id: item.product_id, name: item.product_name, units_sold: 0, revenue: 0, profit: 0 };
      entry.units_sold += item.quantity;
      entry.revenue += Number(item.line_revenue);
      entry.profit += Number(item.line_profit);
      productTotals.set(item.product_id, entry);
    }
  }
  const topProducts = [...productTotals.values()].sort((a, b) => b.units_sold - a.units_sold).slice(0, 5);

  // Daily sales trend for charting
  const trendMap = new Map();
  for (const order of sales) {
    const day = order.created_at.slice(0, 10);
    const entry = trendMap.get(day) || { date: day, revenue: 0, profit: 0, orders: 0 };
    entry.revenue += Number(order.total);
    entry.profit += Number(order.gross_profit);
    entry.orders += 1;
    trendMap.set(day, entry);
  }
  const salesTrend = [...trendMap.values()].sort((a, b) => (a.date > b.date ? 1 : -1));

  // Expense breakdown by category, for a pie/donut chart
  const expenseByCategory = {};
  for (const e of expenses) {
    expenseByCategory[e.category] = (expenseByCategory[e.category] || 0) + Number(e.amount);
  }

  return new ApiResponse(200, {
    kpis: {
      total_revenue: totalRevenue,
      total_cogs: totalCogs,
      gross_profit: grossProfit,
      total_expenses: totalExpenses,
      net_profit: netProfit,
      inventory_value: inventoryValue,
      total_orders: sales.length,
      pending_deliveries: pendingPoRes.data.length,
      low_stock_count: lowStockItems.length,
    },
    low_stock_items: lowStockItems.slice(0, 10),
    top_products: topProducts,
    sales_trend: salesTrend,
    expense_by_category: expenseByCategory,
  }).send(res);
});

const listExpenses = asyncHandler(async (req, res) => {
  const { data, error } = await req.db
    .from('expenses')
    .select('*')
    .eq('owner_id', req.user.id)
    .order('expense_date', { ascending: false });

  if (error) throw ApiError.internal(error.message);
  return new ApiResponse(200, data).send(res);
});

const createExpense = asyncHandler(async (req, res) => {
  const { data, error } = await req.db
    .from('expenses')
    .insert({ ...req.body, owner_id: req.user.id })
    .select()
    .single();

  if (error) throw ApiError.badRequest(error.message);
  return new ApiResponse(201, data, 'Expense recorded').send(res, 201);
});

const updateExpense = asyncHandler(async (req, res) => {
  const { data, error } = await req.db
    .from('expenses')
    .update(req.body)
    .eq('id', req.params.id)
    .eq('owner_id', req.user.id)
    .select()
    .single();

  if (error) throw ApiError.badRequest(error.message);
  if (!data) throw ApiError.notFound('Expense not found');
  return new ApiResponse(200, data, 'Expense updated').send(res);
});

const removeExpense = asyncHandler(async (req, res) => {
  const { error } = await req.db
    .from('expenses')
    .delete()
    .eq('id', req.params.id)
    .eq('owner_id', req.user.id);

  if (error) throw ApiError.badRequest(error.message);
  return new ApiResponse(200, null, 'Expense deleted').send(res);
});

module.exports = { dashboard, listExpenses, createExpense, updateExpense, removeExpense };
