-- =============================================================================
-- INVORY — Database Schema (Supabase / PostgreSQL)
-- Run this in the Supabase SQL editor, in order: schema.sql -> functions.sql
-- -> policies.sql
-- =============================================================================

create extension if not exists "pgcrypto"; -- for gen_random_uuid()

-- -----------------------------------------------------------------------------
-- business_profiles — 1:1 with auth.users. Every other table's owner_id
-- references auth.users(id) directly (Supabase convention), but this table
-- carries the seller's business-level info.
-- -----------------------------------------------------------------------------
create table if not exists business_profiles (
  owner_id      uuid primary key references auth.users(id) on delete cascade,
  business_name text not null,
  full_name     text,
  currency      text not null default 'PHP',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- categories
-- -----------------------------------------------------------------------------
create table if not exists categories (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  description text,
  created_at  timestamptz not null default now(),
  unique (owner_id, name)
);

-- -----------------------------------------------------------------------------
-- suppliers
-- -----------------------------------------------------------------------------
create table if not exists suppliers (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null references auth.users(id) on delete cascade,
  name            text not null,
  contact_person  text,
  email           text,
  phone           text,
  address         text,
  notes           text,
  created_at      timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- products — the core inventory table
-- -----------------------------------------------------------------------------
create table if not exists products (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null references auth.users(id) on delete cascade,
  category_id     uuid references categories(id) on delete set null,
  supplier_id     uuid references suppliers(id) on delete set null,
  name            text not null,
  sku             text not null,
  barcode         text,
  cost_price      numeric(12,2) not null default 0 check (cost_price >= 0),
  selling_price   numeric(12,2) not null default 0 check (selling_price >= 0),
  stock_quantity  integer not null default 0 check (stock_quantity >= 0),
  reorder_level   integer not null default 5 check (reorder_level >= 0),
  unit            text not null default 'pc',
  image_url       text,
  description     text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (owner_id, sku)
);

create index if not exists idx_products_owner on products(owner_id);
create index if not exists idx_products_category on products(category_id);
create index if not exists idx_products_low_stock on products(owner_id, stock_quantity, reorder_level);

-- -----------------------------------------------------------------------------
-- stock_adjustments — full audit trail for every inventory quantity change,
-- regardless of source (manual correction, purchase receipt, sale).
-- -----------------------------------------------------------------------------
create table if not exists stock_adjustments (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references auth.users(id) on delete cascade,
  product_id   uuid not null references products(id) on delete cascade,
  change       integer not null,                  -- positive = stock in, negative = stock out
  resulting_qty integer not null,
  reason       text not null,                      -- recount | damaged | lost | returned | correction | other | purchase_received | sale
  source       text not null default 'manual',     -- manual | purchase_order | sale_order
  source_id    uuid,                                -- FK-less reference to the PO or sale that caused this
  notes        text,
  created_at   timestamptz not null default now()
);

create index if not exists idx_stock_adj_product on stock_adjustments(product_id, created_at desc);

-- -----------------------------------------------------------------------------
-- purchase_orders + purchase_order_items — Incoming Stock module
-- -----------------------------------------------------------------------------
create table if not exists purchase_orders (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null references auth.users(id) on delete cascade,
  supplier_id    uuid not null references suppliers(id) on delete restrict,
  status         text not null default 'pending' check (status in ('pending', 'in_transit', 'received', 'cancelled')),
  total_cost     numeric(12,2) not null default 0,
  expected_date  date,
  received_at    timestamptz,
  notes          text,
  created_at     timestamptz not null default now()
);

create table if not exists purchase_order_items (
  id                 uuid primary key default gen_random_uuid(),
  purchase_order_id  uuid not null references purchase_orders(id) on delete cascade,
  product_id         uuid not null references products(id) on delete restrict,
  quantity_ordered   integer not null check (quantity_ordered > 0),
  quantity_received  integer not null default 0,
  unit_cost          numeric(12,2) not null default 0
);

create index if not exists idx_po_owner_status on purchase_orders(owner_id, status);
create index if not exists idx_poi_po on purchase_order_items(purchase_order_id);

-- -----------------------------------------------------------------------------
-- sales_orders + sales_order_items — Sales Tracker / POS module
-- -----------------------------------------------------------------------------
create table if not exists sales_orders (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null references auth.users(id) on delete cascade,
  order_number     text not null,
  customer_name    text,
  customer_contact text,
  subtotal         numeric(12,2) not null default 0,
  discount         numeric(12,2) not null default 0,
  total            numeric(12,2) not null default 0,
  total_cost       numeric(12,2) not null default 0, -- COGS snapshot
  gross_profit     numeric(12,2) not null default 0,
  margin_pct       numeric(6,2) not null default 0,
  payment_method   text not null default 'cash',
  notes            text,
  created_at       timestamptz not null default now(),
  unique (owner_id, order_number)
);

create table if not exists sales_order_items (
  id             uuid primary key default gen_random_uuid(),
  sales_order_id uuid not null references sales_orders(id) on delete cascade,
  product_id     uuid not null references products(id) on delete restrict,
  product_name   text not null,   -- snapshot, survives product renames/deletes
  sku            text not null,
  quantity       integer not null check (quantity > 0),
  unit_cost      numeric(12,2) not null,   -- cost snapshot at time of sale
  unit_price     numeric(12,2) not null,   -- price snapshot (supports per-item markup override)
  line_cost      numeric(12,2) not null,
  line_revenue   numeric(12,2) not null,
  line_profit    numeric(12,2) not null
);

create index if not exists idx_sales_owner_date on sales_orders(owner_id, created_at desc);
create index if not exists idx_soi_order on sales_order_items(sales_order_id);
create index if not exists idx_soi_product on sales_order_items(product_id);

-- -----------------------------------------------------------------------------
-- expenses — Financial Dashboard module
-- -----------------------------------------------------------------------------
create table if not exists expenses (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references auth.users(id) on delete cascade,
  category     text not null,
  description  text not null,
  amount       numeric(12,2) not null check (amount > 0),
  expense_date date not null,
  created_at   timestamptz not null default now()
);

create index if not exists idx_expenses_owner_date on expenses(owner_id, expense_date desc);

-- -----------------------------------------------------------------------------
-- updated_at trigger helper
-- -----------------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_products_updated_at on products;
create trigger trg_products_updated_at before update on products
  for each row execute function set_updated_at();

drop trigger if exists trg_business_profiles_updated_at on business_profiles;
create trigger trg_business_profiles_updated_at before update on business_profiles
  for each row execute function set_updated_at();
