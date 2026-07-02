-- =============================================================================
-- INVORY — Database Functions
-- These functions run each multi-table workflow as a single Postgres
-- transaction, so inventory quantities, valuations, and audit trails can
-- never drift out of sync even if the API request fails partway through.
-- Run after schema.sql.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- apply_stock_adjustment
-- Manual stock correction (recount, damage, loss, etc). Locks the product row
-- (FOR UPDATE) to prevent a race with a concurrent sale/receipt on the same
-- product, updates its quantity, and writes the audit row.
-- -----------------------------------------------------------------------------
create or replace function apply_stock_adjustment(
  p_product_id uuid,
  p_owner_id   uuid,
  p_change     integer,
  p_reason     text,
  p_notes      text,
  p_source     text default 'manual'
) returns jsonb as $$
declare
  v_new_qty integer;
begin
  update products
     set stock_quantity = stock_quantity + p_change
   where id = p_product_id and owner_id = p_owner_id
   returning stock_quantity into v_new_qty;

  if v_new_qty is null then
    raise exception 'Product not found';
  end if;

  if v_new_qty < 0 then
    raise exception 'Adjustment would result in negative stock';
  end if;

  insert into stock_adjustments (owner_id, product_id, change, resulting_qty, reason, source, notes)
  values (p_owner_id, p_product_id, p_change, v_new_qty, p_reason, p_source, p_notes);

  return jsonb_build_object('product_id', p_product_id, 'stock_quantity', v_new_qty);
end;
$$ language plpgsql security invoker;

-- -----------------------------------------------------------------------------
-- create_purchase_order
-- Inserts a PO header + its line items atomically. p_items is a JSON array:
-- [{ "product_id": "...", "quantity_ordered": 10, "unit_cost": 5.5 }, ...]
-- -----------------------------------------------------------------------------
create or replace function create_purchase_order(
  p_owner_id      uuid,
  p_supplier_id   uuid,
  p_expected_date date,
  p_notes         text,
  p_total_cost    numeric,
  p_items         jsonb
) returns jsonb as $$
declare
  v_po_id uuid;
  v_item  jsonb;
begin
  insert into purchase_orders (owner_id, supplier_id, expected_date, notes, total_cost, status)
  values (p_owner_id, p_supplier_id, p_expected_date, p_notes, p_total_cost, 'pending')
  returning id into v_po_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    insert into purchase_order_items (purchase_order_id, product_id, quantity_ordered, unit_cost)
    values (
      v_po_id,
      (v_item->>'product_id')::uuid,
      (v_item->>'quantity_ordered')::integer,
      (v_item->>'unit_cost')::numeric
    );
  end loop;

  return jsonb_build_object('id', v_po_id);
end;
$$ language plpgsql security invoker;

-- -----------------------------------------------------------------------------
-- receive_purchase_order
-- The Incoming Stock automation: marking a PO as received bumps each
-- product's stock_quantity, updates its cost_price to the latest purchase
-- cost (moving/last-cost basis for inventory valuation), logs a
-- stock_adjustments row per line, and flips the PO status. Supports partial
-- receipt via p_items (null = receive full ordered quantity for everything).
-- -----------------------------------------------------------------------------
create or replace function receive_purchase_order(
  p_po_id    uuid,
  p_owner_id uuid,
  p_items    jsonb default null
) returns jsonb as $$
declare
  v_item        record;
  v_recv_qty    integer;
  v_new_qty     integer;
  v_all_received boolean := true;
begin
  if not exists (select 1 from purchase_orders where id = p_po_id and owner_id = p_owner_id) then
    raise exception 'Purchase order not found';
  end if;

  for v_item in
    select * from purchase_order_items where purchase_order_id = p_po_id
  loop
    -- Determine how much of this line to receive: explicit override or full remaining qty
    if p_items is not null then
      select (elem->>'quantity_received')::integer into v_recv_qty
      from jsonb_array_elements(p_items) elem
      where (elem->>'item_id')::uuid = v_item.id;
      v_recv_qty := coalesce(v_recv_qty, 0);
    else
      v_recv_qty := v_item.quantity_ordered - v_item.quantity_received;
    end if;

    if v_recv_qty > 0 then
      update purchase_order_items
         set quantity_received = quantity_received + v_recv_qty
       where id = v_item.id;

      update products
         set stock_quantity = stock_quantity + v_recv_qty,
             cost_price = v_item.unit_cost -- update valuation to latest purchase cost
       where id = v_item.product_id and owner_id = p_owner_id
       returning stock_quantity into v_new_qty;

      insert into stock_adjustments (owner_id, product_id, change, resulting_qty, reason, source, source_id)
      values (p_owner_id, v_item.product_id, v_recv_qty, v_new_qty, 'purchase_received', 'purchase_order', p_po_id);
    end if;

    if (v_item.quantity_received + case when p_items is not null then v_recv_qty else 0 end) < v_item.quantity_ordered
       and p_items is not null then
      v_all_received := false;
    end if;
  end loop;

  update purchase_orders
     set status = case when v_all_received then 'received' else 'in_transit' end,
         received_at = case when v_all_received then now() else received_at end
   where id = p_po_id;

  return jsonb_build_object('id', p_po_id, 'status', case when v_all_received then 'received' else 'in_transit' end);
end;
$$ language plpgsql security invoker;

-- -----------------------------------------------------------------------------
-- create_sale_order
-- The POS checkout automation: validates & locks each product row, computes
-- COGS/revenue/profit per line (supporting an optional per-item price
-- override for adjustable markup), deducts stock, and writes the order +
-- line items + audit trail — all atomically. Raises an exception (which the
-- API surfaces as a 400) if stock is insufficient, so partial checkouts
-- never happen.
-- p_items: [{ "product_id": "...", "quantity": 2, "unit_price": 19.99 }, ...]
-- -----------------------------------------------------------------------------
create or replace function create_sale_order(
  p_owner_id        uuid,
  p_customer_name   text,
  p_customer_contact text,
  p_discount        numeric,
  p_payment_method  text,
  p_notes           text,
  p_items           jsonb
) returns jsonb as $$
declare
  v_order_id     uuid;
  v_order_number text;
  v_item         jsonb;
  v_product      products%rowtype;
  v_qty          integer;
  v_unit_price   numeric;
  v_line_cost    numeric;
  v_line_revenue numeric;
  v_subtotal     numeric := 0;
  v_total_cost   numeric := 0;
begin
  v_order_number := 'INV-' || to_char(now(), 'YYYYMMDD') || '-' || substr(gen_random_uuid()::text, 1, 6);

  insert into sales_orders (owner_id, order_number, customer_name, customer_contact, payment_method, notes, discount)
  values (p_owner_id, v_order_number, p_customer_name, p_customer_contact, p_payment_method, p_notes, p_discount)
  returning id into v_order_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    -- Lock the product row to prevent overselling under concurrent checkouts
    select * into v_product
    from products
    where id = (v_item->>'product_id')::uuid and owner_id = p_owner_id
    for update;

    if not found then
      raise exception 'Product % not found', (v_item->>'product_id');
    end if;

    v_qty := (v_item->>'quantity')::integer;

    if v_product.stock_quantity < v_qty then
      raise exception 'Insufficient stock for "%" (available: %)', v_product.name, v_product.stock_quantity;
    end if;

    v_unit_price := coalesce((v_item->>'unit_price')::numeric, v_product.selling_price);
    v_line_cost := v_product.cost_price * v_qty;
    v_line_revenue := v_unit_price * v_qty;

    insert into sales_order_items (
      sales_order_id, product_id, product_name, sku, quantity,
      unit_cost, unit_price, line_cost, line_revenue, line_profit
    ) values (
      v_order_id, v_product.id, v_product.name, v_product.sku, v_qty,
      v_product.cost_price, v_unit_price, v_line_cost, v_line_revenue, v_line_revenue - v_line_cost
    );

    update products set stock_quantity = stock_quantity - v_qty where id = v_product.id;

    insert into stock_adjustments (owner_id, product_id, change, resulting_qty, reason, source, source_id)
    values (p_owner_id, v_product.id, -v_qty, v_product.stock_quantity - v_qty, 'sale', 'sales_order', v_order_id);

    v_subtotal := v_subtotal + v_line_revenue;
    v_total_cost := v_total_cost + v_line_cost;
  end loop;

  update sales_orders
     set subtotal = v_subtotal,
         total = v_subtotal - p_discount,
         total_cost = v_total_cost,
         gross_profit = (v_subtotal - p_discount) - v_total_cost,
         margin_pct = case when (v_subtotal - p_discount) > 0
                           then round((((v_subtotal - p_discount) - v_total_cost) / (v_subtotal - p_discount)) * 100, 2)
                           else 0 end
   where id = v_order_id;

  return jsonb_build_object('id', v_order_id, 'order_number', v_order_number);
end;
$$ language plpgsql security invoker;
