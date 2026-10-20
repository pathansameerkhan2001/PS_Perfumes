-- ============================================================================
-- PS PERFUMES — NEW PROJECT, STEP 4 of 5: register the initial Super Admin
-- Target: ps-perfumes-production (project ref pwacxxrghlglvdtclbig)
-- Status: NOT APPLIED. Requires 01_schema.sql and 02_auth_functions_rls.sql.
--
-- Administrator: brandnix.in@gmail.com, Auth UID a5b3ff02-8d08-454a-8474-d5f51a4d890f
--
-- Refuses to change anything unless, in THIS project:
--   * Auth user a5b3ff02-… exists, its e-mail is brandnix.in@gmail.com, it is confirmed,
--     not banned and not soft-deleted;
--   * public.admin_users has the schema created by 01_schema.sql
--     (user_id uuid unique, role text, is_active boolean).
-- Then it creates the admin_users row, or updates the existing row for that UID (user_id is
-- UNIQUE, so a duplicate is impossible), and finally runs public.is_admin() and
-- public.is_super_admin() AS THAT USER. If either is not true, the whole transaction is rolled
-- back and nothing is saved.
--
-- At runtime authorization is the admin_users row checked by is_admin() — the same function
-- every RLS policy, every Storage policy and every admin database function uses. The e-mail is
-- only used here, once, to confirm the UID belongs to the expected person.
-- ============================================================================

begin;

do $$
declare
  v_uid    constant uuid := 'a5b3ff02-8d08-454a-8474-d5f51a4d890f';
  v_email  constant text := 'brandnix.in@gmail.com';
  v_user   jsonb;
  v_before jsonb;
  v_admin  text;
  v_super  text;
begin
  -- 1. The Auth user
  select to_jsonb(u) into v_user from auth.users u where u.id = v_uid;
  if v_user is null then
    raise exception 'Auth user % does not exist in this project — create/check it in Authentication → Users first', v_uid;
  end if;
  if lower(v_user ->> 'email') is distinct from v_email then
    raise exception 'Auth user % has e-mail %, expected % — stop and check', v_uid, v_user ->> 'email', v_email;
  end if;
  if (v_user ->> 'email_confirmed_at') is null then
    raise exception 'Auth user % is not e-mail-confirmed — confirm it in Authentication → Users first', v_uid;
  end if;
  if (v_user ->> 'banned_until') is not null and (v_user ->> 'banned_until')::timestamptz > now() then
    raise exception 'Auth user % is banned until %', v_uid, v_user ->> 'banned_until';
  end if;
  if (v_user ->> 'deleted_at') is not null then
    raise exception 'Auth user % is soft-deleted', v_uid;
  end if;
  if exists (select 1 from auth.users where lower(email) = v_email and id <> v_uid) then
    raise exception 'Another Auth user also uses % — resolve duplicates in Authentication → Users first', v_email;
  end if;

  -- 2. The schema this file writes to (created by 01_schema.sql), and the functions from 02
  if to_regclass('public.admin_users') is null then
    raise exception 'public.admin_users does not exist — run 01_schema.sql first';
  end if;
  if (select count(*) from information_schema.columns
      where table_schema = 'public' and table_name = 'admin_users'
        and ((column_name = 'user_id' and udt_name = 'uuid')
          or (column_name = 'role' and data_type = 'text')
          or (column_name = 'is_active' and data_type = 'boolean'))) <> 3 then
    raise exception 'public.admin_users does not have user_id uuid / role text / is_active boolean — it was not created by 01_schema.sql. Stop and review (00_preflight_readonly.sql).';
  end if;
  if not exists (select 1 from pg_index i
                 join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any (i.indkey)
                 where i.indrelid = 'public.admin_users'::regclass and i.indisunique
                   and i.indnatts = 1 and a.attname = 'user_id') then
    raise exception 'public.admin_users.user_id is not UNIQUE — duplicates would be possible. Stop and review.';
  end if;
  if to_regprocedure('public.is_admin()') is null or to_regprocedure('public.is_super_admin()') is null then
    raise exception 'is_admin() / is_super_admin() missing — run 02_auth_functions_rls.sql first';
  end if;

  -- 3. Create or update the single row for this UID
  select to_jsonb(a) into v_before from public.admin_users a where a.user_id = v_uid;

  insert into public.admin_users (user_id, role, is_active)
  values (v_uid, 'super_admin', true)
  on conflict (user_id) do update set role = 'super_admin', is_active = true;

  raise notice 'admin_users row for %: %', v_uid,
    case when v_before is null then 'created' else 'already existed, set to super_admin/active (before: ' || v_before::text || ')' end;

  -- 4. Verify as that user (role switch inside a sub-block that is always undone; the row
  --    written in step 3 is outside the sub-block and stays)
  begin
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_uid::text, 'role', 'authenticated', 'aud', 'authenticated')::text, true);
    execute 'set local role authenticated';
    v_admin := coalesce(public.is_admin()::text, 'null');
    v_super := coalesce(public.is_super_admin()::text, 'null');
    raise exception 'ps_probe_done';
  exception when others then
    if sqlerrm <> 'ps_probe_done' then
      raise exception 'Verification of is_admin() failed: % %', sqlstate, sqlerrm;
    end if;
  end;

  if v_admin <> 'true' or v_super <> 'true' then
    raise exception 'After writing the row, is_admin() = % and is_super_admin() = % for % — rolled back, nothing saved', v_admin, v_super, v_uid;
  end if;

  raise notice 'VERIFIED: is_admin() = true and is_super_admin() = true for % (%).', v_uid, v_email;
end $$;

commit;
