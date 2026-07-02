-- =============================================================================
-- CURRENCY MANAGEMENT RLS POLICIES
-- =============================================================================

-- supported_currencies is public read (everyone can see available currencies)
alter table supported_currencies enable row level security;

create policy "supported_currencies_select" on supported_currencies
  for select using (true);

-- system_settings is admin-only (via authenticated users, controlled via controller)
alter table system_settings enable row level security;

create policy "system_settings_select" on system_settings
  for select using (auth.role() = 'authenticated');

create policy "system_settings_update_admin" on system_settings
  for update using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- exchange_rates is public read (needed for conversions)
alter table exchange_rates enable row level security;

create policy "exchange_rates_select" on exchange_rates
  for select using (true);

-- Note: Insert/update of exchange rates is handled via backend API only (service role key)
-- Regular users cannot insert or update exchange rates
