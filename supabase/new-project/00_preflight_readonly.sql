-- ============================================================================
-- PS PERFUMES — NEW PROJECT, STEP 0: read-only preflight (run BEFORE 01–04)
-- Target: ps-perfumes-production (project ref pwacxxrghlglvdtclbig)
--
-- Answers, without changing anything:
--   * Does Auth user a5b3ff02-8d08-454a-8474-d5f51a4d890f exist, is it brandnix.in@gmail.com,
--     is it confirmed, not banned, not deleted? Are there other users with that e-mail?
--   * Does the project already contain application tables, an admin_users table (with which
--     columns/constraints), an is_admin() function (with which definition), admin rows,
--     the bucket, Storage policies?
--   * If is_admin() already exists: what does it return for that UID? (role switch inside a
--     sub-block that is always rolled back)
-- It writes no rows. The only thing kept is a session setting holding the result text.
-- Run the WHOLE file and export the result grid as CSV.
--
-- How to read it (decides which setup files apply):
--   auth_user.exists = false / email mismatch / not confirmed  -> STOP; fix in Authentication → Users
--   public_tables = []                                          -> empty project: run 01, 02, 03, 04
--   public_tables not empty                                     -> STOP; send the CSV for review
--                                                                 (01_schema.sql refuses to run then)
-- ============================================================================

do $$
declare
  v_uid   constant uuid := 'a5b3ff02-8d08-454a-8474-d5f51a4d890f';
  v_email constant text := 'brandnix.in@gmail.com';
  v_res   jsonb := '{}'::jsonb;
  v_val   jsonb;
  v_txt   text;
begin
  v_res := v_res || jsonb_build_object('database', jsonb_build_object(
    'current_database', current_database(), 'current_user', current_user,
    'server_version', current_setting('server_version'),
    'can_manage_storage_policies',
      (select pg_has_role(current_user, c.relowner, 'MEMBER') from pg_class c where c.oid = 'storage.objects'::regclass)));

  -- Auth user by UID (to_jsonb(u) so missing optional columns such as deleted_at do not break the query)
  select jsonb_build_object(
           'exists', true,
           'email', u.email,
           'email_matches', lower(u.email) = v_email,
           'email_confirmed', (to_jsonb(u) ->> 'email_confirmed_at') is not null,
           'banned_until', to_jsonb(u) ->> 'banned_until',
           'deleted_at', to_jsonb(u) ->> 'deleted_at',
           'is_anonymous', to_jsonb(u) ->> 'is_anonymous',
           'last_sign_in_at', u.last_sign_in_at,
           'app_metadata_role', u.raw_app_meta_data ->> 'role')
    into v_val
  from auth.users u where u.id = v_uid;
  v_res := v_res || jsonb_build_object('auth_user', coalesce(v_val, jsonb_build_object('exists', false)));

  -- Every Auth user with that e-mail (should be exactly this UID)
  v_res := v_res || jsonb_build_object('auth_users_with_email', (
    select coalesce(jsonb_agg(jsonb_build_object('id', u.id, 'is_expected_uid', u.id = v_uid)), '[]'::jsonb)
    from auth.users u where lower(u.email) = v_email));

  -- Existing application objects
  v_res := v_res || jsonb_build_object('public_tables', (
    select coalesce(jsonb_agg(jsonb_build_object('table', c.relname, 'rls', c.relrowsecurity) order by c.relname), '[]'::jsonb)
    from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'));

  if to_regclass('public.admin_users') is not null then
    v_res := v_res || jsonb_build_object('admin_users_columns', (
      select jsonb_agg(jsonb_build_object('column', column_name, 'type', data_type, 'nullable', is_nullable,
                                          'default', column_default) order by ordinal_position)
      from information_schema.columns where table_schema = 'public' and table_name = 'admin_users'));
    v_res := v_res || jsonb_build_object('admin_users_constraints', (
      select coalesce(jsonb_agg(jsonb_build_object('name', conname, 'definition', pg_get_constraintdef(oid))), '[]'::jsonb)
      from pg_constraint where conrelid = 'public.admin_users'::regclass));
    -- Rows as JSON, so this works whatever the column names are
    execute 'select coalesce(jsonb_agg(to_jsonb(a)), ''[]''::jsonb) from public.admin_users a' into v_val;
    v_res := v_res || jsonb_build_object('admin_users_rows', v_val);
  else
    v_res := v_res || jsonb_build_object('admin_users_columns', 'table does not exist');
  end if;

  v_res := v_res || jsonb_build_object('admin_functions', (
    select coalesce(jsonb_agg(jsonb_build_object('name', p.proname, 'args', pg_get_function_identity_arguments(p.oid),
                                                 'security_definer', p.prosecdef, 'definition', pg_get_functiondef(p.oid))), '[]'::jsonb)
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.proname in ('is_admin', 'is_super_admin')));

  v_res := v_res || jsonb_build_object('buckets', (
    select coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'public', b.public, 'file_size_limit', b.file_size_limit,
                                                 'allowed_mime_types', b.allowed_mime_types)), '[]'::jsonb)
    from storage.buckets b));

  v_res := v_res || jsonb_build_object('storage_policies', (
    select coalesce(jsonb_agg(jsonb_build_object('name', policyname, 'cmd', cmd, 'permissive', permissive, 'roles', roles,
                                                 'using', qual, 'check', with_check) order by policyname), '[]'::jsonb)
    from pg_policies where schemaname = 'storage' and tablename = 'objects'));

  v_res := v_res || jsonb_build_object('auth_users_triggers', (
    select coalesce(jsonb_agg(jsonb_build_object('name', t.tgname, 'definition', pg_get_triggerdef(t.oid))), '[]'::jsonb)
    from pg_trigger t where t.tgrelid = 'auth.users'::regclass and not t.tgisinternal));

  -- What an existing is_admin() says for this UID (always rolled back)
  if to_regprocedure('public.is_admin()') is not null then
    begin
      perform set_config('request.jwt.claims',
        json_build_object('sub', v_uid::text, 'role', 'authenticated', 'email', v_email, 'aud', 'authenticated')::text, true);
      execute 'set local role authenticated';
      begin
        execute 'select public.is_admin()::text' into v_txt;
      exception when others then
        v_txt := 'ERROR: ' || sqlstate || ' ' || sqlerrm;
      end;
      v_res := v_res || jsonb_build_object('is_admin_for_uid', coalesce(v_txt, 'null'));
      raise exception 'ps_probe_rollback';
    exception when others then
      if sqlerrm <> 'ps_probe_rollback' then
        v_res := v_res || jsonb_build_object('is_admin_probe_error', sqlstate || ' ' || sqlerrm);
      end if;
    end;
  else
    v_res := v_res || jsonb_build_object('is_admin_for_uid', 'function does not exist');
  end if;

  perform set_config('ps.preflight', v_res::text, false);
end $$;

select key as check_name, value as result
from jsonb_each_text(coalesce(nullif(current_setting('ps.preflight', true), ''), '{"error":"run the whole file in one go"}')::jsonb)
order by key;
