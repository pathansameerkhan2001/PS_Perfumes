-- ============================================================================
-- PS PERFUMES — CURRENT STATE CHECK (READ-ONLY) for the new project
-- Target: ps-perfumes-production (project ref pwacxxrghlglvdtclbig)
--
-- Answers "which setup steps are already applied?" without changing anything:
-- plain SELECTs on the catalogue (no role switch, no writes, no session settings).
-- Run the WHOLE file in the SQL Editor and export the grid as CSV.
-- Every row: step, check, ok (true / false / null = informational), detail.
--
-- For the is_admin() probe as the administrator, also run 02_check_readonly.sql
-- (it switches role inside an always-rolled-back block).
-- ============================================================================

with
app_tables(t) as (
  values ('admin_users'), ('categories'), ('products'), ('product_variants'), ('product_images'),
         ('combos'), ('combo_items'), ('reviews'), ('hero_slides'), ('instagram_reels'),
         ('homepage_sections'), ('store_settings'), ('coupons'), ('customers'), ('orders'), ('order_items')
),
fns(sig) as (
  values ('is_admin()'), ('is_super_admin()'), ('validate_coupon(text,numeric)'),
         ('admin_delete_product(uuid)'), ('admin_list_admin_users()'), ('admin_grant_admin(text,text)'),
         ('admin_update_admin(uuid,text,boolean)'), ('admin_revoke_admin(uuid)')
),
anon_read(t) as (
  values ('categories'), ('products'), ('product_variants'), ('product_images'), ('combos'),
         ('combo_items'), ('reviews'), ('hero_slides'), ('instagram_reels'), ('homepage_sections'),
         ('store_settings')
),
families(slug, name, ord) as (
  values ('attar', 'Attar', 1), ('perfume', 'Perfume', 2), ('bakhoor', 'Bakhoor', 3), ('musky', 'Musky', 4),
         ('oud', 'Oud', 5), ('floral', 'Floral', 6), ('woody', 'Woody', 7)
),
place_order_sigs as (
  select coalesce(jsonb_agg(pg_get_function_identity_arguments(p.oid) order by p.oid), '[]'::jsonb) as list,
         count(*) as n
  from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'place_order'
)
select * from (
  -- ---------------- Step 01: tables, RLS ----------------
  select '01' as step, 'tables_missing' as check_name,
         not exists (select 1 from app_tables where to_regclass('public.' || t) is null) as ok,
         (select coalesce(jsonb_agg(t), '[]'::jsonb) from app_tables where to_regclass('public.' || t) is null)::text as detail
  union all
  select '01', 'rls_off_on_app_tables',
         not exists (select 1 from app_tables a join pg_class c on c.oid = to_regclass('public.' || a.t) where not c.relrowsecurity),
         (select coalesce(jsonb_agg(a.t), '[]'::jsonb) from app_tables a
            join pg_class c on c.oid = to_regclass('public.' || a.t) where not c.relrowsecurity)::text
  union all
  select '01', 'other_public_tables (info)', null,
         (select coalesce(jsonb_agg(c.relname order by c.relname), '[]'::jsonb) from pg_class c
           where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
             and c.relname not in (select t from app_tables))::text

  -- ---------------- Step 02: functions, place_order, policies, grants ----------------
  union all
  select '02', 'functions_missing',
         not exists (select 1 from fns where to_regprocedure('public.' || sig) is null),
         (select coalesce(jsonb_agg(sig), '[]'::jsonb) from fns where to_regprocedure('public.' || sig) is null)::text
  union all
  select '02/08', 'place_order_signatures (expect exactly 1)',
         (select n = 1 from place_order_sigs),
         (select list::text from place_order_sigs)
  union all
  select '02', 'ps_policies_present (expect 28)',
         (select count(*) = 28 from pg_policies where schemaname = 'public'
            and (policyname like 'ps\_admin\_manage\_%' or policyname like 'ps\_public\_read\_%'
                 or policyname in ('ps_admin_users_read_own', 'ps_admin_users_admin_read'))),
         (select count(*)::text from pg_policies where schemaname = 'public'
            and (policyname like 'ps\_admin\_manage\_%' or policyname like 'ps\_public\_read\_%'
                 or policyname in ('ps_admin_users_read_own', 'ps_admin_users_admin_read')))
  union all
  select '02', 'policies_not_from_setup (expect none, except contact_enquiries)',
         not exists (select 1 from pg_policies where schemaname = 'public'
            and tablename in (select t from app_tables)
            and not (policyname like 'ps\_admin\_manage\_%' or policyname like 'ps\_public\_read\_%'
                     or policyname in ('ps_admin_users_read_own', 'ps_admin_users_admin_read'))),
         (select coalesce(jsonb_agg(tablename || '.' || policyname || ' ' || cmd), '[]'::jsonb) from pg_policies
           where schemaname = 'public' and tablename in (select t from app_tables)
             and not (policyname like 'ps\_admin\_manage\_%' or policyname like 'ps\_public\_read\_%'
                      or policyname in ('ps_admin_users_read_own', 'ps_admin_users_admin_read')))::text
  union all
  select '02', 'anon_write_grants (expect none)',
         not exists (select 1 from information_schema.role_table_grants
                     where table_schema = 'public' and grantee in ('anon', 'PUBLIC') and privilege_type <> 'SELECT'),
         (select coalesce(jsonb_agg(table_name || ':' || privilege_type), '[]'::jsonb) from information_schema.role_table_grants
           where table_schema = 'public' and grantee in ('anon', 'PUBLIC') and privilege_type <> 'SELECT')::text
  union all
  select '02', 'anon_select_on_storefront_tables',
         not exists (select 1 from anon_read where not has_table_privilege('anon', 'public.' || t, 'SELECT')),
         (select coalesce(jsonb_agg(t), '[]'::jsonb) from anon_read where not has_table_privilege('anon', 'public.' || t, 'SELECT'))::text
  union all
  select '02', 'anon_cannot_select_private_tables',
         not (has_table_privilege('anon', 'public.orders', 'SELECT') or has_table_privilege('anon', 'public.order_items', 'SELECT')
              or has_table_privilege('anon', 'public.coupons', 'SELECT') or has_table_privilege('anon', 'public.customers', 'SELECT')
              or has_table_privilege('anon', 'public.admin_users', 'SELECT')),
         'orders, order_items, coupons, customers, admin_users'
  union all
  select '02', 'anon_can_execute (info)', null,
         (select coalesce(jsonb_agg(p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' order by p.proname), '[]'::jsonb)
            from pg_proc p where p.pronamespace = 'public'::regnamespace and has_function_privilege('anon', p.oid, 'EXECUTE'))::text

  -- ---------------- Step 03: Storage ----------------
  union all
  select '03', 'bucket Ps-perfumes-media public',
         exists (select 1 from storage.buckets where id = 'Ps-perfumes-media' and public),
         (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'public', public, 'limit', file_size_limit,
                                                       'mime', allowed_mime_types)), '[]'::jsonb)
            from storage.buckets where lower(id) like 'ps-perfumes%')::text
  union all
  select '03', 'storage_policies ps_media_admin_select/insert/delete',
         (select count(*) = 3 from pg_policies where schemaname = 'storage' and tablename = 'objects'
            and policyname in ('ps_media_admin_select', 'ps_media_admin_insert', 'ps_media_admin_delete')),
         (select coalesce(jsonb_agg(policyname || ' ' || cmd order by policyname), '[]'::jsonb)
            from pg_policies where schemaname = 'storage' and tablename = 'objects')::text
  union all
  select '03', 'hero film object present (info)', null,
         (select count(*)::text from storage.objects
           where bucket_id = 'Ps-perfumes-media' and name = 'hero/ps-perfumes-hero-desktop.mp4')

  -- ---------------- Step 04: administrator ----------------
  union all
  select '04', 'auth_user a5b3ff02… brandnix.in@gmail.com confirmed',
         exists (select 1 from auth.users u where u.id = 'a5b3ff02-8d08-454a-8474-d5f51a4d890f'
                   and lower(u.email) = 'brandnix.in@gmail.com' and u.email_confirmed_at is not null),
         (select coalesce(jsonb_agg(jsonb_build_object('email', u.email, 'confirmed', u.email_confirmed_at is not null,
                                                       'last_sign_in_at', u.last_sign_in_at)), '[]'::jsonb)
            from auth.users u where u.id = 'a5b3ff02-8d08-454a-8474-d5f51a4d890f')::text
  union all
  select '04', 'admin_users row: super_admin, active',
         exists (select 1 from public.admin_users where user_id = 'a5b3ff02-8d08-454a-8474-d5f51a4d890f'
                   and role = 'super_admin' and is_active),
         (select coalesce(jsonb_agg(jsonb_build_object('role', role, 'is_active', is_active)), '[]'::jsonb)
            from public.admin_users where user_id = 'a5b3ff02-8d08-454a-8474-d5f51a4d890f')::text
  union all
  select '04', 'admin_users total / active super_admins (info)', null,
         (select count(*) || ' rows / ' || count(*) filter (where is_active and role = 'super_admin') || ' active super_admin'
            from public.admin_users)

  -- ---------------- Step 07: seven fragrance categories ----------------
  union all
  select '07', 'seven families present and active',
         (select count(*) = 7 from families f join public.categories c on c.slug = f.slug and c.is_active),
         (select coalesce(jsonb_agg(jsonb_build_object('slug', f.slug, 'present', c.id is not null,
                                                       'active', c.is_active, 'display_order', c.display_order)
                                    order by f.ord), '[]'::jsonb)
            from families f left join public.categories c on c.slug = f.slug)::text
  union all
  select '07', 'other categories (info)', null,
         (select coalesce(jsonb_agg(jsonb_build_object('slug', slug, 'active', is_active) order by display_order), '[]'::jsonb)
            from public.categories where slug not in (select slug from families))::text

  -- ---------------- Step 08: checkout hardening ----------------
  union all
  select '08', 'applied (orders.idempotency_key + place_order(…, uuid))',
         exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'orders' and column_name = 'idempotency_key')
           and to_regprocedure('public.place_order(jsonb,jsonb,text,text,uuid)') is not null,
         'false = not applied yet (expected before approval)'

  -- ---------------- Optional / data ----------------
  union all
  select 'opt', 'contact_enquiries table (optional)', null,
         case when to_regclass('public.contact_enquiries') is null then 'not created' else 'exists' end
  union all
  select 'data', 'row counts (info)', null,
         jsonb_build_object(
           'categories', (select count(*) from public.categories),
           'products', (select count(*) from public.products),
           'product_variants', (select count(*) from public.product_variants),
           'combos', (select count(*) from public.combos),
           'combo_items', (select count(*) from public.combo_items),
           'homepage_sections', (select count(*) from public.homepage_sections),
           'hero_slides', (select count(*) from public.hero_slides),
           'store_settings', (select count(*) from public.store_settings),
           'coupons', (select count(*) from public.coupons),
           'orders', (select count(*) from public.orders),
           'order_items', (select count(*) from public.order_items))::text
) checks
order by step, check_name;
