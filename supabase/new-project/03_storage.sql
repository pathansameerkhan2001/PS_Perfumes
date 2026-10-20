-- ============================================================================
-- PS PERFUMES — NEW PROJECT, STEP 3 of 5: Storage bucket Ps-perfumes-media
-- Target: ps-perfumes-production (project ref pwacxxrghlglvdtclbig)
-- Status: NOT APPLIED. Requires 02_auth_functions_rls.sql (uses public.is_admin()).
--
-- Bucket ids are case-sensitive: the id is exactly 'Ps-perfumes-media', and the app must be
-- built with VITE_SUPABASE_STORAGE_BUCKET=Ps-perfumes-media.
--
-- Access model
--   * Public bucket: storefront visitors load images/videos through the public object URL
--     (/storage/v1/object/public/Ps-perfumes-media/<path>). That URL does not use RLS.
--   * No SELECT policy for anon: visitors cannot list or enumerate objects through the API.
--   * Authenticated administrators (public.is_admin()) may SELECT, INSERT and DELETE objects,
--     only inside the folders the app uploads to. No UPDATE policy: the app never overwrites
--     (uploads use unique, timestamped names and upsert = false).
--   * The browser never holds a secret key; uploads are authorised by the admin's session.
--
-- If the bucket already exists (created in the dashboard), only its settings are aligned:
-- public = true, 50 MB limit, image/jpeg, image/png, image/webp, video/mp4. No objects are touched.
-- One transaction.
-- ============================================================================

begin;

do $$
begin
  if to_regprocedure('public.is_admin()') is null then
    raise exception 'Run 02_auth_functions_rls.sql first (public.is_admin() not found)';
  end if;
  if not (select pg_has_role(current_user, c.relowner, 'MEMBER') from pg_class c where c.oid = 'storage.objects'::regclass) then
    raise exception 'Role % cannot manage policies on storage.objects. Create the three policies below in Dashboard → Storage → Policies instead (same names and expressions).', current_user;
  end if;
  if exists (select 1 from storage.buckets where lower(id) = 'ps-perfumes-media' and id <> 'Ps-perfumes-media') then
    raise exception 'A bucket with a differently-cased id exists (%). Bucket ids are case-sensitive — resolve before continuing.',
      (select string_agg(id, ', ') from storage.buckets where lower(id) = 'ps-perfumes-media');
  end if;
end $$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('Ps-perfumes-media', 'Ps-perfumes-media', true, 52428800,
        array['image/jpeg', 'image/png', 'image/webp', 'video/mp4'])
on conflict (id) do update
  set public = true,
      file_size_limit = 52428800,
      allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'video/mp4'];

drop policy if exists "ps_media_admin_select" on storage.objects;
drop policy if exists "ps_media_admin_insert" on storage.objects;
drop policy if exists "ps_media_admin_delete" on storage.objects;

-- SELECT: object metadata for admins (needed by remove() and by the upload response)
create policy "ps_media_admin_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'Ps-perfumes-media' and public.is_admin());

-- INSERT: new uploads, admins only, only into the known media folders
create policy "ps_media_admin_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'Ps-perfumes-media'
    and (storage.foldername(name))[1] = any (array['products', 'hero', 'reels', 'categories', 'combos',
                                                   'logo', 'reviews', 'homepage', 'banners'])
    and public.is_admin()
  );

-- DELETE: cleanup of media nothing references any more, admins only
create policy "ps_media_admin_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'Ps-perfumes-media'
    and (storage.foldername(name))[1] = any (array['products', 'hero', 'reels', 'categories', 'combos',
                                                   'logo', 'reviews', 'homepage', 'banners'])
    and public.is_admin()
  );

-- Report anything else that could widen or block access to this bucket
do $$
declare r record;
begin
  for r in
    select policyname, permissive, cmd, roles::text as roles
    from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname not in ('ps_media_admin_select', 'ps_media_admin_insert', 'ps_media_admin_delete')
  loop
    raise notice 'REVIEW existing storage policy % (%, %, roles %).', r.policyname, r.permissive, r.cmd, r.roles;
  end loop;
end $$;

-- Refresh the Data API schema cache so new tables/functions are visible immediately (sent at commit)
notify pgrst, 'reload schema';

commit;
