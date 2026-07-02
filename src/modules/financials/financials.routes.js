const { Router } = require('express');
const { z } = require('zod');
const validate = require('../../middleware/validate');
const { requireAuth } = require('../../middleware/auth');
const controller = require('./financials.controller');

const router = Router();
router.use(requireAuth);

const expenseSchema = z.object({
  category: z.enum(['Shipping Fees', 'Handling Fees', 'Marketing', 'Supplies', 'Salary', 'Software']),
  description: z.string().min(1),
  amount: z.number().positive(),
  expense_date: z.string(),
});

const dashboardQuerySchema = z.object({
  range: z.enum(['7d', '30d', '90d', '12m']).default('30d'),
});

// GET /api/financials/dashboard?range=30d — aggregates KPIs for the home dashboard
router.get('/dashboard', validate({ query: dashboardQuerySchema }), controller.dashboard);

// Expenses CRUD — manual entries that feed into net profit calculations
router.get('/expenses', controller.listExpenses);
router.post('/expenses', validate({ body: expenseSchema }), controller.createExpense);
router.put('/expenses/:id', validate({ body: expenseSchema.partial() }), controller.updateExpense);
router.delete('/expenses/:id', controller.removeExpense);

module.exports = router;
