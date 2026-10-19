-- ============================================================================
-- PS PERFUMES — NARROW REPAIR: admin image uploads to Storage bucket ps-perfumes
-- File: supabase/repairs/20261021_storage_upload_repair.sql
-- Status: NOT APPLIED. Use ONLY if the full migration
--   supabase/migrations/20261019_admin_media_and_product_delete.sql
-- cannot be applied yet. The full migration is the preferred fix: it also covers product
-- saving/deleting, admin users, coupons and checkout. Running this repair first is safe —
-- the full migration later replaces these three policies and drops the helper function.
--
-- Problem it fixes: "Storage rejected the upload (403: new row violates row-level security
-- policy)". Verified on 2026-10-21 that the production project has none of the migration's
-- functions, i.e. no Storage INSERT policy that lets the admin upload.
--
-- What it does (and nothing else):
--   1. Registers brandnix.in@gmail.com as an active super_admin in public.admin_users.
--   2. Creates public.ps_is_media_admin(): true only for an authenticated user with an active
--      admin_users row (super_admin/admin/editor) or a server-set app_metadata role.
--      No e-mail matching, no user_metadata. Does NOT modify the existing is_admin().
--   3. Storage policies on bucket ps-perfumes, authenticated admins only, known folders only:
--      SELECT (object metadata, needed by delete and the upload response), INSERT, DELETE.
--      No UPDATE (the app never overwrites), nothing for anon, bucket stays as it is.
-- It deletes no rows and no files and does not change RLS settings.
--
-- HOW TO APPLY: Supabase Dashboard → SQL Editor (production project) → paste → Run.
-- One transaction: on any error nothing changes.
-- ROLLBACK:
--   drop policy if exists "ps_perfumes_admin_select" on storage.objects;
--   drop policy if exists "ps_perfumes_admin_insert" on storage.objects;
--   drop policy if exists "ps_perfumes_admin_delete" on storage.objects;
--   drop function if exists public.ps_is_media_admin();
--   (the admin_users row can stay)
-- ============================================================================

begin;

do $$
begin
  if not exists (select 1 from storage.buckets where id = 'ps-perfumes') then
    raise exception 'Storage bucket ps-perfumes does not exist in this project — wrong project?';
  end if;
  if to_regclass('public.admin_users') is null
     or not exists (select 1 from information_schema.columns
                    where table_schema = 'public' and table_name = 'admin_users' and column_name = 'user_id') then
    raise exception 'public.admin_users(user_id) not found — schema differs from the verified live schema';
  end if;
  if not exists (select 1 from auth.users where lower(email) = 'brandnix.in@gmail.com') then
    raise exception 'No auth user brandnix.in@gmail.com in this project — wrong project?';
  end if;
  if not (select pg_has_role(current_user, c.relowner, 'MEMBER') from pg_class c where c.oid = 'storage.objects'::regclass) then
    raise exception 'Current role % cannot manage policies on storage.objects — run as the project owner role (postgres)', current_user;
  end if;
end $$;

-- 1. Primary administrator row (same logic as the full migration)
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

-- 2. Media admin check (independent of the existing is_admin())
create or replace function public.ps_is_media_admin()
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
revoke all on function public.ps_is_media_admin() from public;
grant execute on function public.ps_is_media_admin() to authenticated;

-- 3. Storage policies (same names as the full migration, which later replaces them)
drop policy if exists "ps_perfumes_admin_select" on storage.objects;
drop policy if exists "ps_perfumes_admin_insert" on storage.objects;
drop policy if exists "ps_perfumes_admin_delete" on storage.objects;

create policy "ps_perfumes_admin_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'ps-perfumes' and public.ps_is_media_admin());

create policy "ps_perfumes_admin_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'ps-perfumes'
    and (storage.foldername(name))[1] = any (array['products', 'hero', 'reels', 'categories', 'combos',
                                                   'logo', 'reviews', 'homepage', 'banners'])
    and public.ps_is_media_admin()
  );

create policy "ps_perfumes_admin_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'ps-perfumes'
    and (storage.foldername(name))[1] = any (array['products', 'hero', 'reels', 'categories', 'combos',
                                                   'logo', 'reviews', 'homepage', 'banners'])
    and public.ps_is_media_admin()
  );

-- Report RESTRICTIVE policies: they are AND-ed with the policies above and can still block uploads
do $$
declare r record;
begin
  for r in
    select policyname, cmd, roles::text as roles
    from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and permissive = 'RESTRICTIVE'
  loop
    raise notice 'RESTRICTIVE storage policy % (%, roles %) can still block uploads — review it.', r.policyname, r.cmd, r.roles;
  end loop;
end $$;

commit;

-- Verify: run supabase/diagnostics/20261021_storage_insert_simulation.sql — expected:
--   anon_insert REJECTED, admin_ps_is_media_admin true, admin_insert ALLOWED,
--   admin_insert_returning ALLOWED, admin_insert_wrong_folder REJECTED
--   (admin_is_admin shows the UNCHANGED existing is_admin() result).
-- Then upload a product image in the admin panel.
-- Note: saving the product record itself still depends on the live table policies until the
-- full migration is applied.
