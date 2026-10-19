-- ============================================================================
-- PS PERFUMES — READ-ONLY DIAGNOSTICS for media uploads and product deletion
-- Run in Supabase Dashboard → SQL Editor BEFORE and AFTER applying
--   supabase/migrations/20261019_admin_media_and_product_delete.sql
-- Nothing in this file modifies data: section 5 runs inside a transaction that
-- is always rolled back.
-- Save the output of section 3 (current is_admin definition) — it is your
-- rollback copy.
-- ============================================================================

-- 1. Every policy on storage.objects (look for ones mentioning ps-perfumes,
--    and for any RESTRICTIVE policy — restrictive policies are AND-ed and can
--    block uploads even when a permissive policy allows them)
select policyname, permissive, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'storage' and tablename = 'objects'
order by cmd, policyname;

-- 2. Policies on the product tables and admin_users
select tablename, policyname, permissive, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('products', 'product_variants', 'product_images', 'admin_users',
                    'order_items', 'combo_items', 'reviews')
order by tablename, cmd, policyname;

-- 3. Current is_admin() / is_super_admin() definitions (copy this output somewhere safe —
--    it is the rollback copy; is_super_admin() already exists in production but not in the repo)
select p.proname, pg_get_functiondef(p.oid)
from pg_proc p
where p.proname in ('is_admin', 'is_super_admin') and p.pronamespace = 'public'::regnamespace;

-- 4. Admin account and its admin_users row
select u.id as user_id, u.email, u.email_confirmed_at is not null as email_confirmed,
       u.raw_app_meta_data ->> 'role' as app_role,
       au.id as admin_users_id, au.role, au.is_active
from auth.users u
left join public.admin_users au on au.user_id = u.id
where lower(u.email) = 'brandnix.in@gmail.com';

-- 5. Simulate the admin's upload permission check exactly as Storage evaluates it
begin;
  select set_config(
    'request.jwt.claims',
    json_build_object(
      'sub',   (select id::text from auth.users where lower(email) = 'brandnix.in@gmail.com' limit 1),
      'role',  'authenticated',
      'email', 'brandnix.in@gmail.com'
    )::text,
    true
  );
  set local role authenticated;
  select auth.uid()                       as simulated_uid,
         public.is_admin()                as is_admin_result,
         (storage.foldername('products/test-1.png'))[1] as first_folder;
rollback;

-- 6. Foreign keys that point at products / product_variants (decides delete behaviour)
select con.conname, con.conrelid::regclass as referencing_table,
       con.confrelid::regclass as referenced_table,
       case con.confdeltype when 'a' then 'NO ACTION' when 'r' then 'RESTRICT'
            when 'c' then 'CASCADE' when 'n' then 'SET NULL' when 'd' then 'SET DEFAULT' end as on_delete
from pg_constraint con
where con.contype = 'f'
  and con.confrelid in ('public.products'::regclass, 'public.product_variants'::regclass)
order by referenced_table, referencing_table;

-- 7. Is the delete function installed?
select proname, prosecdef as security_definer
from pg_proc
where pronamespace = 'public'::regnamespace and proname in ('is_admin', 'admin_delete_product');

-- 7b. Admin-user management functions (after the migration)
select proname from pg_proc
where pronamespace = 'public'::regnamespace
  and proname in ('is_super_admin', 'admin_list_admin_users', 'admin_grant_admin',
                  'admin_update_admin', 'admin_revoke_admin');

-- 7c. Checkout / coupon functions (after the migration)
select proname from pg_proc
where pronamespace = 'public'::regnamespace
  and proname in ('validate_coupon', 'redeem_coupon', 'ps_order_accepts_items');

-- 9. Is RLS enabled on each public table? (save this — it is part of the rollback record)
select c.relname as table_name, c.relrowsecurity as rls_enabled, c.relforcerowsecurity as rls_forced
from pg_class c
where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
order by c.relname;

-- 10. Triggers on auth.users (a trigger writing to a missing table would break sign-ups)
select tgname, pg_get_triggerdef(oid) as definition
from pg_trigger
where tgrelid = 'auth.users'::regclass and not tgisinternal;

-- 11. admin_users column defaults and constraints
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'admin_users'
order by ordinal_position;
select conname, pg_get_constraintdef(oid) from pg_constraint
where conrelid = 'public.admin_users'::regclass;

-- 12. store_settings keys and value type (keys only — values are not selected)
select setting_key, pg_typeof(setting_value)::text as value_type
from public.store_settings order by setting_key;

-- 13. Allowed order / payment status values and coupon discount types
select conrelid::regclass as table_name, conname, pg_get_constraintdef(oid) from pg_constraint
where conrelid in ('public.orders'::regclass, 'public.order_items'::regclass, 'public.coupons'::regclass)
  and contype = 'c';

-- 14. Coupons that exist (codes and rules only — no customer data). The cart previously
--     accepted hard-coded PS10 / WELCOME20; they only keep working if they exist here.
select code, discount_type, discount_value, minimum_order_amount, usage_limit, used_count,
       is_active, starts_at, expires_at
from public.coupons order by code;

-- 15. Does a contact_enquiries table exist? (null = no; see the optional enquiries migration)
select to_regclass('public.contact_enquiries') as contact_enquiries_table;

-- 8. Hero video object must still exist
select name, metadata ->> 'mimetype' as mimetype, metadata ->> 'size' as size
from storage.objects
where bucket_id = 'ps-perfumes' and name = 'hero/ps-perfumes-hero-desktop.mp4';
