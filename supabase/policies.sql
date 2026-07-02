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
alter table stock_adjustments   enable row level security;
alter table purchase_orders     enable row level security;
alter table purchase_order_items enable row level security;
alter table sales_orders        enable row level security;
alter table sales_order_items   enable row level security;
alter table expenses            enable row level security;

-- business_profiles: a user can only see/edit their own profile
create policy "own profile - select" on business_profiles for select using (owner_id = auth.uid());
create policy "own profile - update" on business_profiles for update using (owner_id = auth.uid());

-- Generic per-table owner policies (select/insert/update/delete)
create policy "categories - all" on categories for all
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy "suppliers - all" on suppliers for all
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy "products - all" on products for all
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy "stock_adjustments - all" on stock_adjustments for all
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy "purchase_orders - all" on purchase_orders for all
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy "sales_orders - all" on sales_orders for all
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy "expenses - all" on expenses for all
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- Line-item tables have no owner_id column themselves — scope through their
-- parent header table instead.
create policy "purchase_order_items - all" on purchase_order_items for all
  using (exists (
    select 1 from purchase_orders po
    where po.id = purchase_order_items.purchase_order_id and po.owner_id = auth.uid()
  ))
  with check (exists (
    select 1 from purchase_orders po
    where po.id = purchase_order_items.purchase_order_id and po.owner_id = auth.uid()
  ));

create policy "sales_order_items - all" on sales_order_items for all
  using (exists (
    select 1 from sales_orders so
    where so.id = sales_order_items.sales_order_id and so.owner_id = auth.uid()
  ))
  with check (exists (
    select 1 from sales_orders so
    where so.id = sales_order_items.sales_order_id and so.owner_id = auth.uid()
  ));
