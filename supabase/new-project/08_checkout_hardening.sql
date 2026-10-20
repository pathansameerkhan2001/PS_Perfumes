-- ============================================================================
-- PS PERFUMES — NEW PROJECT, STEP 8: checkout hardening (combo validation + idempotency)
-- Target: ps-perfumes-production (project ref pwacxxrghlglvdtclbig)
-- Status: NOT APPLIED. Prepared for review. Run only after written approval, manually, in the
--         SQL Editor of the project above. Requires 01 and 02 (place_order 4-argument version).
--
-- Run 08_preflight_readonly.sql first and continue only if every ok_* column is true.
--
-- What it changes
--   1. orders.idempotency_key (uuid, nullable) + a partial UNIQUE index on it.
--      Existing orders keep NULL; nothing else in the table changes.
--   2. Replaces place_order(jsonb, jsonb, text, text) with
--      place_order(jsonb, jsonb, text, text, uuid default null). The 4-argument call used by
--      the current frontend still works (the new parameter is optional). Behaviour is the same
--      as step 02 except:
--        a. Combo lines are refused when the combo is inactive, has no price, has no products,
--           contains a product that is missing or inactive, or has less stock than requested.
--        b. Stock is checked against the TOTAL quantity per variant / combo in the order, so
--           splitting one item over several lines cannot bypass the limit.
--        c. Locking: before any line is priced, every referenced product_variants row and then
--           every referenced combos row is locked FOR UPDATE, each set in ascending id order.
--           All checkouts take row locks in this one global order (advisory key lock → variants
--           by id → combos by id → coupon row), so two checkouts cannot deadlock on each other.
--        d. Idempotency: with p_idempotency_key, the first call creates the order; any later
--           call with the same key returns that order (flag "replayed": true) without
--           re-validating, re-counting the coupon or touching stock. Concurrent calls with the
--           same key are serialised with a transaction-scoped advisory lock, and the UNIQUE
--           index is the final guard. A replay is answered only when the e-mail matches the
--           stored order, so the key alone never reveals an order.
--      Stock is still CHECKED, NOT DECREMENTED (unchanged from step 02; the store adjusts stock
--      in Admin → Inventory). To decrement stock at checkout instead, set
--      c_decrement_stock := true below before running — an owner decision; with it, replays
--      still never decrement twice because they return before any write.
--
-- What it does NOT change
--   No table other than orders, no row, no RLS policy, no Storage policy, no other function.
--   Visitors still cannot read orders; place_order stays SECURITY DEFINER and is the only way
--   visitors can create an order.
--
-- Signatures
--   Exactly one place_order exists before (the 4-argument one; the preflight below stops
--   otherwise) and exactly one after (the 5-argument one; an assertion before COMMIT rolls
--   everything back otherwise).
--
-- After applying
--   Do NOT re-run 02_auth_functions_rls.sql: it would re-create the 4-argument place_order next
--   to the new one (two overloads; 4-argument calls become ambiguous, PGRST203). If 02 is ever
--   re-run by mistake, remove the extra overload afterwards (after review):
--     drop function public.place_order(jsonb, jsonb, text, text);
--   02_check_readonly.sql and 05_verify.sql look for the 4-argument signature and will report
--   it missing; that is expected after this step (state_check_readonly.sql handles both).
--
-- One transaction: on any error nothing changes.
-- ROLLBACK: see the end of this file.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 0. Preflight (stops before any change)
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.orders') is null or to_regclass('public.order_items') is null
     or to_regclass('public.combos') is null or to_regclass('public.combo_items') is null
     or to_regclass('public.product_variants') is null or to_regclass('public.products') is null
     or to_regclass('public.coupons') is null or to_regclass('public.store_settings') is null then
    raise exception 'Expected tables not found — wrong project, or 01_schema.sql not applied';
  end if;
  if to_regprocedure('public.validate_coupon(text, numeric)') is null then
    raise exception 'public.validate_coupon(text, numeric) not found — apply 02_auth_functions_rls.sql first';
  end if;
  if to_regprocedure('public.place_order(jsonb, jsonb, text, text)') is null then
    raise exception 'public.place_order(jsonb, jsonb, text, text) not found — apply 02_auth_functions_rls.sql first';
  end if;
  if to_regprocedure('public.place_order(jsonb, jsonb, text, text, uuid)') is not null then
    raise exception 'place_order(…, uuid) already exists — step 08 appears to be applied already';
  end if;
  if (select count(*) from pg_proc
      where pronamespace = 'public'::regnamespace and proname = 'place_order') <> 1 then
    raise exception 'Expected exactly one place_order function (the 4-argument one); found: %. Review before continuing.',
      (select string_agg('place_order(' || pg_get_function_identity_arguments(oid) || ')', ', ')
         from pg_proc where pronamespace = 'public'::regnamespace and proname = 'place_order');
  end if;
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'orders' and column_name = 'idempotency_key') then
    raise exception 'orders.idempotency_key already exists — review before continuing';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. Idempotency key on orders (nullable: existing orders and old clients are unaffected)
-- ---------------------------------------------------------------------------
alter table public.orders add column idempotency_key uuid;
comment on column public.orders.idempotency_key is
  'Checkout attempt key sent by the storefront; a retry with the same key returns this order (place_order).';
create unique index orders_idempotency_key_key
  on public.orders (idempotency_key) where idempotency_key is not null;

-- ---------------------------------------------------------------------------
-- 2. place_order with combo validation, per-order stock totals and idempotency
--    (the 4-argument version is dropped in the same transaction, so there is never a moment
--    without a checkout function, and never two overloads)
-- ---------------------------------------------------------------------------
drop function public.place_order(jsonb, jsonb, text, text);

create function public.place_order(
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

-- Same privileges as step 02: visitors and signed-in users may call it; nothing else changes
revoke all on function public.place_order(jsonb, jsonb, text, text, uuid) from public, anon, authenticated;
grant execute on function public.place_order(jsonb, jsonb, text, text, uuid) to anon, authenticated;

-- Post-condition: exactly one place_order remains, and it is the 5-argument one
do $$
begin
  if (select count(*) from pg_proc
      where pronamespace = 'public'::regnamespace and proname = 'place_order') <> 1
     or to_regprocedure('public.place_order(jsonb, jsonb, text, text, uuid)') is null then
    raise exception 'place_order signature check failed after migration — rolling back';
  end if;
end $$;

-- Make the Data API see the new signature immediately (sent at COMMIT)
notify pgrst, 'reload schema';

commit;

-- ============================================================================
-- VERIFY (read-only, after COMMIT)
--   select to_regprocedure('public.place_order(jsonb, jsonb, text, text, uuid)') is not null as new_fn,
--          to_regprocedure('public.place_order(jsonb, jsonb, text, text)')       is null     as old_fn_gone,
--          (select count(*) from pg_proc where pronamespace = 'public'::regnamespace
--             and proname = 'place_order')                                       = 1         as one_signature,
--          (select count(*) from public.orders where idempotency_key is not null)          as keyed_orders;
--   Then, on the Preview deployment:
--     1. Place one COD test order; Admin → Orders shows exactly one new order.
--     2. DevTools → Network: block or throttle after submitting, retry Place Order with the same
--        bag; the same order number is shown and still only one order exists.
--     3. Try a combo with stock 0, or containing an inactive product: checkout refuses it.
--   Cancel the test orders afterwards (Admin → Orders → status "cancelled").
--
-- ROLLBACK (manual, after approval; one transaction; restores the step 02 function)
--   Checkout keeps working throughout: the drop and the re-create commit together.
--   begin;
--   drop function if exists public.place_order(jsonb, jsonb, text, text, uuid);
--   -- paste here the complete "create or replace function public.place_order(...)" block from
--   -- section 3 of 02_auth_functions_rls.sql (unchanged), then:
--   revoke all on function public.place_order(jsonb, jsonb, text, text) from public, anon, authenticated;
--   grant execute on function public.place_order(jsonb, jsonb, text, text) to anon, authenticated;
--   do $$ begin
--     if (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname = 'place_order') <> 1
--        or to_regprocedure('public.place_order(jsonb, jsonb, text, text)') is null then
--       raise exception 'rollback signature check failed — nothing changed';
--     end if;
--   end $$;
--   notify pgrst, 'reload schema';
--   commit;
--   Orders placed while 08 was active stay as they are (their idempotency_key values remain).
--   The idempotency_key column and its index can stay (harmless, ignored by the old function).
--   To remove them as well (only the stored keys are lost, no orders):
--     drop index if exists public.orders_idempotency_key_key;
--     alter table public.orders drop column if exists idempotency_key;
--   The frontend keeps working after a rollback: it retries the call without the key.
-- ============================================================================
