-- =============================================================================
-- CURRENCY MANAGEMENT MIGRATION
-- Add global currency support to Invory
-- =============================================================================

-- 1. Create supported_currencies table
create table if not exists supported_currencies (
  code           text primary key,  -- e.g., 'USD', 'PHP', 'EUR'
  name           text not null,     -- e.g., 'United States Dollar'
  symbol         text not null,     -- e.g., '$', '₱', '€'
  locale         text not null,     -- e.g., 'en-US', 'fil-PH', 'de-DE'
  decimal_places integer not null default 2,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now()
);

-- 2. Create system_settings table for app-wide configuration
create table if not exists system_settings (
  id                    uuid primary key default gen_random_uuid(),
  base_currency         text not null default 'PHP' references supported_currencies(code),
  display_mode          text not null default 'display_only' check (display_mode in ('display_only', 'automatic_conversion')),
  auto_update_rates     boolean not null default true,
  rates_last_updated    timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- 3. Create exchange_rates table for storing historical rates
create table if not exists exchange_rates (
  id              uuid primary key default gen_random_uuid(),
  from_currency   text not null references supported_currencies(code),
  to_currency     text not null references supported_currencies(code),
  rate            numeric(18,6) not null check (rate > 0),
  rate_source     text not null default 'open_exchange_rates', -- source of the rate
  recorded_at     timestamptz not null default now(),
  unique (from_currency, to_currency, recorded_at)
);

-- 4. Add multi-currency support to products
alter table if exists products add column if not exists original_currency text references supported_currencies(code);
alter table if exists products add column if not exists cost_price_original numeric(12,2);
alter table if exists products add column if not exists selling_price_original numeric(12,2);

-- 5. Add multi-currency support to purchase_orders
alter table if exists purchase_orders add column if not exists original_currency text references supported_currencies(code);
alter table if exists purchase_orders add column if not exists total_cost_original numeric(12,2);

-- 6. Add multi-currency support to purchase_order_items
alter table if exists purchase_order_items add column if not exists original_currency text references supported_currencies(code);
alter table if exists purchase_order_items add column if not exists unit_cost_original numeric(12,2);

-- 7. Add multi-currency support to sales_orders
alter table if exists sales_orders add column if not exists original_currency text references supported_currencies(code);
alter table if exists sales_orders add column if not exists subtotal_original numeric(12,2);
alter table if exists sales_orders add column if not exists discount_original numeric(12,2);
alter table if exists sales_orders add column if not exists total_original numeric(12,2);
alter table if exists sales_orders add column if not exists total_cost_original numeric(12,2);

-- 8. Add multi-currency support to sales_order_items
alter table if exists sales_order_items add column if not exists original_currency text references supported_currencies(code);
alter table if exists sales_order_items add column if not exists unit_cost_original numeric(12,2);
alter table if exists sales_order_items add column if not exists unit_price_original numeric(12,2);

-- 9. Add multi-currency support to expenses
alter table if exists expenses add column if not exists original_currency text references supported_currencies(code);
alter table if exists expenses add column if not exists amount_original numeric(12,2);

-- 10. Insert supported currencies
insert into supported_currencies (code, name, symbol, locale, decimal_places) values
  ('PHP', 'Philippine Peso', '₱', 'fil-PH', 2),
  ('USD', 'United States Dollar', '$', 'en-US', 2),
  ('EUR', 'Euro', '€', 'de-DE', 2),
  ('SGD', 'Singapore Dollar', 'S$', 'en-SG', 2),
  ('JPY', 'Japanese Yen', '¥', 'ja-JP', 0),
  ('KRW', 'South Korean Won', '₩', 'ko-KR', 0)
on conflict (code) do nothing;

-- 11. Initialize system settings with default values
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM system_settings) THEN
    INSERT INTO system_settings (base_currency, display_mode)
    VALUES ('PHP', 'display_only');
  END IF;
END;
$$;

-- 12. Create indexes for performance
create index if not exists idx_exchange_rates_from_to on exchange_rates(from_currency, to_currency, recorded_at desc);
create index if not exists idx_exchange_rates_timestamp on exchange_rates(recorded_at desc);

-- 13. Update trigger for system_settings
drop trigger if exists trg_system_settings_updated_at on system_settings;
create trigger trg_system_settings_updated_at before update on system_settings
  for each row execute function set_updated_at();

-- 14. Enforce single row in system_settings via trigger
create or replace function enforce_single_system_setting()
returns trigger as $$
begin
  if (select count(*) from system_settings) >= 1 and new.id != (select id from system_settings limit 1) then
    raise exception 'Only one system settings row is allowed';
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_enforce_single_setting on system_settings;
create trigger trg_enforce_single_setting before insert on system_settings
  for each row execute function enforce_single_system_setting();
