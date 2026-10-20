-- ============================================================================
-- PS PERFUMES — Admin authorization, media uploads, safe product deletion,
--               admin-user management and storefront read policies
-- File: supabase/migrations/20261019_admin_media_and_product_delete.sql
-- Status: NOT YET APPLIED. Review, then run manually in the Supabase SQL Editor
--         of the production project (URL host in .env → VITE_SUPABASE_URL).
--
-- Live schema this targets (verified 2026-10-19 through the REST API with the
-- publishable key, column-existence probes only — no rows were read):
--   admin_users       (id, user_id, role, is_active, created_at, updated_at)
--   products          (id, name, slug, brand, description, short_description, category_id,
--                      main_image_url, main_image_path, fragrance_notes, ingredients,
--                      is_active, is_featured, is_bestseller, is_new_arrival, display_order, ...)
--   product_variants  (id, product_id, bottle_type, size_ml, price, sale_price,
--                      stock_quantity, sku, is_active, created_at, updated_at)
--   product_images    (id, product_id, image_url, image_path, display_order, is_primary, alt_text, created_at)
--   categories        (id, name, slug, description, image_url, image_path, display_order, is_active, ...)
--   combos            (id, name, slug, description, image_url, image_path, price, sale_price,
--                      stock_quantity, is_featured, is_active, display_order, created_at, updated_at)
--   combo_items       (id, combo_id, product_id, quantity, created_at)
--   hero_slides       (id, title, subtitle, description, button_text, button_link, image_url, image_path,
--                      mobile_image_url, mobile_image_path, display_order, is_active, created_at, updated_at)
--   instagram_reels   (id, title, instagram_url, thumbnail_url, thumbnail_path, display_order, is_active, ...)
--   homepage_sections (id, section_key, title, subtitle, description, image_url, image_path,
--                      button_text, button_link, is_active, display_order, settings, created_at, updated_at)
--   store_settings    (id, setting_key, setting_value, created_at, updated_at)
--   coupons           (id, code, description, discount_type, discount_value, minimum_order_amount,
--                      usage_limit, used_count, is_active, starts_at, expires_at, created_at, updated_at)
--   reviews           (id, product_id, customer_name, rating, title, review_text, is_approved, is_featured, ...)
--   orders            (id, order_number, customer_id, customer_name, customer_email, customer_phone,
--                      shipping_address, subtotal, shipping_amount, discount_amount, total_amount,
--                      payment_method, payment_status, order_status, notes, created_at, updated_at)
--   order_items       (id, order_id, product_id, variant_id, product_name, bottle_type, size_ml,
--                      quantity, unit_price, total_price)
--   customers         (id, email, phone, first_name, last_name, total_orders, total_spent, ...)
--   Tables that do NOT exist live: site_settings, contact_enquiries, profiles, wishlists.
--
-- What this migration does
--   1. Registers brandnix.in@gmail.com (by auth user id) as an active super_admin.
--   2. Replaces public.is_admin(): admin = active admin_users row for auth.uid(), or
--      app_metadata.role (only settable with the service role). The previous rules that
--      trusted user_metadata and e-mail patterns (admin@*, *@psperfumes.com) are removed —
--      any signed-in user could satisfy those for themselves.
--   3. Neutralises handle_admin_user_sync() if it exists (it auto-promoted e-mail domains).
--   4. Storage bucket ps-perfumes: admin-only SELECT, INSERT and DELETE in the known media
--      folders. No UPDATE policy (the app never overwrites objects). No public write/list.
--      Public visitors keep loading media through the public-bucket URL, as today.
--   5. RLS policies (additive, named ps_*) so admins can manage the catalogue/content tables
--      and storefront visitors can read only active/approved/public rows. RLS is enabled on
--      those tables if it was off. Orders: anonymous checkout may INSERT pending orders and
--      their items; only admins can read/update orders.
--   6. admin_delete_product(uuid): transactional delete that archives instead of deleting
--      when order items, combo items or reviews reference the product, and returns the
--      Storage paths that nothing else references.
--   7. Admin-user management functions (super_admin only) used by Admin → Admin Users.
--
-- It does NOT drop tables, delete rows, delete Storage objects, disable RLS, or use secrets.
-- The only policies it drops are the ones it (re)creates and the policy names written by
-- earlier repository scripts on storage.objects.
--
-- HOW TO APPLY
--   a. SQL Editor → run supabase/diagnostics/20261019_media_and_product_delete_diagnostics.sql
--      and save the full output (section 3 = rollback copy of is_admin()).
--   b. Paste this whole file → Run. It is one transaction: any error rolls everything back
--      and nothing changes. Read the NOTICE messages in the output.
--   c. Re-run the diagnostics; expected results are listed at the end of this file.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 0. Preconditions — fail before changing anything if this is the wrong database
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.admin_users') is null
     or to_regclass('public.products') is null
     or to_regclass('public.product_variants') is null then
    raise exception 'Expected tables admin_users / products / product_variants not found — wrong project?';
  end if;
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'admin_users' and column_name = 'user_id') then
    raise exception 'public.admin_users.user_id does not exist — schema differs from the verified live schema';
  end if;
  -- Columns written by section 1 and read by is_admin(); role must be plain text because the
  -- functions below compare and assign it as text (an enum/domain needs this file adapted first)
  if (select count(*) from information_schema.columns
      where table_schema = 'public' and table_name = 'admin_users'
        and column_name in ('role', 'is_active', 'updated_at')) <> 3 then
    raise exception 'public.admin_users must have role, is_active and updated_at columns (diagnostics section 11) — schema differs from the verified live schema';
  end if;
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'admin_users' and column_name = 'role'
               and data_type not in ('text', 'character varying')) then
    raise exception 'public.admin_users.role is not text (diagnostics section 11) — adapt the role comparisons in this file before applying';
  end if;
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'products' and column_name = 'is_active') then
    raise exception 'public.products.is_active does not exist — schema differs from the verified live schema';
  end if;
  if not exists (select 1 from storage.buckets where id = 'ps-perfumes') then
    raise exception 'Storage bucket ps-perfumes does not exist in this project — wrong project?';
  end if;
  if not exists (select 1 from auth.users where lower(email) = 'brandnix.in@gmail.com') then
    raise exception 'No auth user brandnix.in@gmail.com in this project — wrong project?';
  end if;
  -- "create or replace function public.is_admin()" only replaces the zero-argument version.
  -- If a version with parameters exists, a second overload would make policy calls ambiguous.
  if exists (select 1 from pg_proc
             where pronamespace = 'public'::regnamespace
               and proname in ('is_admin', 'is_super_admin')
               and pronargs > 0) then
    raise exception 'public.is_admin / is_super_admin has a version with parameters — review diagnostics section 03 before applying';
  end if;
  -- Ownership: policies on storage.objects, RLS on tables and replacing functions all require
  -- the current role to own the object or be a member of its owner role.
  if not (select pg_has_role(current_user, c.relowner, 'MEMBER') from pg_class c where c.oid = 'storage.objects'::regclass) then
    raise exception 'Current role % cannot manage policies on storage.objects (diagnostics section 00) — run as the project owner role (postgres)', current_user;
  end if;
  if exists (select 1 from pg_class c
             where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
               and c.relname in ('admin_users', 'products', 'product_variants', 'product_images', 'categories',
                                 'combos', 'combo_items', 'hero_slides', 'instagram_reels', 'homepage_sections',
                                 'reviews', 'store_settings', 'coupons', 'customers', 'orders', 'order_items')
               and not pg_has_role(current_user, c.relowner, 'MEMBER')) then
    raise exception 'Current role % does not own one of the application tables (diagnostics section 09, can_manage = false)', current_user;
  end if;
  if exists (select 1 from pg_proc p
             where p.pronamespace = 'public'::regnamespace and p.proname in ('is_admin', 'is_super_admin')
               and not pg_has_role(current_user, p.proowner, 'MEMBER')) then
    raise exception 'Current role % does not own is_admin / is_super_admin (diagnostics section 03, can_manage = false)', current_user;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. Register the primary administrator by auth user id
-- ---------------------------------------------------------------------------
do $$
declare
  v_uid uuid;
  v_role text := 'super_admin';
  v_id_has_default boolean;
begin
  select id into v_uid from auth.users
  where lower(email) = 'brandnix.in@gmail.com'
  order by created_at limit 1;

  update public.admin_users
     set role = v_role, is_active = true, updated_at = now()
   where user_id = v_uid;

  if not found then
    select column_default is not null into v_id_has_default
    from information_schema.columns
    where table_schema = 'public' and table_name = 'admin_users' and column_name = 'id';

    begin
      if coalesce(v_id_has_default, false) then
        insert into public.admin_users (user_id, role, is_active) values (v_uid, v_role, true);
      else
        insert into public.admin_users (id, user_id, role, is_active) values (gen_random_uuid(), v_uid, v_role, true);
      end if;
    exception when check_violation then
      -- role column may only allow 'admin'
      v_role := 'admin';
      if coalesce(v_id_has_default, false) then
        insert into public.admin_users (user_id, role, is_active) values (v_uid, v_role, true);
      else
        insert into public.admin_users (id, user_id, role, is_active) values (gen_random_uuid(), v_uid, v_role, true);
      end if;
    end;
  end if;
  raise notice 'Primary administrator registered in admin_users (role %).', v_role;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Strict admin checks
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
           and coalesce(au.is_active, true)
           and lower(coalesce(au.role, 'admin')) in ('admin', 'super_admin', 'editor')
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
           and coalesce(au.is_active, true)
           and lower(coalesce(au.role, '')) = 'super_admin'
       )
       or lower(coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '')) = 'super_admin'
     );
$$;

revoke all on function public.is_admin() from public;
revoke all on function public.is_super_admin() from public;
grant execute on function public.is_admin() to anon, authenticated, service_role;
grant execute on function public.is_super_admin() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Stop automatic e-mail-domain promotion (only if that trigger function exists)
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_proc
             where proname = 'handle_admin_user_sync' and pronamespace = 'public'::regnamespace) then
    execute $f$
      create or replace function public.handle_admin_user_sync()
      returns trigger language plpgsql security definer set search_path = public, pg_temp
      as $body$ begin return new; end; $body$;
    $f$;
    raise notice 'handle_admin_user_sync() neutralised.';
  end if;
end $$;

-- admin_users: any admin may read the list; writes only through the super_admin functions in
-- section 7. Remove write policies created by earlier repository scripts: they let ANY admin
-- (including editors) insert/update admin_users rows, i.e. promote themselves to super_admin.
alter table public.admin_users enable row level security;
drop policy if exists "Admin manage admin users" on public.admin_users;
drop policy if exists "Admin Users Insert Policy" on public.admin_users;
drop policy if exists "Admin Users Update Policy" on public.admin_users;
drop policy if exists "Admin Users Delete Policy" on public.admin_users;
do $$
declare r record;
begin
  for r in
    select policyname, cmd from pg_policies
    where schemaname = 'public' and tablename = 'admin_users' and cmd <> 'SELECT'
  loop
    raise notice 'REVIEW: admin_users still has a % policy "%" — admin_users should only be written through the super_admin functions.', r.cmd, r.policyname;
  end loop;
end $$;
drop policy if exists "ps_admin_users_read_own" on public.admin_users;
create policy "ps_admin_users_read_own" on public.admin_users
  for select to authenticated using (user_id = auth.uid());
drop policy if exists "ps_admin_users_admin_read" on public.admin_users;
create policy "ps_admin_users_admin_read" on public.admin_users
  for select to authenticated using (public.is_admin());

-- ---------------------------------------------------------------------------
-- 4. Storage policies for bucket ps-perfumes
-- ---------------------------------------------------------------------------
drop policy if exists "Public Read Access for ps-perfumes"  on storage.objects;
drop policy if exists "Admin Upload Access for ps-perfumes" on storage.objects;
drop policy if exists "Admin Update Access for ps-perfumes" on storage.objects;
drop policy if exists "Admin Delete Access for ps-perfumes" on storage.objects;
drop policy if exists "ps_perfumes_select_policy" on storage.objects;
drop policy if exists "ps_perfumes_insert_policy" on storage.objects;
drop policy if exists "ps_perfumes_update_policy" on storage.objects;
drop policy if exists "ps_perfumes_delete_policy" on storage.objects;
drop policy if exists "ps_perfumes_admin_select" on storage.objects;
drop policy if exists "ps_perfumes_admin_insert" on storage.objects;
drop policy if exists "ps_perfumes_admin_delete" on storage.objects;

-- SELECT: admins can read object metadata (needed by remove() and by the upload response).
create policy "ps_perfumes_admin_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'ps-perfumes' and public.is_admin());

-- INSERT: new uploads, admins only, only into the known media folders.
create policy "ps_perfumes_admin_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'ps-perfumes'
    and (storage.foldername(name))[1] = any (array['products', 'hero', 'reels', 'categories', 'combos',
                                                   'logo', 'reviews', 'homepage', 'banners'])
    and public.is_admin()
  );

-- DELETE: cleanup of media nothing references any more, admins only.
create policy "ps_perfumes_admin_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'ps-perfumes'
    and (storage.foldername(name))[1] = any (array['products', 'hero', 'reels', 'categories', 'combos',
                                                   'logo', 'reviews', 'homepage', 'banners'])
    and public.is_admin()
  );

do $$
declare r record;
begin
  for r in
    select policyname, permissive, cmd, roles::text as roles
    from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname not in ('ps_perfumes_admin_select', 'ps_perfumes_admin_insert', 'ps_perfumes_admin_delete')
      and (permissive = 'RESTRICTIVE'
           or coalesce(qual, '') ilike '%ps-perfumes%'
           or coalesce(with_check, '') ilike '%ps-perfumes%')
  loop
    raise notice 'REVIEW existing storage policy % (%, %, roles %) — not changed by this migration.',
      r.policyname, r.permissive, r.cmd, r.roles;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Table policies (additive). Helper is dropped again at the end of the script.
-- ---------------------------------------------------------------------------
create or replace function pg_temp.ps_policies(
  p_table text,
  p_public_read text,       -- USING expression for anon+authenticated SELECT, or null for none
  p_admin_manage boolean    -- admin FOR ALL policy
) returns void language plpgsql as $$
begin
  if to_regclass('public.' || p_table) is null then
    raise notice 'Table public.% not found — skipped.', p_table;
    return;
  end if;
  execute format('alter table public.%I enable row level security', p_table);
  if p_admin_manage then
    execute format('drop policy if exists %I on public.%I', 'ps_admin_manage_' || p_table, p_table);
    execute format('create policy %I on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())',
                   'ps_admin_manage_' || p_table, p_table);
  end if;
  if p_public_read is not null then
    execute format('drop policy if exists %I on public.%I', 'ps_public_read_' || p_table, p_table);
    execute format('create policy %I on public.%I for select to anon, authenticated using (%s)',
                   'ps_public_read_' || p_table, p_table, p_public_read);
  end if;
end $$;

-- Older names created by the previous draft of this file
drop policy if exists "ps_admin_manage_variants" on public.product_variants;
drop policy if exists "ps_public_read_active_variants" on public.product_variants;
drop policy if exists "ps_public_read_active_products" on public.products;

select pg_temp.ps_policies('products',          'is_active = true', true);
select pg_temp.ps_policies('product_variants',  'is_active = true', true);
select pg_temp.ps_policies('product_images',
  'exists (select 1 from public.products p where p.id = product_images.product_id and p.is_active = true)', true);
select pg_temp.ps_policies('categories',        'is_active = true', true);
select pg_temp.ps_policies('combos',            'is_active = true', true);
select pg_temp.ps_policies('combo_items',
  'exists (select 1 from public.combos c where c.id = combo_items.combo_id and c.is_active = true)', true);
select pg_temp.ps_policies('hero_slides',       'is_active = true', true);
select pg_temp.ps_policies('instagram_reels',   'is_active = true', true);
select pg_temp.ps_policies('homepage_sections', 'true', true);
select pg_temp.ps_policies('reviews',           'is_approved = true', true);
-- Only the contact / shipping keys the storefront needs are public
select pg_temp.ps_policies('store_settings',
  $$setting_key = any (array['brand_name','tagline','logo_url','contact_email','phone','address','city','state',
    'pincode','instagram_url','google_maps_url','whatsapp_url','free_shipping_threshold','standard_shipping_fee',
    'currency','currency_symbol','store_status','website_url'])$$, true);
select pg_temp.ps_policies('coupons',           null, true);
select pg_temp.ps_policies('customers',         null, true);
select pg_temp.ps_policies('orders',            null, true);
select pg_temp.ps_policies('order_items',       null, true);

-- Anonymous checkout: may create pending, unpaid orders and add items to an order that was
-- created in the last 30 minutes and is still pending. Never read, change or delete them.
create or replace function public.ps_order_accepts_items(p_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.orders o
    where o.id = p_order_id
      and o.order_status = 'pending'
      and o.created_at > now() - interval '30 minutes'
  );
$$;
revoke all on function public.ps_order_accepts_items(uuid) from public;
grant execute on function public.ps_order_accepts_items(uuid) to anon, authenticated;

do $$
begin
  if to_regclass('public.orders') is not null then
    drop policy if exists "ps_checkout_insert_orders" on public.orders;
    create policy "ps_checkout_insert_orders" on public.orders
      for insert to anon, authenticated
      with check (
        order_status = 'pending'
        and payment_status = 'pending'
        and (customer_id is null or customer_id = auth.uid())
        and coalesce(total_amount, 0) >= 0
      );
  end if;
  if to_regclass('public.order_items') is not null then
    drop policy if exists "ps_checkout_insert_order_items" on public.order_items;
    create policy "ps_checkout_insert_order_items" on public.order_items
      for insert to anon, authenticated
      with check (
        quantity > 0
        and coalesce(unit_price, 0) >= 0
        and public.ps_order_accepts_items(order_id)
      );
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 5b. Coupons at checkout. Visitors cannot read the coupons table (admin only); they can
--     only ask whether one code is valid for a subtotal, and redeem it after placing an order.
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

-- Counts one use of a code. Only allowed once per order, for a pending order created in the
-- last 30 minutes whose notes record that code, so the counter cannot be exhausted by
-- arbitrary or repeated calls. The order note is marked "(redeemed)".
create or replace function public.redeem_coupon(p_code text, p_order_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_updated int;
begin
  update public.orders o
     set notes = coalesce(o.notes, '') || ' (redeemed)'
   where o.id = p_order_id
     and o.order_status = 'pending'
     and o.created_at > now() - interval '30 minutes'
     and coalesce(o.notes, '') ilike '%coupon: ' || upper(trim(p_code)) || '%'
     and coalesce(o.notes, '') not ilike '%(redeemed)%';
  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    return false;
  end if;

  update public.coupons
     set used_count = coalesce(used_count, 0) + 1, updated_at = now()
   where upper(code) = upper(trim(p_code))
     and coalesce(is_active, false)
     and (usage_limit is null or coalesce(used_count, 0) < usage_limit);
  return found;
end;
$$;

revoke all on function public.validate_coupon(text, numeric) from public;
revoke all on function public.redeem_coupon(text, uuid) from public;
grant execute on function public.validate_coupon(text, numeric) to anon, authenticated;
grant execute on function public.redeem_coupon(text, uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. Safe product deletion
-- ---------------------------------------------------------------------------
create or replace function public.admin_delete_product(p_product_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
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

  if to_regclass('public.order_items') is not null then
    execute 'select count(*) from public.order_items where product_id = $1 or variant_id = any ($2)'
      into v_order_refs using p_product_id, v_variant_ids;
  end if;
  if to_regclass('public.combo_items') is not null then
    execute 'select count(*) from public.combo_items where product_id = $1'
      into v_combo_refs using p_product_id;
  end if;
  if to_regclass('public.reviews') is not null then
    execute 'select count(*) from public.reviews where product_id = $1'
      into v_review_refs using p_product_id;
  end if;

  -- History exists: archive, never delete
  if v_order_refs + v_combo_refs + v_review_refs > 0 then
    update public.products set is_active = false, updated_at = now() where id = p_product_id;
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
  if to_regclass('public.product_images') is not null then
    execute 'select coalesce(array_agg(x), ''{}'') from public.product_images pi,
               unnest(array[pi.image_url::text, pi.image_path::text]) as x
             where pi.product_id = $1 and x is not null'
      into v_paths using p_product_id;
    v_candidates := v_candidates || v_paths;
    v_paths := '{}';
  end if;

  -- Delete product-owned rows and the product atomically
  begin
    if to_regclass('public.product_images') is not null then
      execute 'delete from public.product_images where product_id = $1' using p_product_id;
    end if;
    delete from public.product_variants where product_id = p_product_id;
    delete from public.products where id = p_product_id;
  exception when foreign_key_violation then
    update public.products set is_active = false, updated_at = now() where id = p_product_id;
    return jsonb_build_object(
      'action', 'archived', 'product_id', p_product_id, 'name', v_row ->> 'name', 'reason', sqlerrm);
  end;

  -- Uploaded files under products/ that no remaining row references
  foreach v_value in array v_candidates loop
    v_path := null;
    if v_value like '%/storage/v1/object/public/ps-perfumes/%' then
      v_path := split_part(split_part(v_value, '/storage/v1/object/public/ps-perfumes/', 2), '?', 1);
    elsif v_value !~ '^(https?:|/|blob:|data:)' then
      v_path := regexp_replace(v_value, '^ps-perfumes/', '');
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
        and (col.data_type in ('text', 'character varying', 'json', 'jsonb')
             or (col.data_type = 'ARRAY' and col.udt_name in ('_text', '_varchar')))
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

revoke all on function public.admin_delete_product(uuid) from public, anon;
grant execute on function public.admin_delete_product(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Admin-user management (Admin → Admin Users). super_admin only for changes.
--    Users must already exist in Supabase Auth (Dashboard → Authentication → Add user);
--    the browser cannot create Auth users without the secret key, by design.
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
    select au.id, au.user_id, u.email::text, au.role::text, coalesce(au.is_active, true),
           au.created_at, u.last_sign_in_at
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

  update public.admin_users set role = v_role, is_active = true, updated_at = now()
   where user_id = v_uid returning admin_users.id into v_id;
  if v_id is null then
    if exists (select 1 from information_schema.columns
               where table_schema = 'public' and table_name = 'admin_users'
                 and column_name = 'id' and column_default is not null) then
      insert into public.admin_users (user_id, role, is_active)
      values (v_uid, v_role, true) returning admin_users.id into v_id;
    else
      insert into public.admin_users (id, user_id, role, is_active)
      values (gen_random_uuid(), v_uid, v_role, true) returning admin_users.id into v_id;
    end if;
  end if;
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
  where id <> p_admin_id and coalesce(is_active, true) and lower(role) = 'super_admin';
  if (not v_active or v_role <> 'super_admin') and lower(coalesce(v_target.role, '')) = 'super_admin' and v_remaining = 0 then
    raise exception 'At least one active super_admin must remain';
  end if;
  update public.admin_users set role = v_role, is_active = v_active, updated_at = now() where id = p_admin_id;
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
  where id <> p_admin_id and coalesce(is_active, true) and lower(role) = 'super_admin';
  if lower(coalesce(v_target.role, '')) = 'super_admin' and v_remaining = 0 then
    raise exception 'At least one active super_admin must remain';
  end if;
  delete from public.admin_users where id = p_admin_id;
end;
$$;

revoke all on function public.admin_list_admin_users() from public, anon;
revoke all on function public.admin_grant_admin(text, text) from public, anon;
revoke all on function public.admin_update_admin(uuid, text, boolean) from public, anon;
revoke all on function public.admin_revoke_admin(uuid) from public, anon;
grant execute on function public.admin_list_admin_users() to authenticated;
grant execute on function public.admin_grant_admin(text, text) to authenticated;
grant execute on function public.admin_update_admin(uuid, text, boolean) to authenticated;
grant execute on function public.admin_revoke_admin(uuid) to authenticated;

drop function if exists pg_temp.ps_policies(text, text, boolean);

-- Helper created by the optional storage-only repair script (supabase/repairs/20261021_storage_upload_repair.sql).
-- Its policies were replaced in section 4 above, so it is no longer referenced.
drop function if exists public.ps_is_media_admin();

commit;

-- ============================================================================
-- EXPECTED AFTER APPLYING (re-run both diagnostics files)
--   diagnostics 01  ps_perfumes_admin_select / _insert / _delete exist on storage.objects
--   diagnostics 03  is_admin / is_super_admin: new definitions (admin_users / app_metadata only);
--                   ps_is_media_admin absent
--   diagnostics 04  brandnix.in@gmail.com: admin_users row, role super_admin (or admin), is_active true
--   diagnostics 07  all 8 functions listed
--   diagnostics 09  rls_enabled = true for the 16 tables in section 5
--   simulation      anon_insert REJECTED, admin_is_admin true, admin_insert ALLOWED,
--                   admin_insert_returning ALLOWED, admin_insert_wrong_folder REJECTED
--
-- ROLLBACK (only if needed; run as one script)
--   1. Restore the previous is_admin(): paste the definition saved from diagnostics section 03.
--   2. drop function if exists public.admin_delete_product(uuid);
--      drop function if exists public.admin_list_admin_users();
--      drop function if exists public.admin_grant_admin(text, text);
--      drop function if exists public.admin_update_admin(uuid, text, boolean);
--      drop function if exists public.admin_revoke_admin(uuid);
--      drop function if exists public.validate_coupon(text, numeric);
--      drop function if exists public.redeem_coupon(text, uuid);
--      (drop the two checkout policies below before dropping ps_order_accepts_items)
--      Restore the previous is_super_admin() from diagnostics section 03 (it existed before this migration).
--   3. drop policy if exists "ps_perfumes_admin_select" on storage.objects;
--      drop policy if exists "ps_perfumes_admin_insert" on storage.objects;
--      drop policy if exists "ps_perfumes_admin_delete" on storage.objects;
--      then re-create the storage policies listed in diagnostics section 01 (saved output).
--   4. For each table T in products, product_variants, product_images, categories, combos,
--      combo_items, hero_slides, instagram_reels, homepage_sections, reviews, store_settings,
--      coupons, customers, orders, order_items:
--        drop policy if exists "ps_admin_manage_T" on public.T;
--        drop policy if exists "ps_public_read_T" on public.T;
--      plus: drop policy if exists "ps_checkout_insert_orders" on public.orders;
--            drop policy if exists "ps_checkout_insert_order_items" on public.order_items;
--            drop policy if exists "ps_admin_users_read_own" on public.admin_users;
--            drop policy if exists "ps_admin_users_admin_read" on public.admin_users;
--      If diagnostics section 09 showed RLS disabled on a table before, restore that with
--        alter table public.T disable row level security;   (not recommended)
--   The admin_users row for the primary administrator can stay.
-- ============================================================================
