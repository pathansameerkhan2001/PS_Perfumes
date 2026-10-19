-- ============================================================================
-- PS PERFUMES — Server-side checkout pricing (place_order)
-- File: supabase/migrations/20261022_server_side_checkout.sql
-- Status: NOT YET APPLIED. Requires 20261019_admin_media_and_product_delete.sql first
--         (uses public.validate_coupon). Review, then run manually in the SQL Editor of
--         project jnrmmhzhhmjxefapkemv.
--
-- Problem it fixes
--   Checkout currently inserts orders/order_items directly from the browser with prices,
--   discount and total computed client-side from the cart stored in localStorage. A shopper
--   can edit that cart and place an order at any price; the only database check is
--   total_amount >= 0.
--
-- What it does
--   Creates public.place_order(p_customer jsonb, p_items jsonb, p_coupon_code text,
--   p_payment_method text). In ONE transaction it:
--     * validates customer details (name, e-mail, 10-digit phone, address, 6-digit PIN);
--     * reads the price of every line from the database (active product_variants of active
--       products, or active combos) — prices sent by the browser are ignored;
--     * rejects variant lines whose stock_quantity is lower than the requested quantity
--       (stock is checked, not decremented — same as today; the store adjusts stock in
--       Admin → Inventory);
--     * computes shipping from store_settings (free_shipping_threshold / standard_shipping_fee,
--       defaults 1500 / 99 — the same defaults as the storefront);
--     * validates the coupon with validate_coupon() and counts one use atomically;
--     * inserts the order (order_status = 'pending', payment_status = 'pending') and its items.
--   Nothing is ever marked paid: payment_method is 'COD' (no gateway is integrated).
--
--   It does NOT drop or change any policy, table or row. Direct inserts by the old frontend
--   keep working until supabase/migrations/20261023_lock_direct_order_inserts.sql is applied
--   (run that only AFTER the frontend that calls place_order is deployed).
--
-- The frontend (src/services/orders.js) calls place_order and falls back to the old direct
-- insert only when the function is not installed (PostgREST code PGRST202).
--
-- ROLLBACK: drop function if exists public.place_order(jsonb, jsonb, text, text);
-- ============================================================================

begin;

do $$
begin
  if to_regprocedure('public.validate_coupon(text, numeric)') is null then
    raise exception 'public.validate_coupon(text, numeric) not found — apply 20261019_admin_media_and_product_delete.sql first';
  end if;
  if to_regclass('public.orders') is null or to_regclass('public.order_items') is null
     or to_regclass('public.product_variants') is null or to_regclass('public.combos') is null then
    raise exception 'Expected tables orders / order_items / product_variants / combos not found — wrong project?';
  end if;
end $$;

create or replace function public.place_order(
  p_customer       jsonb,
  p_items          jsonb,
  p_coupon_code    text default null,
  p_payment_method text default 'COD'
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_first     text := trim(coalesce(p_customer ->> 'first_name', ''));
  v_last      text := trim(coalesce(p_customer ->> 'last_name', ''));
  v_email     text := lower(trim(coalesce(p_customer ->> 'email', '')));
  v_phone     text := regexp_replace(coalesce(p_customer ->> 'phone', ''), '\D', '', 'g');
  v_address   text := trim(coalesce(p_customer ->> 'address', ''));
  v_city      text := trim(coalesce(p_customer ->> 'city', ''));
  v_state     text := trim(coalesce(p_customer ->> 'state', ''));
  v_pincode   text := trim(coalesce(p_customer ->> 'pincode', ''));
  v_landmark  text := trim(coalesce(p_customer ->> 'landmark', ''));
  v_code      text := upper(trim(coalesce(p_coupon_code, '')));
  v_method    text := upper(trim(coalesce(p_payment_method, 'COD')));

  v_line      jsonb;
  v_qty       int;
  v_rows      jsonb := '[]'::jsonb;
  v_subtotal  numeric := 0;
  v_unit      numeric;
  v_threshold numeric := 1500;
  v_fee       numeric := 99;
  v_shipping  numeric := 0;
  v_discount  numeric := 0;
  v_total     numeric;
  v_coupon    jsonb;
  v_raw       text;
  v_order_id  uuid := gen_random_uuid();
  v_number    text;
  v_tries     int := 0;
  r           record;
begin
  -- 1. Customer details ---------------------------------------------------------------
  if v_first = '' or v_last = '' then
    raise exception 'Please enter your first and last name.';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Please enter a valid e-mail address.';
  end if;
  if length(v_phone) = 12 and left(v_phone, 2) = '91' then
    v_phone := right(v_phone, 10);
  end if;
  if v_phone !~ '^[6-9][0-9]{9}$' then
    raise exception 'Please enter a valid 10-digit Indian mobile number.';
  end if;
  if v_address = '' or v_city = '' or v_state = '' then
    raise exception 'Please complete the delivery address.';
  end if;
  if v_pincode !~ '^[1-9][0-9]{5}$' then
    raise exception 'Please enter a valid 6-digit PIN code.';
  end if;
  if v_method <> 'COD' then
    raise exception 'Only Cash on Delivery is available at the moment.';
  end if;

  -- 2. Lines, priced from the database ---------------------------------------------------
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Your cart is empty.';
  end if;
  if jsonb_array_length(p_items) > 50 then
    raise exception 'Too many different items in one order. Please split the order.';
  end if;

  for v_line in select * from jsonb_array_elements(p_items) loop
    begin
      v_qty := (v_line ->> 'quantity')::int;
    exception when others then
      v_qty := 0;
    end;
    if v_qty is null or v_qty < 1 or v_qty > 20 then
      raise exception 'Each item quantity must be between 1 and 20.';
    end if;

    if v_line ->> 'type' = 'combo' then
      select c.id, c.name, c.price, c.sale_price into r
      from public.combos c
      where c.id::text = v_line ->> 'combo_id' and coalesce(c.is_active, false);
      if not found then
        raise exception 'A combo in your cart is no longer available. Please remove it and try again.';
      end if;
      v_unit := case when coalesce(r.sale_price, 0) > 0 and r.sale_price < r.price then r.sale_price else r.price end;
      if coalesce(v_unit, 0) <= 0 then
        raise exception '"%" is currently unavailable.', r.name;
      end if;
      v_rows := v_rows || jsonb_build_object(
        'product_id', null, 'variant_id', null, 'product_name', r.name,
        'bottle_type', 'Combo Collection', 'size_ml', 'Complete Set',
        'quantity', v_qty, 'unit_price', v_unit, 'total_price', v_unit * v_qty);
    else
      select v.id as variant_id, v.bottle_type, v.size_ml, v.price, v.sale_price, v.stock_quantity,
             p.id as product_id, p.name
        into r
      from public.product_variants v
      join public.products p on p.id = v.product_id
      where v.id::text = v_line ->> 'variant_id'
        and coalesce(v.is_active, false)
        and coalesce(p.is_active, false);
      if not found then
        raise exception 'An item in your cart is no longer available. Please remove it and try again.';
      end if;
      -- Same rule as the storefront: the sale price when set, otherwise the price
      v_unit := case when coalesce(r.sale_price, 0) > 0 then r.sale_price else r.price end;
      if coalesce(v_unit, 0) <= 0 then
        raise exception '"%" is currently unavailable.', r.name;
      end if;
      if coalesce(r.stock_quantity, 0) < v_qty then
        if coalesce(r.stock_quantity, 0) <= 0 then
          raise exception '"%" (% %) is out of stock.', r.name, r.bottle_type, r.size_ml;
        end if;
        raise exception 'Only % left of "%" (% %).', r.stock_quantity, r.name, r.bottle_type, r.size_ml;
      end if;
      v_rows := v_rows || jsonb_build_object(
        'product_id', r.product_id, 'variant_id', r.variant_id, 'product_name', r.name,
        'bottle_type', r.bottle_type, 'size_ml', r.size_ml,
        'quantity', v_qty, 'unit_price', v_unit, 'total_price', v_unit * v_qty);
    end if;
    v_subtotal := v_subtotal + v_unit * v_qty;
  end loop;

  -- 3. Shipping from store settings (text or jsonb values) --------------------------------
  if to_regclass('public.store_settings') is not null then
    begin
      select trim(both '"' from s.setting_value::text) into v_raw
      from public.store_settings s where s.setting_key = 'free_shipping_threshold' limit 1;
      if v_raw ~ '^\s*[0-9]+(\.[0-9]+)?\s*$' then v_threshold := v_raw::numeric; end if;
      v_raw := null;
      select trim(both '"' from s.setting_value::text) into v_raw
      from public.store_settings s where s.setting_key = 'standard_shipping_fee' limit 1;
      if v_raw ~ '^\s*[0-9]+(\.[0-9]+)?\s*$' then v_fee := v_raw::numeric; end if;
    exception when others then
      null; -- keep the defaults
    end;
  end if;
  v_shipping := case when v_subtotal >= v_threshold then 0 else v_fee end;

  -- 4. Coupon (validated and counted in this transaction) ---------------------------------
  if v_code <> '' then
    v_coupon := public.validate_coupon(v_code, v_subtotal);
    if not coalesce((v_coupon ->> 'valid')::boolean, false) then
      raise exception '%', coalesce(v_coupon ->> 'message', 'Invalid promo code.');
    end if;
    v_discount := least(v_subtotal, greatest(0, coalesce((v_coupon ->> 'discount_amount')::numeric, 0)));
    update public.coupons
       set used_count = coalesce(used_count, 0) + 1, updated_at = now()
     where upper(code) = v_code
       and coalesce(is_active, false)
       and (usage_limit is null or coalesce(used_count, 0) < usage_limit);
    if not found then
      raise exception 'This promo code has reached its usage limit.';
    end if;
  end if;

  v_total := greatest(0, v_subtotal - v_discount + v_shipping);

  -- 5. Order number (unique among existing orders) ----------------------------------------
  loop
    v_tries := v_tries + 1;
    v_number := 'PS-' || (100000 + floor(random() * 900000))::int::text;
    exit when not exists (select 1 from public.orders o where o.order_number = v_number);
    if v_tries >= 10 then
      raise exception 'Could not allocate an order number. Please try again.';
    end if;
  end loop;

  -- 6. Write the order and its items ------------------------------------------------------
  insert into public.orders (
    id, order_number, customer_id, customer_name, customer_email, customer_phone,
    shipping_address, subtotal, shipping_amount, discount_amount, total_amount,
    payment_method, payment_status, order_status, notes)
  values (
    v_order_id, v_number, null, v_first || ' ' || v_last, v_email, v_phone,
    jsonb_build_object('address', v_address, 'city', v_city, 'state', v_state, 'pincode', v_pincode,
                       'landmark', v_landmark, 'email', v_email, 'phone', v_phone),
    v_subtotal, v_shipping, v_discount, v_total,
    'COD', 'pending', 'pending',
    case when v_code <> '' then 'Coupon: ' || v_code || ' (redeemed)' else null end);

  insert into public.order_items (order_id, product_id, variant_id, product_name, bottle_type, size_ml,
                                  quantity, unit_price, total_price)
  select v_order_id,
         nullif(x ->> 'product_id', '')::uuid,
         nullif(x ->> 'variant_id', '')::uuid,
         x ->> 'product_name', x ->> 'bottle_type', x ->> 'size_ml',
         (x ->> 'quantity')::int, (x ->> 'unit_price')::numeric, (x ->> 'total_price')::numeric
  from jsonb_array_elements(v_rows) as x;

  return jsonb_build_object(
    'order_id', v_order_id,
    'order_number', v_number,
    'customer_name', v_first || ' ' || v_last,
    'customer_email', v_email,
    'customer_phone', v_phone,
    'subtotal', v_subtotal,
    'shipping_amount', v_shipping,
    'discount_amount', v_discount,
    'total_amount', v_total,
    'payment_method', 'COD',
    'payment_status', 'pending',
    'order_status', 'pending',
    'items', v_rows);
end;
$$;

revoke all on function public.place_order(jsonb, jsonb, text, text) from public;
grant execute on function public.place_order(jsonb, jsonb, text, text) to anon, authenticated;

commit;

-- ============================================================================
-- VERIFY (SQL Editor; read-only except the rolled-back probe)
--   select to_regprocedure('public.place_order(jsonb, jsonb, text, text)');   -- not null
--   Then place one COD test order on the storefront and check in Admin → Orders that
--   subtotal / shipping / discount / total match the cart, then cancel the test order.
-- ============================================================================
