-- ============================================================================
-- PS PERFUMES — STEP 9, REVISED PROPOSAL (v2): Razorpay Standard Checkout
-- Target: ps-perfumes-production (project ref pwacxxrghlglvdtclbig)
-- Status: PROPOSED. NOT TESTED AND NOT APPLIED. It has not run on any database. It replaces the
--         tested 09_razorpay_payments.sql only if the owner approves that after testing.
--
-- What it changes
--   1. Nine new columns on orders, all nullable. No existing row is written: receipt_token gets
--      a default for new rows only, and existing orders keep NULL there.
--   2. place_order_core(): the pricing logic of step 08 for RAZORPAY orders only. Only the server
--      (service_role) may call it. The order is saved unpaid; its coupon is validated here and
--      counted only when payment succeeds.
--   3. Trigger ps_orders_payment_guard (INSERT and UPDATE): the database refuses to dispatch an
--      unpaid or refunded Razorpay order, to mark one paid without a payment id, or to un-pay a
--      paid one. COD orders pass through it unchanged.
--   4. Server-only functions: attach_razorpay_order, mark_order_paid, record_payment_failure,
--      get_payment_order, get_order_receipt, claim_order_email, release_order_email.
--
-- What it does NOT change
--   place_order, the COD checkout of step 08, stays byte-identical and is not replaced. No
--   product, variant, category, coupon, customer, order or order item row. No RLS or Storage
--   policy. No admin account. Visitors still cannot read orders.
--
-- One transaction: on any error nothing changes, and the file can simply be run again.
-- After a successful run a second run stops in the preflight and changes nothing.
-- PRE-CHECK: 09v2_precheck_readonly.sql. VERIFY: 09v2_verify_readonly.sql.
-- ROLLBACK: 09v2_rollback.sql, after the reconciliation in docs/KT/16-Razorpay-Rollback-Runbook.md.
-- ============================================================================

begin;

-- Give up quickly instead of queueing checkouts behind this migration; running it again is safe
set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- Taken first so the preflight reads a table that cannot change before the migration finishes.
-- No step below rewrites the table, so this lock is held for moments.
lock table public.orders in access exclusive mode;

-- ---------------------------------------------------------------------------
-- 0. Preflight (stops before any change)
-- ---------------------------------------------------------------------------
do $$
declare
  v_columns int;
begin
  if to_regprocedure('public.place_order(jsonb, jsonb, text, text, uuid)') is null then
    raise exception 'place_order(…, uuid) not found — apply 08_checkout_hardening.sql first';
  end if;
  if (select count(*) from pg_proc
      where pronamespace = 'public'::regnamespace and proname = 'place_order') <> 1 then
    raise exception 'Expected exactly one place_order function. Review before continuing.';
  end if;
  -- This migration leaves place_order alone, so it must really be the function of step 08
  if (select md5(ltrim(replace(prosrc, E'\r', ''), E'\n')) from pg_proc
      where oid = to_regprocedure('public.place_order(jsonb, jsonb, text, text, uuid)')::oid)
     is distinct from 'f58df5ff55e84e958d1e27336cd82f6e' then
    raise exception 'place_order differs from step 08. Review before continuing.';
  end if;
  if to_regprocedure('public.place_order_core(jsonb, jsonb, text, text, uuid)') is not null then
    raise exception 'place_order_core already exists — step 09 appears to be applied already';
  end if;
  -- 0 columns: first run. All 9: reapplying after 09_rollback.sql, which keeps them and their data.
  select count(*) into v_columns from information_schema.columns
   where table_schema = 'public' and table_name = 'orders'
     and column_name in ('razorpay_order_id', 'razorpay_payment_id', 'duplicate_payment_id', 'paid_at',
                         'payment_error', 'coupon_code', 'receipt_token',
                         'customer_email_sent_at', 'owner_email_sent_at');
  if v_columns not in (0, 9) then
    raise exception 'Only % of the 9 payment columns exist. Review before continuing.', v_columns;
  end if;
  -- Nothing here is deleted or edited: the owner reviews such rows, and the migration waits.
  -- A cancelled unpaid Razorpay order is what 09_rollback_cleanup_optional.sql leaves behind.
  if v_columns = 0 and exists (select 1 from public.orders
                               where upper(trim(coalesce(payment_method, ''))) <> 'COD'
                                 and not (payment_method = 'RAZORPAY' and order_status = 'cancelled'
                                          and payment_status in ('pending', 'failed'))) then
    raise exception 'Orders exist that are not COD orders. Review them before continuing.';
  end if;
  -- The guard would refuse every later update to such an order, including dispatch
  -- Nested: a single expression would be planned, and fail, before the columns exist
  if v_columns = 9 then
    if exists (select 1 from public.orders
               where payment_method = 'RAZORPAY' and payment_status = 'paid'
                 and (razorpay_payment_id is null or paid_at is null)) then
      raise exception 'A paid Razorpay order has no payment id or paid date. Restore that data first.';
    end if;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. Payment columns on orders (nullable, no default in ADD COLUMN: no table rewrite, no row written)
-- ---------------------------------------------------------------------------
alter table public.orders
  add column if not exists razorpay_order_id      text,
  add column if not exists razorpay_payment_id    text,
  add column if not exists duplicate_payment_id   text,
  add column if not exists paid_at                timestamptz,
  add column if not exists payment_error          text,
  add column if not exists coupon_code            text,
  add column if not exists receipt_token          uuid,
  add column if not exists customer_email_sent_at timestamptz,
  add column if not exists owner_email_sent_at    timestamptz;

-- For new rows only. In the ADD COLUMN above, this volatile default would rewrite every row.
alter table public.orders alter column receipt_token set default gen_random_uuid();

comment on column public.orders.duplicate_payment_id is
  'A second captured payment on an already paid order: refund it in the Razorpay dashboard.';
comment on column public.orders.receipt_token is
  'Private link to the receipt page; orders stay unreadable to visitors.';

create unique index if not exists orders_razorpay_order_id_key
  on public.orders (razorpay_order_id) where razorpay_order_id is not null;
create unique index if not exists orders_razorpay_payment_id_key
  on public.orders (razorpay_payment_id) where razorpay_payment_id is not null;
create unique index if not exists orders_receipt_token_key
  on public.orders (receipt_token) where receipt_token is not null;

-- ---------------------------------------------------------------------------
-- 2. Pricing for Razorpay orders: step 08 logic. Changes from step 08 are marked "09:".
-- ---------------------------------------------------------------------------
create function public.place_order_core(
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

-- ---------------------------------------------------------------------------
-- 3. Guard: holds for every writer, including the admin panel
-- ---------------------------------------------------------------------------
create or replace function public.ps_orders_payment_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  -- Signed-in admins change only the fulfilment of a Razorpay order; payment facts come from
  -- the server functions, which run as the table owner
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      if new.payment_method = 'RAZORPAY' then
        raise exception 'Razorpay orders are created only by the server.';
      end if;
      return new;
    end if;
    if (old.payment_method = 'RAZORPAY' or new.payment_method = 'RAZORPAY')
       and (new.payment_method, new.payment_status, new.razorpay_order_id, new.razorpay_payment_id,
            new.duplicate_payment_id, new.paid_at, new.subtotal, new.shipping_amount,
            new.discount_amount, new.total_amount, new.coupon_code, new.receipt_token)
           is distinct from
           (old.payment_method, old.payment_status, old.razorpay_order_id, old.razorpay_payment_id,
            old.duplicate_payment_id, old.paid_at, old.subtotal, old.shipping_amount,
            old.discount_amount, old.total_amount, old.coupon_code, old.receipt_token) then
      raise exception 'Payment details of a Razorpay order cannot be edited.';
    end if;
  end if;

  if tg_op = 'UPDATE' and old.payment_method = 'RAZORPAY' then
    if new.payment_method <> 'RAZORPAY' then
      raise exception 'The payment method of a Razorpay order cannot be changed.';
    end if;
    if new.payment_status = 'paid' and (new.razorpay_payment_id is null or new.paid_at is null) then
      raise exception 'A Razorpay order is marked paid only by a verified payment.';
    end if;
    if old.payment_status = 'paid' and new.payment_status in ('pending', 'failed') then
      raise exception 'A paid order cannot go back to unpaid.';
    end if;
    if old.payment_status = 'refunded' and new.payment_status <> 'refunded' then
      raise exception 'A refunded order cannot change payment status.';
    end if;
    if new.payment_status in ('pending', 'failed') and new.order_status not in ('pending', 'cancelled') then
      raise exception 'This order is awaiting payment and cannot be processed or dispatched.';
    end if;
    if new.payment_status = 'refunded' and new.order_status <> old.order_status and new.order_status <> 'cancelled' then
      raise exception 'A refunded order cannot be processed or dispatched.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists ps_orders_payment_guard on public.orders;
create trigger ps_orders_payment_guard
  before insert or update on public.orders
  for each row execute function public.ps_orders_payment_guard();

-- ---------------------------------------------------------------------------
-- 4. Server-only payment functions
-- ---------------------------------------------------------------------------

-- Links the Razorpay order once. Concurrent calls: the first wins and both get its id.
create function public.attach_razorpay_order(p_order_id uuid, p_razorpay_order_id text)
returns text
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_id text;
begin
  update public.orders
     set razorpay_order_id = p_razorpay_order_id
   where id = p_order_id and razorpay_order_id is null and payment_method = 'RAZORPAY';
  select razorpay_order_id into v_id from public.orders where id = p_order_id;
  return v_id;
end;
$$;

-- The only way a Razorpay order becomes paid. The caller has already confirmed the payment with
-- Razorpay; the row lock makes the browser callback and the webhook take turns.
create function public.mark_order_paid(
  p_razorpay_order_id   text,
  p_razorpay_payment_id text,
  p_amount_paise        bigint
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  o public.orders%rowtype;
begin
  select * into o from public.orders
   where razorpay_order_id = p_razorpay_order_id and payment_method = 'RAZORPAY'
   for update;
  if not found then
    return jsonb_build_object('result', 'not_found');
  end if;

  if round(o.total_amount * 100)::bigint <> p_amount_paise then
    update public.orders
       set payment_error = 'Amount mismatch: ' || p_amount_paise || ' paise on payment ' || p_razorpay_payment_id
     where id = o.id;
    return jsonb_build_object('result', 'amount_mismatch', 'order_id', o.id);
  end if;

  if o.payment_status in ('paid', 'refunded') then
    if o.razorpay_payment_id = p_razorpay_payment_id then
      return jsonb_build_object('result', 'already_paid', 'order_id', o.id);
    end if;
    -- A different payment on the same order: keep the first one and flag this one for a refund
    update public.orders
       set duplicate_payment_id = p_razorpay_payment_id
     where id = o.id and duplicate_payment_id is distinct from p_razorpay_payment_id;
    return jsonb_build_object('result', 'duplicate_payment', 'order_id', o.id,
                              'new_flag', found, 'order_number', o.order_number);
  end if;

  update public.orders
     set payment_status = 'paid',
         razorpay_payment_id = p_razorpay_payment_id,
         paid_at = now(),
         -- Cancelled while the payment was in progress: stays cancelled, flagged for a refund
         order_status = case when o.order_status = 'cancelled' then 'cancelled' else 'confirmed' end,
         payment_error = case when o.order_status = 'cancelled'
                              then 'Paid after the order was cancelled: review and refund'
                              else null end
   where id = o.id;

  -- Honoured even if the limit was reached meanwhile: the shopper has already paid this price
  if o.coupon_code is not null then
    update public.coupons
       set used_count = coalesce(used_count, 0) + 1
     where upper(code) = o.coupon_code;
    update public.orders set notes = 'Coupon: ' || o.coupon_code || ' (redeemed)' where id = o.id;
  end if;

  return jsonb_build_object('result', 'paid', 'order_id', o.id);
end;
$$;

-- A failed attempt is not final: the shopper may retry on the same Razorpay order. Never touches
-- a paid order, so a late failure event cannot undo a success.
create function public.record_payment_failure(p_razorpay_order_id text, p_reason text)
returns boolean
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
begin
  update public.orders
     set payment_status = 'failed', payment_error = left(coalesce(p_reason, 'Payment failed'), 500)
   where razorpay_order_id = p_razorpay_order_id
     and payment_method = 'RAZORPAY'
     and payment_status in ('pending', 'failed');
  return found;
end;
$$;

create function public.get_payment_order(p_razorpay_order_id text)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select (to_jsonb(o) - 'idempotency_key') || jsonb_build_object('items', coalesce((
           select jsonb_agg(to_jsonb(i) order by i.created_at, i.id)
           from public.order_items i where i.order_id = o.id), '[]'::jsonb))
  from public.orders o
  where o.razorpay_order_id = p_razorpay_order_id;
$$;

-- Paid orders only; the token comes from the customer's receipt link or the admin panel
create or replace function public.get_order_receipt(p_token uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
           'order_number', o.order_number,
           'customer_name', o.customer_name,
           'customer_email', o.customer_email,
           'customer_phone', o.customer_phone,
           'shipping_address', o.shipping_address,
           'subtotal', o.subtotal,
           'shipping_amount', o.shipping_amount,
           'discount_amount', o.discount_amount,
           'total_amount', o.total_amount,
           'payment_method', o.payment_method,
           'payment_status', o.payment_status,
           'order_status', o.order_status,
           'razorpay_payment_id', o.razorpay_payment_id,
           'paid_at', o.paid_at,
           'created_at', o.created_at,
           'receipt_token', o.receipt_token,
           'order_items', coalesce((
             select jsonb_agg(jsonb_build_object(
                      'product_name', i.product_name, 'bottle_type', i.bottle_type, 'size_ml', i.size_ml,
                      'quantity', i.quantity, 'unit_price', i.unit_price, 'total_price', i.total_price)
                      order by i.created_at, i.id)
             from public.order_items i where i.order_id = o.id), '[]'::jsonb))
  from public.orders o
  where o.receipt_token = p_token and o.payment_status = 'paid';
$$;

-- Exactly one caller wins each e-mail, whether the browser callback or the webhook gets there first
create function public.claim_order_email(p_order_id uuid, p_kind text)
returns boolean
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
begin
  if p_kind = 'customer' then
    update public.orders set customer_email_sent_at = now()
     where id = p_order_id and customer_email_sent_at is null;
  elsif p_kind = 'owner' then
    update public.orders set owner_email_sent_at = now()
     where id = p_order_id and owner_email_sent_at is null;
  else
    raise exception 'Unknown e-mail kind';
  end if;
  return found;
end;
$$;

-- A failed send gives the claim back, so the next webhook delivery can try again
create function public.release_order_email(p_order_id uuid, p_kind text)
returns void
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
begin
  if p_kind = 'customer' then
    update public.orders set customer_email_sent_at = null where id = p_order_id;
  elsif p_kind = 'owner' then
    update public.orders set owner_email_sent_at = null where id = p_order_id;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Privileges: everything here is for the server only; place_order is not touched
-- ---------------------------------------------------------------------------
revoke all on function public.place_order_core(jsonb, jsonb, text, text, uuid) from public, anon, authenticated;
revoke all on function public.attach_razorpay_order(uuid, text) from public, anon, authenticated;
revoke all on function public.mark_order_paid(text, text, bigint) from public, anon, authenticated;
revoke all on function public.record_payment_failure(text, text) from public, anon, authenticated;
revoke all on function public.get_payment_order(text) from public, anon, authenticated;
revoke all on function public.get_order_receipt(uuid) from public, anon, authenticated;
revoke all on function public.claim_order_email(uuid, text) from public, anon, authenticated;
revoke all on function public.release_order_email(uuid, text) from public, anon, authenticated;
revoke all on function public.ps_orders_payment_guard() from public, anon, authenticated;

grant execute on function public.place_order_core(jsonb, jsonb, text, text, uuid) to service_role;
grant execute on function public.attach_razorpay_order(uuid, text) to service_role;
grant execute on function public.mark_order_paid(text, text, bigint) to service_role;
grant execute on function public.record_payment_failure(text, text) to service_role;
grant execute on function public.get_payment_order(text) to service_role;
grant execute on function public.get_order_receipt(uuid) to service_role;
grant execute on function public.claim_order_email(uuid, text) to service_role;
grant execute on function public.release_order_email(uuid, text) to service_role;

-- Post-conditions (any failure undoes everything above)
do $$
declare
  v_sig text;
begin
  if (select count(*) from pg_proc
      where pronamespace = 'public'::regnamespace and proname = 'place_order') <> 1 then
    raise exception 'place_order signature check failed after migration — rolling back';
  end if;
  if (select md5(ltrim(replace(prosrc, E'\r', ''), E'\n')) from pg_proc
      where oid = to_regprocedure('public.place_order(jsonb, jsonb, text, text, uuid)')::oid)
     is distinct from 'f58df5ff55e84e958d1e27336cd82f6e' then
    raise exception 'place_order changed during migration — rolling back';
  end if;
  if not has_function_privilege('anon', 'public.place_order(jsonb, jsonb, text, text, uuid)', 'EXECUTE') then
    raise exception 'Visitors lost place_order — rolling back';
  end if;
  foreach v_sig in array array[
    'public.place_order_core(jsonb, jsonb, text, text, uuid)',
    'public.attach_razorpay_order(uuid, text)',
    'public.mark_order_paid(text, text, bigint)',
    'public.record_payment_failure(text, text)',
    'public.get_payment_order(text)',
    'public.get_order_receipt(uuid)',
    'public.claim_order_email(uuid, text)',
    'public.release_order_email(uuid, text)'
  ] loop
    if has_function_privilege('anon', v_sig, 'EXECUTE')
       or has_function_privilege('authenticated', v_sig, 'EXECUTE')
       or not has_function_privilege('service_role', v_sig, 'EXECUTE') then
      raise exception 'Wrong privileges on % — rolling back', v_sig;
    end if;
  end loop;
end $$;

-- Make the Data API see the new columns and functions immediately (sent at COMMIT)
notify pgrst, 'reload schema';

commit;
