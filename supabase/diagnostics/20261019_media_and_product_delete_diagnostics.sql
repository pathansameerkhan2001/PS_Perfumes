-- ============================================================================
-- PS PERFUMES — READ-ONLY DIAGNOSTICS (run BEFORE and AFTER the migration)
-- File: supabase/diagnostics/20261019_media_and_product_delete_diagnostics.sql
--
-- This file is ONE SELECT statement, so the Supabase SQL Editor shows every section in a
-- single result grid (the editor only displays the result of the last statement of a
-- script). It reads catalog tables and a few application tables; it writes nothing and
-- uses no transaction control.
--
-- How to save the output: SQL Editor → Run → in the result grid use "Export → CSV"
-- (or copy all rows). Keep the BEFORE file: section 03 is the rollback copy of the current
-- is_admin()/is_super_admin(), and section 09 the RLS state per table.
--
-- The admin upload SIMULATION (role switch, rolled-back inserts) is a separate file:
--   supabase/diagnostics/20261021_storage_insert_simulation.sql
-- ============================================================================

select section, result
from (
  -- 00 Which database this is (compare with the project you intend to change)
  select '00 database' as section,
         jsonb_build_object(
           'current_database', current_database(),
           'current_user', current_user,
           'server_version', current_setting('server_version'),
           -- creating/dropping storage policies needs ownership of storage.objects (or membership in its owner role)
           'storage_objects_owner', (select pg_get_userbyid(c.relowner) from pg_class c where c.oid = 'storage.objects'::regclass),
           'can_manage_storage_policies', (select pg_has_role(current_user, c.relowner, 'MEMBER') from pg_class c where c.oid = 'storage.objects'::regclass),
           'bucket_ps_perfumes', (select jsonb_build_object('public', b.public, 'file_size_limit', b.file_size_limit,
                                                            'allowed_mime_types', b.allowed_mime_types)
                                  from storage.buckets b where b.id = 'ps-perfumes')
         ) as result

  union all
  -- 01 Every policy on storage.objects. RESTRICTIVE ones are AND-ed and can block uploads.
  select '01 storage.objects policies',
         coalesce(jsonb_agg(jsonb_build_object('name', policyname, 'permissive', permissive, 'cmd', cmd,
                                               'roles', roles, 'using', qual, 'check', with_check)
                            order by cmd, policyname), '[]'::jsonb)
  from pg_policies where schemaname = 'storage' and tablename = 'objects'

  union all
  -- 02 Policies on application tables
  select '02 public table policies',
         coalesce(jsonb_agg(jsonb_build_object('table', tablename, 'name', policyname, 'permissive', permissive,
                                               'cmd', cmd, 'roles', roles, 'using', qual, 'check', with_check)
                            order by tablename, cmd, policyname), '[]'::jsonb)
  from pg_policies where schemaname = 'public'

  union all
  -- 03 ROLLBACK COPY: current admin functions, with owner and argument list
  select '03 is_admin / is_super_admin definitions',
         coalesce(jsonb_agg(jsonb_build_object('name', p.proname, 'args', pg_get_function_identity_arguments(p.oid),
                                               'owner', pg_get_userbyid(p.proowner), 'security_definer', p.prosecdef,
                                               'can_manage', pg_has_role(current_user, p.proowner, 'MEMBER'),
                                               'definition', pg_get_functiondef(p.oid))), '[]'::jsonb)
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace and p.proname in ('is_admin', 'is_super_admin', 'ps_is_media_admin')

  union all
  -- 04 Primary admin account and its admin_users row
  select '04 primary admin',
         coalesce(jsonb_agg(jsonb_build_object('user_id', u.id, 'email_confirmed', u.email_confirmed_at is not null,
                                               'app_role', u.raw_app_meta_data ->> 'role',
                                               'admin_users_id', au.id, 'role', au.role, 'is_active', au.is_active)), '[]'::jsonb)
  from auth.users u
  left join public.admin_users au on au.user_id = u.id
  where lower(u.email) = 'brandnix.in@gmail.com'

  union all
  -- 05 All admin_users rows (ids and roles only)
  select '05 admin_users rows',
         coalesce(jsonb_agg(jsonb_build_object('id', au.id, 'user_id', au.user_id, 'has_auth_user', u.id is not null,
                                               'role', au.role, 'is_active', au.is_active)), '[]'::jsonb)
  from public.admin_users au left join auth.users u on u.id = au.user_id

  union all
  -- 06 Foreign keys pointing at products / product_variants (delete behaviour)
  select '06 foreign keys to products/variants',
         coalesce(jsonb_agg(jsonb_build_object('constraint', con.conname,
                                               'referencing', con.conrelid::regclass::text,
                                               'referenced', con.confrelid::regclass::text,
                                               'on_delete', case con.confdeltype when 'a' then 'NO ACTION' when 'r' then 'RESTRICT'
                                                              when 'c' then 'CASCADE' when 'n' then 'SET NULL' when 'd' then 'SET DEFAULT' end)), '[]'::jsonb)
  from pg_constraint con
  where con.contype = 'f'
    and con.confrelid in ('public.products'::regclass, 'public.product_variants'::regclass)

  union all
  -- 07 Functions created by the migration (absent before, all present after)
  select '07 migration functions present',
         coalesce(jsonb_agg(p.proname order by p.proname), '[]'::jsonb)
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace
    and p.proname in ('admin_delete_product', 'admin_list_admin_users', 'admin_grant_admin', 'admin_update_admin',
                      'admin_revoke_admin', 'validate_coupon', 'redeem_coupon', 'ps_order_accepts_items')

  union all
  -- 08 Hero video object must exist
  select '08 hero video object',
         coalesce(jsonb_agg(jsonb_build_object('name', o.name, 'mimetype', o.metadata ->> 'mimetype',
                                               'size', o.metadata ->> 'size')), '[]'::jsonb)
  from storage.objects o
  where o.bucket_id = 'ps-perfumes' and o.name = 'hero/ps-perfumes-hero-desktop.mp4'

  union all
  -- 09 ROLLBACK RECORD: RLS state and owner of every public table (the migration needs to own them)
  select '09 public tables: rls / owner',
         coalesce(jsonb_agg(jsonb_build_object('table', c.relname, 'rls_enabled', c.relrowsecurity,
                                               'rls_forced', c.relforcerowsecurity, 'owner', pg_get_userbyid(c.relowner),
                                               'can_manage', pg_has_role(current_user, c.relowner, 'MEMBER'))
                            order by c.relname), '[]'::jsonb)
  from pg_class c
  where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'

  union all
  -- 10 Triggers on auth.users (a trigger writing to a missing table would break new logins)
  select '10 auth.users triggers',
         coalesce(jsonb_agg(jsonb_build_object('name', t.tgname, 'definition', pg_get_triggerdef(t.oid))), '[]'::jsonb)
  from pg_trigger t
  where t.tgrelid = 'auth.users'::regclass and not t.tgisinternal

  union all
  -- 11 admin_users columns and constraints
  select '11 admin_users columns',
         coalesce(jsonb_agg(jsonb_build_object('column', column_name, 'type', data_type, 'nullable', is_nullable,
                                               'default', column_default) order by ordinal_position), '[]'::jsonb)
  from information_schema.columns
  where table_schema = 'public' and table_name = 'admin_users'

  union all
  select '11b admin_users constraints',
         coalesce(jsonb_agg(jsonb_build_object('name', conname, 'definition', pg_get_constraintdef(oid))), '[]'::jsonb)
  from pg_constraint where conrelid = 'public.admin_users'::regclass

  union all
  -- 12 store_settings keys (values are not selected)
  select '12 store_settings keys',
         coalesce(jsonb_agg(setting_key order by setting_key), '[]'::jsonb)
  from public.store_settings

  union all
  -- 13 Status / discount-type constraints (must allow 'pending', 'percentage', 'fixed')
  select '13 check constraints orders/order_items/coupons',
         coalesce(jsonb_agg(jsonb_build_object('table', conrelid::regclass::text, 'name', conname,
                                               'definition', pg_get_constraintdef(oid))), '[]'::jsonb)
  from pg_constraint
  where conrelid in ('public.orders'::regclass, 'public.order_items'::regclass, 'public.coupons'::regclass)
    and contype = 'c'

  union all
  -- 14 Coupon rules (no customer data)
  select '14 coupons',
         coalesce(jsonb_agg(jsonb_build_object('code', code, 'type', discount_type, 'value', discount_value,
                                               'minimum', minimum_order_amount, 'limit', usage_limit, 'used', used_count,
                                               'active', is_active, 'starts_at', starts_at, 'expires_at', expires_at)
                            order by code), '[]'::jsonb)
  from public.coupons

  union all
  -- 15 Optional enquiries table (null = not created)
  select '15 contact_enquiries table', to_jsonb(to_regclass('public.contact_enquiries')::text)

  union all
  -- 16 Row counts (context for the storefront after deploy; counts only)
  select '16 row counts',
         jsonb_build_object(
           'products', (select count(*) from public.products),
           'products_active', (select count(*) from public.products where is_active),
           'product_variants', (select count(*) from public.product_variants),
           'orders', (select count(*) from public.orders),
           'order_items', (select count(*) from public.order_items),
           'storage_objects_ps_perfumes', (select count(*) from storage.objects where bucket_id = 'ps-perfumes'))
) d
order by section;
