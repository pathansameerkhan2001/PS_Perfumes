-- ============================================================================
-- PS PERFUMES — Storage upload permission SIMULATION (leaves nothing behind)
-- File: supabase/diagnostics/20261021_storage_insert_simulation.sql
-- Run in: Supabase Dashboard → SQL Editor of the PRODUCTION project. Run the whole file.
--
-- What it does: reproduces what the Storage API does on upload — an INSERT into
-- storage.objects as role "anon" or "authenticated" with the caller's JWT claims —
-- and records whether each attempt is allowed.
--
-- Why nothing can remain:
--   * every test runs inside a PL/pgSQL sub-block that ALWAYS ends with
--     RAISE EXCEPTION 'ps_probe_rollback'; PostgreSQL then rolls back everything done in
--     that sub-block (inserted rows, SET LOCAL ROLE, request.jwt.claims);
--   * no explicit BEGIN/COMMIT/ROLLBACK is used, so a rejected insert cannot leave the
--     editor session in an aborted transaction or skip the clean-up;
--   * a row in storage.objects never creates a file (files are only written by the
--     Storage API), and the row itself is rolled back.
-- The only thing kept is a session setting (ps.storage_probe) holding the result text,
-- which the final SELECT displays; it disappears when the editor connection closes.
--
-- Expected BEFORE the migration (current 403):  admin_insert = REJECTED
-- Expected AFTER the migration or the narrow repair:
--   anon_insert = REJECTED, admin_is_admin = true, admin_insert = ALLOWED,
--   admin_insert_returning = ALLOWED, admin_insert_wrong_folder = REJECTED
-- ============================================================================

do $$
declare
  v_uid         uuid;
  v_email       text := 'brandnix.in@gmail.com';
  v_stamp       text := to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS');
  v_result      jsonb := '{}'::jsonb;
  v_val         text;
  v_tmp_id      uuid;
  v_admins      text[] := '{}';
  v_user        record;
begin
  select id into v_uid from auth.users where lower(email) = v_email order by created_at limit 1;
  v_result := v_result || jsonb_build_object('admin_auth_user_found', v_uid is not null);

  -- 1. Anonymous visitor upload (must be rejected) -----------------------------
  begin
    perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
    execute 'set local role anon';
    begin
      insert into storage.objects (bucket_id, name)
      values ('ps-perfumes', 'products/zz-probe-anon-' || v_stamp || '.webp');
      v_val := 'ALLOWED (UNEXPECTED — visitors can upload)';
    exception when others then
      v_val := 'REJECTED: ' || sqlstate || ' ' || sqlerrm;
    end;
    v_result := v_result || jsonb_build_object('anon_insert', v_val);
    raise exception 'ps_probe_rollback';
  exception when others then
    if sqlerrm <> 'ps_probe_rollback' then
      v_result := v_result || jsonb_build_object('anon_setup_error', sqlstate || ' ' || sqlerrm);
    end if;
  end;

  -- 2. Primary admin upload, exactly like the app (products/ folder) -------------
  begin
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_uid::text, 'role', 'authenticated', 'email', v_email,
                        'aud', 'authenticated')::text, true);
    execute 'set local role authenticated';

    begin
      v_val := coalesce(public.is_admin()::text, 'null');
    exception when others then
      v_val := 'ERROR: ' || sqlstate || ' ' || sqlerrm;
    end;
    v_result := v_result || jsonb_build_object('admin_is_admin', v_val,
                                               'admin_auth_uid', coalesce(auth.uid()::text, 'null'));

    if to_regprocedure('public.ps_is_media_admin()') is not null then
      begin
        execute 'select public.ps_is_media_admin()::text' into v_val;
      exception when others then
        v_val := 'ERROR: ' || sqlstate || ' ' || sqlerrm;
      end;
      v_result := v_result || jsonb_build_object('admin_ps_is_media_admin', v_val);
    end if;

    begin
      insert into storage.objects (bucket_id, name)
      values ('ps-perfumes', 'products/zz-probe-admin-' || v_stamp || '.webp');
      v_val := 'ALLOWED';
    exception when others then
      v_val := 'REJECTED: ' || sqlstate || ' ' || sqlerrm;
    end;
    v_result := v_result || jsonb_build_object('admin_insert', v_val);

    -- Same insert with RETURNING (also requires the SELECT policy to accept the new row)
    begin
      insert into storage.objects (bucket_id, name)
      values ('ps-perfumes', 'products/zz-probe-admin-ret-' || v_stamp || '.webp')
      returning id into v_tmp_id;
      v_val := 'ALLOWED';
    exception when others then
      v_val := 'REJECTED: ' || sqlstate || ' ' || sqlerrm;
    end;
    v_result := v_result || jsonb_build_object('admin_insert_returning', v_val);

    -- A folder outside the allow-list must be rejected
    begin
      insert into storage.objects (bucket_id, name)
      values ('ps-perfumes', 'zz-not-allowed/zz-probe-' || v_stamp || '.webp');
      v_val := 'ALLOWED (UNEXPECTED — folder restriction missing)';
    exception when others then
      v_val := 'REJECTED (expected): ' || sqlstate;
    end;
    v_result := v_result || jsonb_build_object('admin_insert_wrong_folder', v_val);

    raise exception 'ps_probe_rollback';
  exception when others then
    if sqlerrm <> 'ps_probe_rollback' then
      v_result := v_result || jsonb_build_object('admin_setup_error', sqlstate || ' ' || sqlerrm);
    end if;
  end;

  -- 3. Who is an administrator under the CURRENT is_admin()? -----------------------
  --    Run BEFORE the migration: anyone listed here but missing from admin_users
  --    loses admin access when the migration replaces is_admin().
  for v_user in select id, email from auth.users order by created_at limit 1000 loop
    begin
      perform set_config('request.jwt.claims',
        json_build_object('sub', v_user.id::text, 'role', 'authenticated', 'email', v_user.email)::text, true);
      execute 'set local role authenticated';
      if coalesce(public.is_admin(), false) then
        v_admins := v_admins || v_user.email::text;
      end if;
      raise exception 'ps_probe_rollback';
    exception when others then
      if sqlerrm <> 'ps_probe_rollback' then
        v_admins := v_admins || (coalesce(v_user.email::text, '?') || ' (error: ' || sqlerrm || ')');
      end if;
    end;
  end loop;
  v_result := v_result || jsonb_build_object(
    'users_admin_under_current_is_admin', to_jsonb(v_admins),
    'users_in_admin_users_table', (select coalesce(jsonb_agg(u.email), '[]'::jsonb)
                                   from public.admin_users au join auth.users u on u.id = au.user_id
                                   where coalesce(au.is_active, true)));

  -- Keep only the result text for the SELECT below (session setting, no table write)
  perform set_config('ps.storage_probe', v_result::text, false);
end $$;

select key as check_name, value as result
from jsonb_each_text(coalesce(nullif(current_setting('ps.storage_probe', true), ''), '{"error":"run the whole file in one go"}')::jsonb)
order by key;
