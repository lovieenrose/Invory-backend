-- =============================================================================
-- INVORY — Row Level Security Policies
-- Every table is scoped to owner_id = auth.uid(), so even if the application
-- layer has a bug, Postgres itself refuses cross-tenant reads/writes. Run
-- after schema.sql and functions.sql.
-- =============================================================================

alter table business_profiles   enable row level security;
alter table categories          enable row level security;
alter table suppliers           enable row level security;
alter table products            enable row level security;
alter table product_sets         enable row level security;
alter table product_set_items    enable row level security;
alter table stock_adjustments   enable row level security;
alter table purchase_orders     enable row level security;
alter table purchase_order_items enable row level security;
alter table sales_orders        enable row level security;
alter table sales_order_items   enable row level security;
alter table expenses            enable row level security;

-- business_profiles: a user can only see/edit their own profile
DROP POLICY IF EXISTS "own profile - select" ON business_profiles;
DROP POLICY IF EXISTS "own profile - update" ON business_profiles;
create policy "own profile - select" on business_profiles for select using (owner_id = auth.uid());
create policy "own profile - update" on business_profiles for update using (owner_id = auth.uid());

-- Generic per-table owner policies (select/insert/update/delete)
DROP POLICY IF EXISTS "categories - all" ON categories;
create policy "categories - all" on categories for all
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

DROP POLICY IF EXISTS "suppliers - all" ON suppliers;
create policy "suppliers - all" on suppliers for all
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

DROP POLICY IF EXISTS "products - all" ON products;
create policy "products - all" on products for all
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

DROP POLICY IF EXISTS "product_sets - all" ON product_sets;
create policy "product_sets - all" on product_sets for all
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

DROP POLICY IF EXISTS "product_set_items - all" ON product_set_items;
create policy "product_set_items - all" on product_set_items for all
  using (exists (
    select 1 from product_sets ps
    where ps.id = product_set_items.product_set_id and ps.owner_id = auth.uid()
  ))
  with check (exists (
    select 1 from product_sets ps
    where ps.id = product_set_items.product_set_id and ps.owner_id = auth.uid()
  ));

DROP POLICY IF EXISTS "stock_adjustments - all" ON stock_adjustments;
create policy "stock_adjustments - all" on stock_adjustments for all
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

DROP POLICY IF EXISTS "purchase_orders - all" ON purchase_orders;
create policy "purchase_orders - all" on purchase_orders for all
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

DROP POLICY IF EXISTS "sales_orders - all" ON sales_orders;
create policy "sales_orders - all" on sales_orders for all
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

DROP POLICY IF EXISTS "expenses - all" ON expenses;
create policy "expenses - all" on expenses for all
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- Line-item tables have no owner_id column themselves — scope through their
-- parent header table instead.
DROP POLICY IF EXISTS "purchase_order_items - all" ON purchase_order_items;
create policy "purchase_order_items - all" on purchase_order_items for all
  using (exists (
    select 1 from purchase_orders po
    where po.id = purchase_order_items.purchase_order_id and po.owner_id = auth.uid()
  ))
  with check (exists (
    select 1 from purchase_orders po
    where po.id = purchase_order_items.purchase_order_id and po.owner_id = auth.uid()
  ));

DROP POLICY IF EXISTS "sales_order_items - all" ON sales_order_items;
create policy "sales_order_items - all" on sales_order_items for all
  using (exists (
    select 1 from sales_orders so
    where so.id = sales_order_items.sales_order_id and so.owner_id = auth.uid()
  ))
  with check (exists (
    select 1 from sales_orders so
    where so.id = sales_order_items.sales_order_id and so.owner_id = auth.uid()
  ));
