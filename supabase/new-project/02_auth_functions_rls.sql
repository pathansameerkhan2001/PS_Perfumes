-- ============================================================================
-- PS PERFUMES — NEW PROJECT, STEP 2 of 5: admin authorization, functions, RLS, grants
-- Target: ps-perfumes-production (project ref pwacxxrghlglvdtclbig)
-- Status: NOT APPLIED. Requires 01_schema.sql. Run only after written approval.
--
-- Derived from the reviewed (but never applied) old-project migrations:
--   20261019_admin_media_and_product_delete.sql  (is_admin, admin RPCs, coupons, safe delete)
--   20261022_server_side_checkout.sql            (place_order)
--   20261023_lock_direct_order_inserts.sql       (no direct browser inserts into orders)
-- Differences for the new project:
--   * Storage bucket is Ps-perfumes-media (admin_delete_product path parsing).
--   * Visitors cannot INSERT into orders/order_items at all; place_order() is the only way
--     to create an order, so every price comes from the database. redeem_coupon and
--     ps_order_accepts_items (only needed by the old direct-insert checkout) are not created.
--   * Exact Data API grants instead of relying on Supabase defaults.
--
-- Authorization model: a user is an administrator only if public.admin_users has an active
-- row for auth.uid() (or app_metadata.role is set, which only the service role can do).
-- No e-mail matching and no user_metadata (any signed-in user can edit their own metadata).
--
-- One transaction: on any error nothing changes.
-- Re-runnable: functions use CREATE OR REPLACE, grants/revokes are idempotent, and the
-- policies this file owns are replaced by exact name (section 8). If 02 was already applied
-- once, check with 02_check_readonly.sql first — when step2_complete = true there is no need
-- to run it again.
-- ============================================================================

begin;

do $$
begin
  if to_regclass('public.admin_users') is null or to_regclass('public.orders') is null then
    raise exception 'Run 01_schema.sql first';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. Admin checks
-- ---------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null
     and (
       exists (
         select 1 from public.admin_users au
         where au.user_id = auth.uid()
           and au.is_active
           and au.role in ('admin', 'super_admin', 'editor')
       )
       or lower(coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '')) in ('admin', 'super_admin', 'editor')
     );
$$;

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null
     and (
       exists (
         select 1 from public.admin_users au
         where au.user_id = auth.uid()
           and au.is_active
           and au.role = 'super_admin'
       )
       or lower(coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '')) = 'super_admin'
     );
$$;

-- ---------------------------------------------------------------------------
-- 2. Coupons: visitors can only ask whether one code is valid (table itself is admin-only)
-- ---------------------------------------------------------------------------
create or replace function public.validate_coupon(p_code text, p_subtotal numeric)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  c record;
  v_discount numeric;
begin
  select * into c from public.coupons
  where upper(code) = upper(trim(p_code))
  limit 1;

  if not found or not coalesce(c.is_active, false) then
    return jsonb_build_object('valid', false, 'message', 'Invalid or inactive promo code.');
  end if;
  if c.starts_at is not null and c.starts_at > now() then
    return jsonb_build_object('valid', false, 'message', 'This promo code is not active yet.');
  end if;
  if c.expires_at is not null and c.expires_at < now() then
    return jsonb_build_object('valid', false, 'message', 'This promo code has expired.');
  end if;
  if c.usage_limit is not null and coalesce(c.used_count, 0) >= c.usage_limit then
    return jsonb_build_object('valid', false, 'message', 'This promo code has reached its usage limit.');
  end if;
  if coalesce(c.minimum_order_amount, 0) > 0 and coalesce(p_subtotal, 0) < c.minimum_order_amount then
    return jsonb_build_object('valid', false,
      'message', format('A minimum order of ₹%s is required for this code.', rtrim(to_char(c.minimum_order_amount, 'FM999999990.##'), '.')),
      'minimum_order_amount', c.minimum_order_amount);
  end if;

  if lower(coalesce(c.discount_type, 'percentage')) = 'fixed' then
    v_discount := least(coalesce(c.discount_value, 0), coalesce(p_subtotal, 0));
  else
    v_discount := round(coalesce(p_subtotal, 0) * least(coalesce(c.discount_value, 0), 100) / 100);
  end if;
  v_discount := greatest(0, v_discount);

  return jsonb_build_object(
    'valid', true,
    'code', upper(c.code),
    'discount_type', lower(coalesce(c.discount_type, 'percentage')),
    'discount_value', c.discount_value,
    'minimum_order_amount', coalesce(c.minimum_order_amount, 0),
    'discount_amount', v_discount,
    'message', format('Promo code %s applied.', upper(c.code)));
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Checkout: the only way to create an order (prices, shipping, coupon from the database)
-- ---------------------------------------------------------------------------
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
  -- 1. Customer details
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

  -- 2. Lines, priced from the database
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

  -- 3. Shipping from store settings
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

  -- 4. Coupon (validated and counted in this transaction)
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

  -- 5. Order number
  loop
    v_tries := v_tries + 1;
    v_number := 'PS-' || (100000 + floor(random() * 900000))::int::text;
    exit when not exists (select 1 from public.orders o where o.order_number = v_number);
    if v_tries >= 10 then
      raise exception 'Could not allocate an order number. Please try again.';
    end if;
  end loop;

  -- 6. Write the order and its items
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

-- ---------------------------------------------------------------------------
-- 4. Safe product deletion (archives when order items, combo items or reviews reference it)
-- ---------------------------------------------------------------------------
create or replace function public.admin_delete_product(p_product_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_bucket_marker constant text := '/storage/v1/object/public/Ps-perfumes-media/';
  v_row          jsonb;
  v_notes        jsonb;
  v_variant_ids  uuid[];
  v_order_refs   bigint := 0;
  v_combo_refs   bigint := 0;
  v_review_refs  bigint := 0;
  v_candidates   text[] := '{}';
  v_paths        text[] := '{}';
  v_value        text;
  v_path         text;
  v_in_use       boolean;
  v_found        boolean;
  c              record;
begin
  if not public.is_admin() then
    raise exception 'Administrator privileges are required to delete products' using errcode = '42501';
  end if;

  select to_jsonb(p) into v_row from public.products p where p.id = p_product_id;
  if v_row is null then
    raise exception 'Product % was not found', p_product_id using errcode = 'P0002';
  end if;

  select coalesce(array_agg(v.id), '{}') into v_variant_ids
  from public.product_variants v where v.product_id = p_product_id;

  select count(*) into v_order_refs from public.order_items
  where product_id = p_product_id or variant_id = any (v_variant_ids);
  select count(*) into v_combo_refs from public.combo_items where product_id = p_product_id;
  select count(*) into v_review_refs from public.reviews where product_id = p_product_id;

  -- History exists: archive, never delete
  if v_order_refs + v_combo_refs + v_review_refs > 0 then
    update public.products set is_active = false where id = p_product_id;
    return jsonb_build_object(
      'action', 'archived', 'product_id', p_product_id, 'name', v_row ->> 'name',
      'order_item_refs', v_order_refs, 'combo_item_refs', v_combo_refs, 'review_refs', v_review_refs);
  end if;

  -- Image references owned by this product
  begin
    v_notes := v_row -> 'fragrance_notes';
    if jsonb_typeof(v_notes) = 'string' then
      v_notes := (v_notes #>> '{}')::jsonb;
    end if;
  exception when others then
    v_notes := null;
  end;

  v_candidates := array_remove(array[
    v_row ->> 'main_image_url', v_row ->> 'main_image_path',
    v_notes ->> 'glass_image', v_notes ->> 'pvc_image',
    v_notes ->> 'glass_image_path', v_notes ->> 'pvc_image_path'
  ], null);
  if jsonb_typeof(v_notes -> 'gallery_images') = 'array' then
    v_candidates := v_candidates || array(select jsonb_array_elements_text(v_notes -> 'gallery_images'));
  end if;
  select v_candidates || coalesce(array_agg(x), '{}') into v_candidates
  from public.product_images pi, unnest(array[pi.image_url, pi.image_path]) as x
  where pi.product_id = p_product_id and x is not null;

  -- Delete product-owned rows and the product atomically
  begin
    delete from public.product_images where product_id = p_product_id;
    delete from public.product_variants where product_id = p_product_id;
    delete from public.products where id = p_product_id;
  exception when foreign_key_violation then
    update public.products set is_active = false where id = p_product_id;
    return jsonb_build_object(
      'action', 'archived', 'product_id', p_product_id, 'name', v_row ->> 'name', 'reason', sqlerrm);
  end;

  -- Uploaded files under products/ that no remaining row references
  foreach v_value in array v_candidates loop
    v_path := null;
    if position(v_bucket_marker in v_value) > 0 then
      v_path := split_part(split_part(v_value, v_bucket_marker, 2), '?', 1);
    elsif v_value !~ '^(https?:|/|blob:|data:)' then
      v_path := regexp_replace(v_value, '^Ps-perfumes-media/', '');
    end if;

    continue when v_path is null or v_path = '' or split_part(v_path, '/', 1) <> 'products';
    continue when v_path = any (v_paths);

    v_in_use := false;
    for c in
      select col.table_name, col.column_name
      from information_schema.columns col
      join information_schema.tables t
        on t.table_schema = col.table_schema and t.table_name = col.table_name
      where col.table_schema = 'public'
        and t.table_type = 'BASE TABLE'
        and col.data_type in ('text', 'character varying', 'json', 'jsonb')
    loop
      execute format('select exists (select 1 from public.%I where %I::text like $1)', c.table_name, c.column_name)
        into v_found using '%' || v_path || '%';
      if v_found then
        v_in_use := true;
        exit;
      end if;
    end loop;

    if not v_in_use then
      v_paths := v_paths || v_path;
    end if;
  end loop;

  return jsonb_build_object(
    'action', 'deleted', 'product_id', p_product_id, 'name', v_row ->> 'name',
    'storage_paths', to_jsonb(v_paths));
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Admin-user management (Admin → Admin Users). Changes are super_admin only.
--    Auth users are created in Dashboard → Authentication → Users → Add user.
-- ---------------------------------------------------------------------------
create or replace function public.admin_list_admin_users()
returns table (id uuid, user_id uuid, email text, role text, is_active boolean,
               created_at timestamptz, last_sign_in_at timestamptz)
language plpgsql stable security definer set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then
    raise exception 'Administrator privileges are required' using errcode = '42501';
  end if;
  return query
    select au.id, au.user_id, u.email::text, au.role, au.is_active, au.created_at, u.last_sign_in_at
    from public.admin_users au
    left join auth.users u on u.id = au.user_id
    order by au.created_at;
end;
$$;

create or replace function public.admin_grant_admin(p_email text, p_role text)
returns uuid
language plpgsql volatile security definer set search_path = public, pg_temp
as $$
declare
  v_uid uuid;
  v_id uuid;
  v_role text := lower(coalesce(p_role, 'admin'));
begin
  if not public.is_super_admin() then
    raise exception 'Only a super_admin can grant admin access' using errcode = '42501';
  end if;
  if v_role not in ('super_admin', 'admin', 'editor') then
    raise exception 'Role must be super_admin, admin or editor';
  end if;
  select u.id into v_uid from auth.users u where lower(u.email) = lower(trim(p_email)) limit 1;
  if v_uid is null then
    raise exception 'No Supabase Auth account exists for %. Create the user first in Supabase Dashboard → Authentication → Users → Add user.', p_email
      using errcode = 'P0002';
  end if;

  insert into public.admin_users (user_id, role, is_active)
  values (v_uid, v_role, true)
  on conflict (user_id) do update set role = excluded.role, is_active = true
  returning admin_users.id into v_id;
  return v_id;
end;
$$;

create or replace function public.admin_update_admin(p_admin_id uuid, p_role text, p_is_active boolean)
returns void
language plpgsql volatile security definer set search_path = public, pg_temp
as $$
declare
  v_target record;
  v_role text;
  v_active boolean;
  v_remaining int;
begin
  if not public.is_super_admin() then
    raise exception 'Only a super_admin can change admin access' using errcode = '42501';
  end if;
  select * into v_target from public.admin_users where id = p_admin_id;
  if not found then
    raise exception 'Admin record not found' using errcode = 'P0002';
  end if;
  v_role := lower(coalesce(p_role, v_target.role));
  v_active := coalesce(p_is_active, v_target.is_active, true);
  if v_role not in ('super_admin', 'admin', 'editor') then
    raise exception 'Role must be super_admin, admin or editor';
  end if;
  if v_target.user_id = auth.uid() and (not v_active or v_role <> 'super_admin') then
    raise exception 'You cannot deactivate or demote your own account';
  end if;
  select count(*) into v_remaining from public.admin_users
  where id <> p_admin_id and is_active and role = 'super_admin';
  if (not v_active or v_role <> 'super_admin') and v_target.role = 'super_admin' and v_remaining = 0 then
    raise exception 'At least one active super_admin must remain';
  end if;
  update public.admin_users set role = v_role, is_active = v_active where id = p_admin_id;
end;
$$;

create or replace function public.admin_revoke_admin(p_admin_id uuid)
returns void
language plpgsql volatile security definer set search_path = public, pg_temp
as $$
declare
  v_target record;
  v_remaining int;
begin
  if not public.is_super_admin() then
    raise exception 'Only a super_admin can revoke admin access' using errcode = '42501';
  end if;
  select * into v_target from public.admin_users where id = p_admin_id;
  if not found then
    raise exception 'Admin record not found' using errcode = 'P0002';
  end if;
  if v_target.user_id = auth.uid() then
    raise exception 'You cannot revoke your own admin access';
  end if;
  select count(*) into v_remaining from public.admin_users
  where id <> p_admin_id and is_active and role = 'super_admin';
  if v_target.role = 'super_admin' and v_remaining = 0 then
    raise exception 'At least one active super_admin must remain';
  end if;
  delete from public.admin_users where id = p_admin_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Function privileges (Supabase grants EXECUTE on new functions to anon/authenticated
--    by default; reset and grant exactly what each caller needs)
-- ---------------------------------------------------------------------------
revoke all on function public.is_admin() from public, anon, authenticated;
revoke all on function public.is_super_admin() from public, anon, authenticated;
revoke all on function public.validate_coupon(text, numeric) from public, anon, authenticated;
revoke all on function public.place_order(jsonb, jsonb, text, text) from public, anon, authenticated;
revoke all on function public.admin_delete_product(uuid) from public, anon, authenticated;
revoke all on function public.admin_list_admin_users() from public, anon, authenticated;
revoke all on function public.admin_grant_admin(text, text) from public, anon, authenticated;
revoke all on function public.admin_update_admin(uuid, text, boolean) from public, anon, authenticated;
revoke all on function public.admin_revoke_admin(uuid) from public, anon, authenticated;
revoke all on function public.ps_set_updated_at() from public, anon, authenticated;

grant execute on function public.is_admin() to anon, authenticated, service_role;
grant execute on function public.is_super_admin() to authenticated, service_role;
grant execute on function public.validate_coupon(text, numeric) to anon, authenticated;
grant execute on function public.place_order(jsonb, jsonb, text, text) to anon, authenticated;
grant execute on function public.admin_delete_product(uuid) to authenticated;
grant execute on function public.admin_list_admin_users() to authenticated;
grant execute on function public.admin_grant_admin(text, text) to authenticated;
grant execute on function public.admin_update_admin(uuid, text, boolean) to authenticated;
grant execute on function public.admin_revoke_admin(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Table privileges (RLS below decides which rows)
--    anon: SELECT only, and only on storefront tables.
--    authenticated: DML on application tables (only admins pass the policies);
--    admin_users: SELECT only — written exclusively through the super_admin functions.
-- ---------------------------------------------------------------------------
grant usage on schema public to anon, authenticated;

grant select on public.categories, public.products, public.product_variants, public.product_images,
                public.combos, public.combo_items, public.reviews, public.hero_slides,
                public.instagram_reels, public.homepage_sections, public.store_settings
  to anon;

grant select, insert, update, delete on
  public.categories, public.products, public.product_variants, public.product_images,
  public.combos, public.combo_items, public.reviews, public.hero_slides, public.instagram_reels,
  public.homepage_sections, public.store_settings, public.coupons, public.customers,
  public.orders, public.order_items
  to authenticated;

grant select on public.admin_users to authenticated;

-- ---------------------------------------------------------------------------
-- 8. RLS policies — re-runnable
--    This file owns exactly 28 policies (ps_admin_manage_*, ps_public_read_*,
--    ps_admin_users_read_own, ps_admin_users_admin_read). On a re-run each one is dropped
--    BY EXACT NAME and recreated inside this transaction, so other sessions see either the
--    old or the new policy, never none, and RLS stays enabled throughout.
--    Any OTHER policy on these tables stops the script before anything changes: permissive
--    policies are OR-ed, so an unknown one could widen access and must be reviewed first
--    (02_check_readonly.sql lists it under policies_unexpected).
-- ---------------------------------------------------------------------------
do $$
declare
  v_list text;
begin
  select string_agg(p.tablename || '.' || p.policyname || ' (' || p.cmd || ')', ', ')
    into v_list
  from pg_policies p
  where p.schemaname = 'public'
    and p.tablename in ('admin_users', 'categories', 'products', 'product_variants', 'product_images', 'combos',
                        'combo_items', 'reviews', 'hero_slides', 'instagram_reels', 'homepage_sections',
                        'store_settings', 'coupons', 'customers', 'orders', 'order_items')
    and not (p.policyname like 'ps\_admin\_manage\_%' or p.policyname like 'ps\_public\_read\_%'
             or p.policyname in ('ps_admin_users_read_own', 'ps_admin_users_admin_read'));
  if v_list is not null then
    raise exception 'Policies not created by this file exist: %. Nothing was changed. Review them (02_check_readonly.sql) before re-running.', v_list;
  end if;
end $$;

create or replace function pg_temp.ps_policies(p_table text, p_public_read text)
returns void language plpgsql as $$
begin
  execute format('drop policy if exists %I on public.%I', 'ps_admin_manage_' || p_table, p_table);
  execute format('create policy %I on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())',
                 'ps_admin_manage_' || p_table, p_table);
  -- Removes a public-read policy left by an earlier version even when none is wanted now
  execute format('drop policy if exists %I on public.%I', 'ps_public_read_' || p_table, p_table);
  if p_public_read is not null then
    execute format('create policy %I on public.%I for select to anon, authenticated using (%s)',
                   'ps_public_read_' || p_table, p_table, p_public_read);
  end if;
end $$;

select pg_temp.ps_policies('categories',        'is_active');
select pg_temp.ps_policies('products',          'is_active');
select pg_temp.ps_policies('product_variants',
  'is_active and exists (select 1 from public.products p where p.id = product_variants.product_id and p.is_active)');
select pg_temp.ps_policies('product_images',
  'exists (select 1 from public.products p where p.id = product_images.product_id and p.is_active)');
select pg_temp.ps_policies('combos',            'is_active');
select pg_temp.ps_policies('combo_items',
  'exists (select 1 from public.combos c where c.id = combo_items.combo_id and c.is_active)');
select pg_temp.ps_policies('reviews',           'is_approved');
select pg_temp.ps_policies('hero_slides',       'is_active');
select pg_temp.ps_policies('instagram_reels',   'is_active');
select pg_temp.ps_policies('homepage_sections', 'true');
-- Only the contact / shipping keys the storefront needs are public
select pg_temp.ps_policies('store_settings',
  $$setting_key = any (array['brand_name','tagline','logo_url','contact_email','phone','address','city','state',
    'pincode','instagram_url','google_maps_url','whatsapp_url','free_shipping_threshold','standard_shipping_fee',
    'currency','currency_symbol','store_status','website_url'])$$);
-- Admin only (orders are created by place_order(), which runs as the function owner)
select pg_temp.ps_policies('coupons',     null);
select pg_temp.ps_policies('customers',   null);
select pg_temp.ps_policies('orders',      null);
select pg_temp.ps_policies('order_items', null);

-- admin_users: a signed-in user may read their own row (the admin panel reads the role);
-- admins may read all rows. No write policies.
drop policy if exists "ps_admin_users_read_own" on public.admin_users;
drop policy if exists "ps_admin_users_admin_read" on public.admin_users;
create policy "ps_admin_users_read_own" on public.admin_users
  for select to authenticated using (user_id = auth.uid());
create policy "ps_admin_users_admin_read" on public.admin_users
  for select to authenticated using (public.is_admin());

drop function pg_temp.ps_policies(text, text);

-- Refresh the Data API schema cache so new tables/functions are visible immediately (sent at commit)
notify pgrst, 'reload schema';

commit;
