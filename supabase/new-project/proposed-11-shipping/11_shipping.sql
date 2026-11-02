-- ============================================================================
-- PS PERFUMES — STEP 11: shipping priced by delivery PIN code
-- Target: ps-perfumes-production (project ref pwacxxrghlglvdtclbig)
-- Status: PROPOSED. NOT APPLIED. Run only after written approval, manually, in the SQL Editor of
--         the project above, AFTER Migration 10.
--
-- What it adds
--   1. shipping_zones, shipping_pincodes and the one-row shipping_config. Admins manage them; visitors
--      cannot read them. Created EMPTY: no PIN code, charge or zone is invented here.
--   2. ps_shipping_quote(): the one shipping rule, used by both checkout functions and the quote.
--   3. get_shipping_quote(): what the checkout page shows before the order is placed.
--   4. orders.shipping_pincode and orders.shipping_rate: the PIN code and the rule that priced it.
--   5. place_order (COD) and place_order_core (Razorpay) take their shipping from ps_shipping_quote
--      and record items 4. Nothing else in either function changes.
--
-- Two modes, in shipping_config.mode
--   legacy   The current rule: free_shipping_threshold / standard_shipping_fee from store_settings,
--            defaults 1500 / 99. This is the mode after the migration, so prices do not change.
--   pincode  The delivery PIN code decides. It can be switched on only when every decision is
--            recorded (fallback, free shipping) and at least one PIN code can be delivered to.
--
-- What it does NOT change
--   Coupons, product prices, stock, order items, existing orders, mark_order_paid, the payment
--   guard and every step 10 object. place_order keeps its signature and visitors keep calling it.
--
-- Fingerprints: after this step place_order and place_order_core differ from steps 08 and 09 v2,
-- so 10_verify_readonly.sql reports them false, and 09v2_rollback.sql refuses to run. Roll this
-- step back first (11_rollback.sql), which restores both functions exactly.
--
-- One transaction: on any error nothing changes, and the file can simply be run again.
-- VERIFY: 11_verify_readonly.sql. ROLLBACK: 11_rollback.sql.
-- ============================================================================

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- ---------------------------------------------------------------------------
-- 0. Preflight (stops before any change)
-- ---------------------------------------------------------------------------
do $$
declare
  v_tables int;
  v_columns int;
  r record;
begin
  if to_regprocedure('public.finalize_payment_and_enqueue(text, text, bigint)') is null then
    raise exception 'Migration 10 is not applied. Apply it first.';
  end if;
  if to_regprocedure('public.ps_shipping_quote(text, numeric)') is not null then
    raise exception 'ps_shipping_quote already exists — step 11 appears to be applied already';
  end if;
  -- The two checkout functions are replaced, so they must be exactly those of steps 08 and 09 v2
  for r in
    select * from (values
      ('place_order(jsonb, jsonb, text, text, uuid)', 'f58df5ff55e84e958d1e27336cd82f6e'),
      ('place_order_core(jsonb, jsonb, text, text, uuid)', '11e685594045be8687ee025bcba72c8c'),
      ('mark_order_paid(text, text, bigint)', 'ae7666b99cc00a000ebe74611c4e1f24'),
      ('ps_orders_payment_guard()', 'acfa79d5e0d9f1f6adabc914cb1ba7fe')
    ) as t(sig, fp)
  loop
    if (select md5(ltrim(replace(prosrc, E'\r', ''), E'\n')) from pg_proc
        where oid = to_regprocedure('public.' || r.sig)::oid) is distinct from r.fp then
      raise exception 'public.% is missing or differs from Migrations 08 to 10. Review before continuing.', r.sig;
    end if;
  end loop;
  if (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname = 'place_order') <> 1 then
    raise exception 'Expected exactly one place_order function. Review before continuing.';
  end if;
  -- 0: first run. 3 and 2: reapplying after 11_rollback.sql, which keeps the tables and columns.
  select count(*) into v_tables from pg_class
   where oid in (to_regclass('public.shipping_zones'), to_regclass('public.shipping_pincodes'),
                 to_regclass('public.shipping_config'));
  if v_tables not in (0, 3) then
    raise exception 'Only % of the 3 shipping tables exist. Review before continuing.', v_tables;
  end if;
  select count(*) into v_columns from information_schema.columns
   where table_schema = 'public' and table_name = 'orders' and column_name in ('shipping_pincode', 'shipping_rate');
  if v_columns not in (0, 2) then
    raise exception 'Only % of the 2 shipping columns exist on orders. Review before continuing.', v_columns;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. Tables (created empty; the owner enters every PIN code and charge)
-- ---------------------------------------------------------------------------
create table if not exists public.shipping_zones (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(trim(name)) between 1 and 80),
  charge     numeric(12, 2) not null check (charge >= 0),
  is_active  boolean not null default true,
  notes      text check (notes is null or char_length(notes) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists shipping_zones_name_key on public.shipping_zones (lower(trim(name)));

create table if not exists public.shipping_pincodes (
  id             uuid primary key default gen_random_uuid(),
  pincode        text not null unique check (pincode ~ '^[1-9][0-9]{5}$'),
  is_serviceable boolean not null default true,
  -- Its own charge, or blank to use its zone's charge
  charge         numeric(12, 2) check (charge is null or charge >= 0),
  zone_id        uuid references public.shipping_zones (id) on delete restrict,
  is_active      boolean not null default true,
  notes          text check (notes is null or char_length(notes) <= 500),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint shipping_pincodes_needs_charge check (not is_serviceable or charge is not null or zone_id is not null)
);
create index if not exists shipping_pincodes_zone_id_idx on public.shipping_pincodes (zone_id) where zone_id is not null;

-- One row. Null means "not decided yet", and pincode mode refuses to start while anything is.
create table if not exists public.shipping_config (
  id                      boolean primary key default true check (id),
  mode                    text not null default 'legacy' check (mode in ('legacy', 'pincode')),
  fallback_allowed        boolean,
  fallback_charge         numeric(12, 2) check (fallback_charge is null or fallback_charge >= 0),
  free_shipping_rule      text check (free_shipping_rule in ('none', 'subtotal_threshold')),
  free_shipping_threshold numeric(12, 2) check (free_shipping_threshold is null or free_shipping_threshold > 0),
  updated_at              timestamptz not null default now(),
  constraint shipping_config_fallback_needs_charge check (fallback_allowed is distinct from true or fallback_charge is not null),
  constraint shipping_config_threshold_needs_amount check (
    free_shipping_rule is distinct from 'subtotal_threshold' or free_shipping_threshold is not null),
  constraint shipping_config_pincode_mode_decided check (
    mode = 'legacy' or (fallback_allowed is not null and free_shipping_rule is not null))
);
insert into public.shipping_config (id) values (true) on conflict (id) do nothing;

comment on table public.shipping_pincodes is
  'Delivery PIN codes: serviceable or explicitly not, with a charge or a zone. Used only in pincode mode.';
comment on table public.shipping_config is
  'Shipping mode and the owner''s decisions. Null decision = not decided, which keeps pincode mode off.';

drop trigger if exists ps_set_updated_at on public.shipping_zones;
create trigger ps_set_updated_at before update on public.shipping_zones
  for each row execute function public.ps_set_updated_at();
drop trigger if exists ps_set_updated_at on public.shipping_pincodes;
create trigger ps_set_updated_at before update on public.shipping_pincodes
  for each row execute function public.ps_set_updated_at();
drop trigger if exists ps_set_updated_at on public.shipping_config;
create trigger ps_set_updated_at before update on public.shipping_config
  for each row execute function public.ps_set_updated_at();

-- Not part of the guarded payment columns: a record of how shipping was priced
alter table public.orders
  add column if not exists shipping_pincode text,
  add column if not exists shipping_rate    jsonb;

-- ---------------------------------------------------------------------------
-- 2. Access: admins manage the tables, visitors see only quotes
-- ---------------------------------------------------------------------------
alter table public.shipping_zones enable row level security;
alter table public.shipping_pincodes enable row level security;
alter table public.shipping_config enable row level security;
revoke all on public.shipping_zones, public.shipping_pincodes, public.shipping_config
  from public, anon, authenticated, service_role;
grant select, insert, update, delete on public.shipping_zones, public.shipping_pincodes to authenticated;
-- The single config row is never added or removed
grant select, update on public.shipping_config to authenticated;

drop policy if exists ps_admin_manage_shipping_zones on public.shipping_zones;
create policy ps_admin_manage_shipping_zones on public.shipping_zones
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists ps_admin_manage_shipping_pincodes on public.shipping_pincodes;
create policy ps_admin_manage_shipping_pincodes on public.shipping_pincodes
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists ps_admin_manage_shipping_config on public.shipping_config;
create policy ps_admin_manage_shipping_config on public.shipping_config
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- 3. The shipping rule
-- ---------------------------------------------------------------------------

-- At least one PIN code can be delivered to, by its own row or by the approved fallback
create function public.ps_shipping_ready(p_fallback_allowed boolean)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(p_fallback_allowed, false)
      or exists (select 1 from public.shipping_pincodes p
                   left join public.shipping_zones z on z.id = p.zone_id
                  where p.is_active and p.is_serviceable
                    and (p.charge is not null or coalesce(z.is_active, false)));
$$;

-- Returns { ok, amount, ... } or { ok: false, message } written for shoppers. p_subtotal is the
-- item total before any coupon, as the legacy rule has always used.
create function public.ps_shipping_quote(p_pincode text, p_subtotal numeric)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  c         public.shipping_config%rowtype;
  v_threshold numeric := 1500;
  v_fee       numeric := 99;
  v_raw       text;
  v_pin     text := trim(coalesce(p_pincode, ''));
  v_sub     numeric := greatest(coalesce(p_subtotal, 0), 0);
  p         record;
  v_charge  numeric;
  v_source  text;
  v_free    boolean := false;
begin
  select * into c from public.shipping_config where id;

  if not found or c.mode = 'legacy' then
    -- Exactly the rule of steps 02 to 09 v2
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
    return jsonb_build_object('ok', true, 'source', 'legacy',
                              'amount', case when v_sub >= v_threshold then 0 else v_fee end);
  end if;

  if v_pin !~ '^[1-9][0-9]{5}$' then
    return jsonb_build_object('ok', false, 'message', 'Please enter a valid 6-digit PIN code.');
  end if;

  select sp.id, sp.is_serviceable, sp.charge, sp.zone_id, z.name as zone_name, z.charge as zone_charge,
         coalesce(z.is_active, false) as zone_active
    into p
  from public.shipping_pincodes sp
  left join public.shipping_zones z on z.id = sp.zone_id
  where sp.pincode = v_pin and sp.is_active;

  if found then
    if not p.is_serviceable then
      return jsonb_build_object('ok', false, 'message',
        format('Sorry, we do not deliver to PIN code %s. Please check the PIN code, or contact us for help.', v_pin));
    end if;
    if p.charge is not null then
      v_charge := p.charge; v_source := 'pincode';
    elsif p.zone_active then
      v_charge := p.zone_charge; v_source := 'zone';
    end if;
  elsif c.fallback_allowed then
    v_charge := c.fallback_charge; v_source := 'fallback';
  end if;

  -- Not listed and no approved fallback, or listed under a zone that is switched off
  if v_charge is null then
    return jsonb_build_object('ok', false, 'message',
      format('Sorry, we do not deliver to PIN code %s yet. Please check the PIN code, or contact us for help.', v_pin));
  end if;

  if c.free_shipping_rule = 'subtotal_threshold' and v_sub >= c.free_shipping_threshold then
    v_free := true;
  end if;

  return jsonb_strip_nulls(jsonb_build_object(
    'ok', true,
    'source', v_source,
    'amount', case when v_free then 0 else v_charge end,
    'base_charge', v_charge,
    'free_shipping_applied', v_free,
    'pincode', v_pin,
    'pincode_rate_id', case when v_source in ('pincode', 'zone') then p.id end,
    'zone_id', case when v_source = 'zone' then p.zone_id end,
    'zone_name', case when v_source = 'zone' then p.zone_name end));
end;
$$;

-- The checkout page's preview. Shows a charge and a message, never the rate rows behind them.
-- p_subtotal only decides free shipping on the page; checkout prices it again from the database.
create function public.get_shipping_quote(p_pincode text default null, p_subtotal numeric default 0)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  c public.shipping_config%rowtype;
  v_mode text;
  v_quote jsonb;
  v_base jsonb;
begin
  select * into c from public.shipping_config where id;
  v_mode := case when found then c.mode else 'legacy' end;
  v_base := jsonb_build_object(
    'mode', v_mode,
    'free_shipping_threshold',
      case when v_mode = 'pincode' and c.free_shipping_rule = 'subtotal_threshold' then c.free_shipping_threshold end);

  if v_mode = 'pincode' and trim(coalesce(p_pincode, '')) = '' then
    return v_base || jsonb_build_object('ok', false, 'needs_pincode', true,
                                        'message', 'Enter your PIN code to see the delivery charge.');
  end if;

  v_quote := public.ps_shipping_quote(p_pincode, least(greatest(coalesce(p_subtotal, 0), 0), 10000000));
  return v_base || jsonb_build_object('ok', (v_quote ->> 'ok')::boolean,
                                      'amount', v_quote -> 'amount',
                                      'message', v_quote -> 'message');
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Guards: pincode mode never runs without a decision or a deliverable PIN code
-- ---------------------------------------------------------------------------
create function public.ps_shipping_config_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- An open decision is reported by shipping_config_pincode_mode_decided instead
  if new.mode = 'pincode' and new.fallback_allowed is not null and new.free_shipping_rule is not null
     and not public.ps_shipping_ready(new.fallback_allowed) then
    raise exception 'PIN code shipping needs at least one active, serviceable PIN code with a charge, or an approved fallback charge.';
  end if;
  return new;
end;
$$;

drop trigger if exists ps_shipping_config_guard on public.shipping_config;
create trigger ps_shipping_config_guard
  before insert or update on public.shipping_config
  for each row execute function public.ps_shipping_config_guard();

create function public.ps_shipping_rates_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if exists (select 1 from public.shipping_config where id and mode = 'pincode')
     and not public.ps_shipping_ready((select fallback_allowed from public.shipping_config where id)) then
    raise exception 'This change would leave no PIN code that can be delivered to. Add or reactivate one first, or switch shipping back to the standard rule.';
  end if;
  return null;
end;
$$;

drop trigger if exists ps_shipping_rates_guard on public.shipping_pincodes;
create trigger ps_shipping_rates_guard
  after insert or update or delete on public.shipping_pincodes
  for each statement execute function public.ps_shipping_rates_guard();
drop trigger if exists ps_shipping_rates_guard on public.shipping_zones;
create trigger ps_shipping_rates_guard
  after insert or update or delete on public.shipping_zones
  for each statement execute function public.ps_shipping_rates_guard();

-- ---------------------------------------------------------------------------
-- 5. Checkout functions. Changes from steps 08 and 09 v2 are marked "11:".
-- ---------------------------------------------------------------------------
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
  v_shipping  numeric := 0;
  v_quote     jsonb; -- 11
  v_discount  numeric := 0;
  v_total     numeric;
  v_coupon    jsonb;
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

  -- 3. Shipping. 11: priced by ps_shipping_quote, the same rule the checkout page quotes ---------
  v_quote := public.ps_shipping_quote(v_pincode, v_subtotal);
  if not coalesce((v_quote ->> 'ok')::boolean, false) then
    raise exception '%', coalesce(v_quote ->> 'message', 'Delivery is not available for this PIN code.');
  end if;
  v_shipping := (v_quote ->> 'amount')::numeric;

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
    payment_method, payment_status, order_status, notes, idempotency_key,
    shipping_pincode, shipping_rate) -- 11
  values (
    v_order_id, v_number, null, v_first || ' ' || v_last, v_email, v_phone,
    jsonb_build_object('address', v_address, 'city', v_city, 'state', v_state, 'pincode', v_pincode,
                       'landmark', v_landmark, 'email', v_email, 'phone', v_phone),
    v_subtotal, v_shipping, v_discount, v_total,
    'COD', 'pending', 'pending',
    case when v_code <> '' then 'Coupon: ' || v_code || ' (redeemed)' else null end,
    p_idempotency_key,
    v_pincode, v_quote - 'ok'); -- 11

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
  v_shipping  numeric := 0;
  v_quote     jsonb; -- 11
  v_discount  numeric := 0;
  v_total     numeric;
  v_coupon    jsonb;
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

  -- 3. Shipping. 11: priced by ps_shipping_quote, the same rule the checkout page quotes ---------
  v_quote := public.ps_shipping_quote(v_pincode, v_subtotal);
  if not coalesce((v_quote ->> 'ok')::boolean, false) then
    raise exception '%', coalesce(v_quote ->> 'message', 'Delivery is not available for this PIN code.');
  end if;
  v_shipping := (v_quote ->> 'amount')::numeric;

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
    payment_method, payment_status, order_status, notes, idempotency_key, coupon_code,
    shipping_pincode, shipping_rate) -- 11
  values (
    v_order_id, v_number, null, v_first || ' ' || v_last, v_email, v_phone,
    jsonb_build_object('address', v_address, 'city', v_city, 'state', v_state, 'pincode', v_pincode,
                       'landmark', v_landmark, 'email', v_email, 'phone', v_phone),
    v_subtotal, v_shipping, v_discount, v_total,
    v_method, 'pending', 'pending',
    case when v_code <> '' then 'Coupon: ' || v_code else null end,
    p_idempotency_key,
    nullif(v_code, ''),
    v_pincode, v_quote - 'ok'); -- 11

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
-- 6. Privileges
-- ---------------------------------------------------------------------------
revoke all on function public.ps_shipping_ready(boolean) from public, anon, authenticated, service_role;
revoke all on function public.ps_shipping_quote(text, numeric) from public, anon, authenticated, service_role;
revoke all on function public.ps_shipping_config_guard() from public, anon, authenticated, service_role;
revoke all on function public.ps_shipping_rates_guard() from public, anon, authenticated, service_role;
revoke all on function public.get_shipping_quote(text, numeric) from public, anon, authenticated, service_role;
grant execute on function public.get_shipping_quote(text, numeric) to anon, authenticated, service_role;
-- create or replace keeps both checkout functions' grants; they are checked below

-- ---------------------------------------------------------------------------
-- 7. Post-conditions (any failure undoes everything above)
-- ---------------------------------------------------------------------------
do $$
declare
  v_sig text;
begin
  if (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname = 'place_order') <> 1
     or (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname = 'place_order_core') <> 1 then
    raise exception 'Checkout function signature check failed — rolling back';
  end if;
  if not has_function_privilege('anon', 'public.place_order(jsonb, jsonb, text, text, uuid)', 'EXECUTE')
     or not has_function_privilege('anon', 'public.get_shipping_quote(text, numeric)', 'EXECUTE') then
    raise exception 'Visitors lost checkout or the shipping quote — rolling back';
  end if;
  if has_function_privilege('anon', 'public.place_order_core(jsonb, jsonb, text, text, uuid)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.place_order_core(jsonb, jsonb, text, text, uuid)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.place_order_core(jsonb, jsonb, text, text, uuid)', 'EXECUTE') then
    raise exception 'Wrong privileges on place_order_core — rolling back';
  end if;
  foreach v_sig in array array['public.ps_shipping_ready(boolean)', 'public.ps_shipping_quote(text, numeric)',
                               'public.ps_shipping_config_guard()', 'public.ps_shipping_rates_guard()'] loop
    if has_function_privilege('anon', v_sig, 'EXECUTE') or has_function_privilege('authenticated', v_sig, 'EXECUTE')
       or has_function_privilege('service_role', v_sig, 'EXECUTE') then
      raise exception 'Wrong privileges on % — rolling back', v_sig;
    end if;
  end loop;
  if has_table_privilege('anon', 'public.shipping_pincodes', 'SELECT,INSERT,UPDATE,DELETE')
     or has_table_privilege('anon', 'public.shipping_zones', 'SELECT,INSERT,UPDATE,DELETE')
     or has_table_privilege('anon', 'public.shipping_config', 'SELECT,INSERT,UPDATE,DELETE')
     or has_table_privilege('authenticated', 'public.shipping_config', 'INSERT,DELETE') then
    raise exception 'Shipping tables have the wrong grants — rolling back';
  end if;
  if (select count(*) from public.shipping_config) <> 1 then
    raise exception 'shipping_config must hold exactly one row — rolling back';
  end if;
end $$;

notify pgrst, 'reload schema';

commit;
