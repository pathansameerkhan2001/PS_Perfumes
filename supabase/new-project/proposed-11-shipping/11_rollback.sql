-- ============================================================================
-- PS PERFUMES — ROLLBACK OF STEP 11
-- Target: ps-perfumes-production (project ref pwacxxrghlglvdtclbig)
-- Status: PROPOSED. NOT APPLIED. Run only after separate written approval, manually, in the SQL
--         Editor of the project above.
--
-- Order of work: revert the storefront and admin code first (the checkout page and Admin → Shipping
-- call get_shipping_quote and the shipping tables), then run this file. If Migration 10 or 09 v2 is
-- to be rolled back too, this file comes FIRST: 09v2_rollback.sql refuses to run while place_order
-- differs from step 08.
--
-- What it does
--   Restores place_order and place_order_core exactly as steps 08 and 09 v2 left them (checked by
--   fingerprint), so shipping is priced by the legacy rule again for every order.
--   Drops get_shipping_quote, ps_shipping_quote, ps_shipping_ready and the two guards.
--
-- What it deliberately keeps
--   shipping_zones, shipping_pincodes and shipping_config with every row, so the owner's rates are
--   not lost; orders.shipping_pincode and orders.shipping_rate with their values.
--
-- While PIN code shipping is on, this changes what customers pay. Then remove the two leading
-- dashes from the "set local" line below to confirm.
-- One transaction: on any error nothing changes.
-- To undo this rollback, run 11_shipping.sql again; it detects the kept tables and columns.
-- ============================================================================

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- set local ps.confirm_return_to_legacy_shipping = 'yes';

do $$
begin
  if to_regprocedure('public.ps_shipping_quote(text, numeric)') is null then
    raise exception 'ps_shipping_quote not found — step 11 is not applied, or was already rolled back';
  end if;
  if (select md5(ltrim(replace(prosrc, E'\r', ''), E'\n')) from pg_proc
      where oid = to_regprocedure('public.place_order(jsonb, jsonb, text, text, uuid)')::oid) is distinct from '5bb8e3ce49eafb371a0644a783c921a2'
     or (select md5(ltrim(replace(prosrc, E'\r', ''), E'\n')) from pg_proc
      where oid = to_regprocedure('public.place_order_core(jsonb, jsonb, text, text, uuid)')::oid) is distinct from 'b229458111f7d02b5e3a26f642bcdfbb' then
    raise exception 'place_order or place_order_core differs from step 11. Review before continuing.';
  end if;
  if (select mode from public.shipping_config where id) = 'pincode'
     and current_setting('ps.confirm_return_to_legacy_shipping', true) is distinct from 'yes' then
    raise exception 'PIN code shipping is on, so this rollback changes what customers pay. Confirm as the header of this file explains.';
  end if;
end $$;

-- Restored first: the new bodies no longer call ps_shipping_quote, which is dropped below
create or replace function public.place_order(
  p_customer        jsonb,
  p_items           jsonb,
  p_coupon_code     text default null,
  p_payment_method  text default 'COD',
  p_idempotency_key uuid default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  -- Owner decision (see header): false = check stock only (as in step 02)
  c_decrement_stock constant boolean := false;

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
  v_need      int;
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
  r_items     record;
  v_existing  public.orders%rowtype;
begin
  -- 0. Retry of an attempt that was already saved: return that order, change nothing ----------
  if p_idempotency_key is not null then
    -- Serialises concurrent calls with the same key until this transaction ends
    perform pg_advisory_xact_lock(hashtextextended('ps.place_order:' || p_idempotency_key::text, 0));

    select o.* into v_existing from public.orders o where o.idempotency_key = p_idempotency_key;
    if found then
      -- Answer only the shopper who placed it (the key alone never reveals an order)
      if lower(coalesce(v_existing.customer_email, '')) <> v_email then
        raise exception 'This checkout was already used for another order. Please reload the page and try again.';
      end if;
      return jsonb_build_object(
        'order_id', v_existing.id,
        'order_number', v_existing.order_number,
        'customer_name', v_existing.customer_name,
        'customer_email', v_existing.customer_email,
        'customer_phone', v_existing.customer_phone,
        'shipping_address', v_existing.shipping_address,
        'subtotal', v_existing.subtotal,
        'shipping_amount', v_existing.shipping_amount,
        'discount_amount', v_existing.discount_amount,
        'total_amount', v_existing.total_amount,
        'payment_method', v_existing.payment_method,
        'payment_status', v_existing.payment_status,
        'order_status', v_existing.order_status,
        'created_at', v_existing.created_at,
        'items', coalesce((
          select jsonb_agg(jsonb_build_object(
                   'product_id', i.product_id, 'variant_id', i.variant_id, 'product_name', i.product_name,
                   'bottle_type', i.bottle_type, 'size_ml', i.size_ml, 'quantity', i.quantity,
                   'unit_price', i.unit_price, 'total_price', i.total_price) order by i.created_at, i.id)
          from public.order_items i where i.order_id = v_existing.id), '[]'::jsonb),
        'replayed', true);
    end if;
  end if;

  -- 1. Customer details ----------------------------------------------------------------------
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

  -- 2. Lines ------------------------------------------------------------------------------
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Your cart is empty.';
  end if;
  if jsonb_array_length(p_items) > 50 then
    raise exception 'Too many different items in one order. Please split the order.';
  end if;

  -- 2a. Every quantity first (so the per-order totals below can be summed safely)
  for v_line in select * from jsonb_array_elements(p_items) loop
    -- Nested checks: the cast runs only after the text is known to be a small integer
    if jsonb_typeof(v_line) is distinct from 'object'
       or coalesce(v_line ->> 'quantity', '') !~ '^[0-9]{1,3}$' then
      raise exception 'Each item quantity must be between 1 and 20.';
    end if;
    if (v_line ->> 'quantity')::int not between 1 and 20 then
      raise exception 'Each item quantity must be between 1 and 20.';
    end if;
  end loop;

  -- 2b. Lock every stock row this order touches, ONCE and in ONE fixed order, before any line
  --     is priced or checked: all variants by ascending id, then all combos by ascending id.
  --     Every checkout locks in the same global order, so two checkouts cannot deadlock (each
  --     waits for the other instead). Rows are locked by id alone; whether they are active,
  --     priced and in stock is checked in 2c, after the lock, on the latest committed values.
  --     Re-locking a row this transaction already holds is a no-op, so 2c needs no FOR UPDATE.
  for r in
    select v.id
      from public.product_variants v
     where v.id::text in (select x ->> 'variant_id'
                            from jsonb_array_elements(p_items) x
                           where coalesce(x ->> 'type', 'variant') <> 'combo')
     order by v.id
       for update of v
  loop
    null;
  end loop;

  for r in
    select c.id
      from public.combos c
     where c.id::text in (select x ->> 'combo_id'
                            from jsonb_array_elements(p_items) x
                           where x ->> 'type' = 'combo')
     order by c.id
       for update of c
  loop
    null;
  end loop;

  -- 2c. Price and validate each line from the database (rows locked in 2b)
  for v_line in select * from jsonb_array_elements(p_items) loop
    v_qty := (v_line ->> 'quantity')::int;

    if v_line ->> 'type' = 'combo' then
      -- Locked in 2b: concurrent orders for the same combo are checked one after the other
      select c.id, c.name, c.price, c.sale_price, c.stock_quantity into r
      from public.combos c
      where c.id::text = v_line ->> 'combo_id' and coalesce(c.is_active, false);
      if not found then
        raise exception 'A combo in your cart is no longer available. Please remove it and try again.';
      end if;

      v_unit := case when coalesce(r.sale_price, 0) > 0 and r.sale_price < r.price then r.sale_price else r.price end;
      if coalesce(v_unit, 0) <= 0 then
        raise exception '"%" is currently unavailable.', r.name;
      end if;

      -- Every product in the combo must still exist and be active
      select count(*) as n_items,
             count(*) filter (where p.id is null or not coalesce(p.is_active, false)) as n_unavailable
        into r_items
      from public.combo_items ci
      left join public.products p on p.id = ci.product_id
      where ci.combo_id = r.id;
      if r_items.n_items = 0 or r_items.n_unavailable > 0 then
        raise exception '"%" is currently unavailable (it contains a product that is no longer sold). Please remove it from your bag.', r.name;
      end if;

      -- Stock against the total quantity of this combo in the whole order
      select coalesce(sum((x ->> 'quantity')::int), 0) into v_need
      from jsonb_array_elements(p_items) x
      where x ->> 'type' = 'combo' and x ->> 'combo_id' = v_line ->> 'combo_id';
      if coalesce(r.stock_quantity, 0) < v_need then
        if coalesce(r.stock_quantity, 0) <= 0 then
          raise exception '"%" is out of stock.', r.name;
        end if;
        raise exception 'Only % left of "%".', r.stock_quantity, r.name;
      end if;

      v_rows := v_rows || jsonb_build_object(
        'combo_id', r.id,
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

      -- Stock against the total quantity of this variant in the whole order
      select coalesce(sum((x ->> 'quantity')::int), 0) into v_need
      from jsonb_array_elements(p_items) x
      where coalesce(x ->> 'type', 'variant') <> 'combo' and x ->> 'variant_id' = v_line ->> 'variant_id';
      if coalesce(r.stock_quantity, 0) < v_need then
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

  -- 3. Shipping from store settings (unchanged from step 02) -------------------------------
  begin
    select trim(both '"' from s.setting_value) into v_raw
    from public.store_settings s where s.setting_key = 'free_shipping_threshold' limit 1;
    if v_raw ~ '^\s*[0-9]+(\.[0-9]+)?\s*$' then v_threshold := v_raw::numeric; end if;
    v_raw := null;
    select trim(both '"' from s.setting_value) into v_raw
    from public.store_settings s where s.setting_key = 'standard_shipping_fee' limit 1;
    if v_raw ~ '^\s*[0-9]+(\.[0-9]+)?\s*$' then v_fee := v_raw::numeric; end if;
  exception when others then
    null; -- keep the defaults
  end;
  v_shipping := case when v_subtotal >= v_threshold then 0 else v_fee end;

  -- 4. Coupon (validated and counted once, in this transaction; unchanged from step 02) ------
  if v_code <> '' then
    v_coupon := public.validate_coupon(v_code, v_subtotal);
    if not coalesce((v_coupon ->> 'valid')::boolean, false) then
      raise exception '%', coalesce(v_coupon ->> 'message', 'Invalid promo code.');
    end if;
    v_discount := least(v_subtotal, greatest(0, coalesce((v_coupon ->> 'discount_amount')::numeric, 0)));
    update public.coupons
       set used_count = coalesce(used_count, 0) + 1
     where upper(code) = v_code
       and coalesce(is_active, false)
       and (usage_limit is null or coalesce(used_count, 0) < usage_limit);
    if not found then
      raise exception 'This promo code has reached its usage limit.';
    end if;
  end if;

  v_total := greatest(0, v_subtotal - v_discount + v_shipping);

  -- 5. Order number ------------------------------------------------------------------------
  loop
    v_tries := v_tries + 1;
    v_number := 'PS-' || (100000 + floor(random() * 900000))::int::text;
    exit when not exists (select 1 from public.orders o where o.order_number = v_number);
    if v_tries >= 10 then
      raise exception 'Could not allocate an order number. Please try again.';
    end if;
  end loop;

  -- 6. Write the order and its items -------------------------------------------------------
  insert into public.orders (
    id, order_number, customer_id, customer_name, customer_email, customer_phone,
    shipping_address, subtotal, shipping_amount, discount_amount, total_amount,
    payment_method, payment_status, order_status, notes, idempotency_key)
  values (
    v_order_id, v_number, null, v_first || ' ' || v_last, v_email, v_phone,
    jsonb_build_object('address', v_address, 'city', v_city, 'state', v_state, 'pincode', v_pincode,
                       'landmark', v_landmark, 'email', v_email, 'phone', v_phone),
    v_subtotal, v_shipping, v_discount, v_total,
    'COD', 'pending', 'pending',
    case when v_code <> '' then 'Coupon: ' || v_code || ' (redeemed)' else null end,
    p_idempotency_key);

  insert into public.order_items (order_id, product_id, variant_id, product_name, bottle_type, size_ml,
                                  quantity, unit_price, total_price)
  select v_order_id,
         nullif(x ->> 'product_id', '')::uuid,
         nullif(x ->> 'variant_id', '')::uuid,
         x ->> 'product_name', x ->> 'bottle_type', x ->> 'size_ml',
         (x ->> 'quantity')::int, (x ->> 'unit_price')::numeric, (x ->> 'total_price')::numeric
  from jsonb_array_elements(v_rows) as x;

  -- 7. Optional stock decrement (off by default; rows were locked in 2b and checked in 2c)
  if c_decrement_stock then
    update public.product_variants v
       set stock_quantity = v.stock_quantity - t.qty
      from (select (x ->> 'variant_id')::uuid as id, sum((x ->> 'quantity')::int) as qty
              from jsonb_array_elements(v_rows) x
             where nullif(x ->> 'variant_id', '') is not null
             group by 1) t
     where v.id = t.id;
    update public.combos c
       set stock_quantity = c.stock_quantity - t.qty
      from (select (x ->> 'combo_id')::uuid as id, sum((x ->> 'quantity')::int) as qty
              from jsonb_array_elements(v_rows) x
             where nullif(x ->> 'combo_id', '') is not null
             group by 1) t
     where c.id = t.id;
  end if;

  return jsonb_build_object(
    'order_id', v_order_id,
    'order_number', v_number,
    'customer_name', v_first || ' ' || v_last,
    'customer_email', v_email,
    'customer_phone', v_phone,
    'shipping_address', jsonb_build_object('address', v_address, 'city', v_city, 'state', v_state,
                                           'pincode', v_pincode, 'landmark', v_landmark,
                                           'email', v_email, 'phone', v_phone),
    'subtotal', v_subtotal,
    'shipping_amount', v_shipping,
    'discount_amount', v_discount,
    'total_amount', v_total,
    'payment_method', 'COD',
    'payment_status', 'pending',
    'order_status', 'pending',
    'created_at', now(),
    'items', (select coalesce(jsonb_agg(x - 'combo_id'), '[]'::jsonb) from jsonb_array_elements(v_rows) x),
    'replayed', false);
end;
$$;
create or replace function public.place_order_core(
  p_customer        jsonb,
  p_items           jsonb,
  p_coupon_code     text default null,
  p_payment_method  text default 'RAZORPAY',
  p_idempotency_key uuid default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  -- Owner decision (see the header of step 08): false = check stock only
  c_decrement_stock constant boolean := false;

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
  v_method    text := upper(trim(coalesce(p_payment_method, 'RAZORPAY')));

  v_line      jsonb;
  v_qty       int;
  v_need      int;
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
  r_items     record;
  v_existing  public.orders%rowtype;
begin
  -- 0. Retry of an attempt that was already saved: return that order, change nothing ----------
  if p_idempotency_key is not null then
    -- Serialises concurrent calls with the same key until this transaction ends
    perform pg_advisory_xact_lock(hashtextextended('ps.place_order:' || p_idempotency_key::text, 0));

    select o.* into v_existing from public.orders o where o.idempotency_key = p_idempotency_key;
    if found then
      -- Answer only the shopper who placed it (the key alone never reveals an order)
      if lower(coalesce(v_existing.customer_email, '')) <> v_email then
        raise exception 'This checkout was already used for another order. Please reload the page and try again.';
      end if;
      -- 09: a Razorpay attempt never turns into a COD order, or the other way round
      if v_existing.payment_method <> v_method then
        raise exception 'This checkout was already started with another payment method. Please reload the page and try again.';
      end if;
      return jsonb_build_object(
        'order_id', v_existing.id,
        'order_number', v_existing.order_number,
        'customer_name', v_existing.customer_name,
        'customer_email', v_existing.customer_email,
        'customer_phone', v_existing.customer_phone,
        'shipping_address', v_existing.shipping_address,
        'subtotal', v_existing.subtotal,
        'shipping_amount', v_existing.shipping_amount,
        'discount_amount', v_existing.discount_amount,
        'total_amount', v_existing.total_amount,
        'payment_method', v_existing.payment_method,
        'payment_status', v_existing.payment_status,
        'order_status', v_existing.order_status,
        'created_at', v_existing.created_at,
        'razorpay_order_id', v_existing.razorpay_order_id, -- 09
        'receipt_token', v_existing.receipt_token,         -- 09
        'items', coalesce((
          select jsonb_agg(jsonb_build_object(
                   'product_id', i.product_id, 'variant_id', i.variant_id, 'product_name', i.product_name,
                   'bottle_type', i.bottle_type, 'size_ml', i.size_ml, 'quantity', i.quantity,
                   'unit_price', i.unit_price, 'total_price', i.total_price) order by i.created_at, i.id)
          from public.order_items i where i.order_id = v_existing.id), '[]'::jsonb),
        'replayed', true);
    end if;
  end if;

  -- 1. Customer details ----------------------------------------------------------------------
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
  -- 09: Razorpay only. COD orders stay with place_order of step 08
  if v_method <> 'RAZORPAY' then
    raise exception 'This payment method is not available.';
  end if;

  -- 2. Lines ------------------------------------------------------------------------------
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Your cart is empty.';
  end if;
  if jsonb_array_length(p_items) > 50 then
    raise exception 'Too many different items in one order. Please split the order.';
  end if;

  -- 2a. Every quantity first (so the per-order totals below can be summed safely)
  for v_line in select * from jsonb_array_elements(p_items) loop
    -- Nested checks: the cast runs only after the text is known to be a small integer
    if jsonb_typeof(v_line) is distinct from 'object'
       or coalesce(v_line ->> 'quantity', '') !~ '^[0-9]{1,3}$' then
      raise exception 'Each item quantity must be between 1 and 20.';
    end if;
    if (v_line ->> 'quantity')::int not between 1 and 20 then
      raise exception 'Each item quantity must be between 1 and 20.';
    end if;
  end loop;

  -- 2b. Lock every stock row this order touches, once and in one fixed order (see step 08)
  for r in
    select v.id
      from public.product_variants v
     where v.id::text in (select x ->> 'variant_id'
                            from jsonb_array_elements(p_items) x
                           where coalesce(x ->> 'type', 'variant') <> 'combo')
     order by v.id
       for update of v
  loop
    null;
  end loop;

  for r in
    select c.id
      from public.combos c
     where c.id::text in (select x ->> 'combo_id'
                            from jsonb_array_elements(p_items) x
                           where x ->> 'type' = 'combo')
     order by c.id
       for update of c
  loop
    null;
  end loop;

  -- 2c. Price and validate each line from the database (rows locked in 2b)
  for v_line in select * from jsonb_array_elements(p_items) loop
    v_qty := (v_line ->> 'quantity')::int;

    if v_line ->> 'type' = 'combo' then
      select c.id, c.name, c.price, c.sale_price, c.stock_quantity into r
      from public.combos c
      where c.id::text = v_line ->> 'combo_id' and coalesce(c.is_active, false);
      if not found then
        raise exception 'A combo in your cart is no longer available. Please remove it and try again.';
      end if;

      v_unit := case when coalesce(r.sale_price, 0) > 0 and r.sale_price < r.price then r.sale_price else r.price end;
      if coalesce(v_unit, 0) <= 0 then
        raise exception '"%" is currently unavailable.', r.name;
      end if;

      -- Every product in the combo must still exist and be active
      select count(*) as n_items,
             count(*) filter (where p.id is null or not coalesce(p.is_active, false)) as n_unavailable
        into r_items
      from public.combo_items ci
      left join public.products p on p.id = ci.product_id
      where ci.combo_id = r.id;
      if r_items.n_items = 0 or r_items.n_unavailable > 0 then
        raise exception '"%" is currently unavailable (it contains a product that is no longer sold). Please remove it from your bag.', r.name;
      end if;

      -- Stock against the total quantity of this combo in the whole order
      select coalesce(sum((x ->> 'quantity')::int), 0) into v_need
      from jsonb_array_elements(p_items) x
      where x ->> 'type' = 'combo' and x ->> 'combo_id' = v_line ->> 'combo_id';
      if coalesce(r.stock_quantity, 0) < v_need then
        if coalesce(r.stock_quantity, 0) <= 0 then
          raise exception '"%" is out of stock.', r.name;
        end if;
        raise exception 'Only % left of "%".', r.stock_quantity, r.name;
      end if;

      v_rows := v_rows || jsonb_build_object(
        'combo_id', r.id,
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

      -- Stock against the total quantity of this variant in the whole order
      select coalesce(sum((x ->> 'quantity')::int), 0) into v_need
      from jsonb_array_elements(p_items) x
      where coalesce(x ->> 'type', 'variant') <> 'combo' and x ->> 'variant_id' = v_line ->> 'variant_id';
      if coalesce(r.stock_quantity, 0) < v_need then
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

  -- 3. Shipping from store settings ----------------------------------------------------------
  begin
    select trim(both '"' from s.setting_value) into v_raw
    from public.store_settings s where s.setting_key = 'free_shipping_threshold' limit 1;
    if v_raw ~ '^\s*[0-9]+(\.[0-9]+)?\s*$' then v_threshold := v_raw::numeric; end if;
    v_raw := null;
    select trim(both '"' from s.setting_value) into v_raw
    from public.store_settings s where s.setting_key = 'standard_shipping_fee' limit 1;
    if v_raw ~ '^\s*[0-9]+(\.[0-9]+)?\s*$' then v_fee := v_raw::numeric; end if;
  exception when others then
    null; -- keep the defaults
  end;
  v_shipping := case when v_subtotal >= v_threshold then 0 else v_fee end;

  -- 4. Coupon --------------------------------------------------------------------------------
  if v_code <> '' then
    v_coupon := public.validate_coupon(v_code, v_subtotal);
    if not coalesce((v_coupon ->> 'valid')::boolean, false) then
      raise exception '%', coalesce(v_coupon ->> 'message', 'Invalid promo code.');
    end if;
    v_discount := least(v_subtotal, greatest(0, coalesce((v_coupon ->> 'discount_amount')::numeric, 0)));
    -- 09: the coupon is counted in mark_order_paid, so an abandoned payment uses none
  end if;

  v_total := greatest(0, v_subtotal - v_discount + v_shipping);

  -- 09: Razorpay's minimum amount is 100 paise
  if v_total < 1 then
    raise exception 'Online payment needs a total of at least ₹1. Please choose Cash on Delivery.';
  end if;

  -- 5. Order number ------------------------------------------------------------------------
  loop
    v_tries := v_tries + 1;
    v_number := 'PS-' || (100000 + floor(random() * 900000))::int::text;
    exit when not exists (select 1 from public.orders o where o.order_number = v_number);
    if v_tries >= 10 then
      raise exception 'Could not allocate an order number. Please try again.';
    end if;
  end loop;

  -- 6. Write the order and its items -------------------------------------------------------
  insert into public.orders (
    id, order_number, customer_id, customer_name, customer_email, customer_phone,
    shipping_address, subtotal, shipping_amount, discount_amount, total_amount,
    payment_method, payment_status, order_status, notes, idempotency_key, coupon_code)
  values (
    v_order_id, v_number, null, v_first || ' ' || v_last, v_email, v_phone,
    jsonb_build_object('address', v_address, 'city', v_city, 'state', v_state, 'pincode', v_pincode,
                       'landmark', v_landmark, 'email', v_email, 'phone', v_phone),
    v_subtotal, v_shipping, v_discount, v_total,
    v_method, 'pending', 'pending',
    case when v_code <> '' then 'Coupon: ' || v_code else null end,
    p_idempotency_key,
    nullif(v_code, ''));

  insert into public.order_items (order_id, product_id, variant_id, product_name, bottle_type, size_ml,
                                  quantity, unit_price, total_price)
  select v_order_id,
         nullif(x ->> 'product_id', '')::uuid,
         nullif(x ->> 'variant_id', '')::uuid,
         x ->> 'product_name', x ->> 'bottle_type', x ->> 'size_ml',
         (x ->> 'quantity')::int, (x ->> 'unit_price')::numeric, (x ->> 'total_price')::numeric
  from jsonb_array_elements(v_rows) as x;

  -- 7. Optional stock decrement (off by default; rows were locked in 2b and checked in 2c)
  if c_decrement_stock then
    update public.product_variants v
       set stock_quantity = v.stock_quantity - t.qty
      from (select (x ->> 'variant_id')::uuid as id, sum((x ->> 'quantity')::int) as qty
              from jsonb_array_elements(v_rows) x
             where nullif(x ->> 'variant_id', '') is not null
             group by 1) t
     where v.id = t.id;
    update public.combos c
       set stock_quantity = c.stock_quantity - t.qty
      from (select (x ->> 'combo_id')::uuid as id, sum((x ->> 'quantity')::int) as qty
              from jsonb_array_elements(v_rows) x
             where nullif(x ->> 'combo_id', '') is not null
             group by 1) t
     where c.id = t.id;
  end if;

  return jsonb_build_object(
    'order_id', v_order_id,
    'order_number', v_number,
    'customer_name', v_first || ' ' || v_last,
    'customer_email', v_email,
    'customer_phone', v_phone,
    'shipping_address', jsonb_build_object('address', v_address, 'city', v_city, 'state', v_state,
                                           'pincode', v_pincode, 'landmark', v_landmark,
                                           'email', v_email, 'phone', v_phone),
    'subtotal', v_subtotal,
    'shipping_amount', v_shipping,
    'discount_amount', v_discount,
    'total_amount', v_total,
    'payment_method', v_method, -- 09
    'payment_status', 'pending',
    'order_status', 'pending',
    'created_at', now(),
    'items', (select coalesce(jsonb_agg(x - 'combo_id'), '[]'::jsonb) from jsonb_array_elements(v_rows) x),
    'replayed', false);
end;
$$;
drop trigger if exists ps_shipping_config_guard on public.shipping_config;
drop trigger if exists ps_shipping_rates_guard on public.shipping_pincodes;
drop trigger if exists ps_shipping_rates_guard on public.shipping_zones;
drop function public.get_shipping_quote(text, numeric);
drop function public.ps_shipping_quote(text, numeric);
drop function public.ps_shipping_config_guard();
drop function public.ps_shipping_rates_guard();
drop function public.ps_shipping_ready(boolean);

do $$
begin
  if (select md5(ltrim(replace(prosrc, E'\r', ''), E'\n')) from pg_proc
      where oid = to_regprocedure('public.place_order(jsonb, jsonb, text, text, uuid)')::oid) is distinct from 'f58df5ff55e84e958d1e27336cd82f6e'
     or (select md5(ltrim(replace(prosrc, E'\r', ''), E'\n')) from pg_proc
      where oid = to_regprocedure('public.place_order_core(jsonb, jsonb, text, text, uuid)')::oid) is distinct from '11e685594045be8687ee025bcba72c8c' then
    raise exception 'The restored checkout functions differ from steps 08 and 09 v2 — nothing was changed';
  end if;
  if not has_function_privilege('anon', 'public.place_order(jsonb, jsonb, text, text, uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'public.place_order_core(jsonb, jsonb, text, text, uuid)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.place_order_core(jsonb, jsonb, text, text, uuid)', 'EXECUTE') then
    raise exception 'Checkout privileges changed — nothing was changed';
  end if;
  if to_regclass('public.shipping_pincodes') is null or to_regclass('public.shipping_config') is null then
    raise exception 'A shipping table is missing — nothing was changed';
  end if;
end $$;

notify pgrst, 'reload schema';

commit;
