-- ============================================================================
-- PS PERFUMES — NEW PROJECT: read-only check of STEP 2 (02_auth_functions_rls.sql)
-- Target: ps-perfumes-production (project ref pwacxxrghlglvdtclbig)
--
-- Use when 02 reports "policy … already exists": it shows whether Step 2 is already fully
-- applied (then do NOT re-run it — go to 03_storage.sql), or partially/differently applied.
-- Writes nothing. The is_admin() probe switches role inside a sub-block that is always rolled
-- back. Run the WHOLE file; export the result grid as CSV.
--
-- VERDICT
--   step2_complete = true   every function, all 28 ps_* policies with the expected command,
--                           roles and expressions, no unexpected policies, RLS on, no anon writes
--   step2_complete = false  read the other rows: functions_missing, policies_missing,
--                           policies_wrong, policies_unexpected, rls_off, anon_write_grants
-- is_admin_for_admin_uid is "false" until 04_bootstrap_admin.sql has been applied — expected.
-- ============================================================================

do $$
declare
  v_uid      constant uuid := 'a5b3ff02-8d08-454a-8474-d5f51a4d890f';
  v_tables   constant text[] := array['admin_users', 'categories', 'products', 'product_variants', 'product_images',
                                      'combos', 'combo_items', 'reviews', 'hero_slides', 'instagram_reels',
                                      'homepage_sections', 'store_settings', 'coupons', 'customers', 'orders', 'order_items'];
  v_manage   constant text[] := array['categories', 'products', 'product_variants', 'product_images', 'combos',
                                      'combo_items', 'reviews', 'hero_slides', 'instagram_reels', 'homepage_sections',
                                      'store_settings', 'coupons', 'customers', 'orders', 'order_items'];
  v_public   constant text[] := array['categories', 'products', 'product_variants', 'product_images', 'combos',
                                      'combo_items', 'reviews', 'hero_slides', 'instagram_reels', 'homepage_sections',
                                      'store_settings'];
  v_res      jsonb := '{}'::jsonb;
  v_expected jsonb;   -- [{table, name, cmd, roles}]
  v_missing  jsonb;
  v_wrong    jsonb;
  v_extra    jsonb;
  v_fmissing jsonb;
  v_rlsoff   jsonb;
  v_anonw    jsonb;
  v_txt      text;
begin
  -- Expected policies (28): ps_admin_manage_<t> ALL {authenticated}; ps_public_read_<t> SELECT {anon,authenticated};
  -- admin_users: ps_admin_users_read_own + ps_admin_users_admin_read, SELECT {authenticated}
  select jsonb_agg(e) into v_expected from (
    select jsonb_build_object('table', t, 'name', 'ps_admin_manage_' || t, 'cmd', 'ALL', 'roles', '{authenticated}') as e
    from unnest(v_manage) t
    union all
    select jsonb_build_object('table', t, 'name', 'ps_public_read_' || t, 'cmd', 'SELECT', 'roles', '{anon,authenticated}')
    from unnest(v_public) t
    union all
    select jsonb_build_object('table', 'admin_users', 'name', n, 'cmd', 'SELECT', 'roles', '{authenticated}')
    from unnest(array['ps_admin_users_read_own', 'ps_admin_users_admin_read']) n
  ) x;
  v_res := v_res || jsonb_build_object('policies_expected_count', jsonb_array_length(v_expected));

  select coalesce(jsonb_agg(e ->> 'table' || '.' || (e ->> 'name')), '[]'::jsonb) into v_missing
  from jsonb_array_elements(v_expected) e
  where not exists (select 1 from pg_policies p
                    where p.schemaname = 'public' and p.tablename = e ->> 'table' and p.policyname = e ->> 'name');

  -- Present but with a different command / roles / permissiveness / expression
  select coalesce(jsonb_agg(jsonb_build_object('policy', p.tablename || '.' || p.policyname, 'cmd', p.cmd,
                                               'permissive', p.permissive, 'roles', p.roles,
                                               'using', p.qual, 'check', p.with_check)), '[]'::jsonb)
    into v_wrong
  from jsonb_array_elements(v_expected) e
  join pg_policies p on p.schemaname = 'public' and p.tablename = e ->> 'table' and p.policyname = e ->> 'name'
  where p.cmd <> e ->> 'cmd'
     or p.permissive <> 'PERMISSIVE'
     or p.roles::text <> e ->> 'roles'
     -- admin manage: both expressions must be exactly is_admin()
     or (p.policyname like 'ps_admin_manage_%'
         and (coalesce(p.qual, '') !~ '^\(?(public\.)?is_admin\(\)\)?$'
              or coalesce(p.with_check, '') !~ '^\(?(public\.)?is_admin\(\)\)?$'))
     -- public read: must not call is_admin() and must not be unconditional, except homepage_sections
     or (p.policyname like 'ps_public_read_%'
         and (p.with_check is not null
              or (p.tablename <> 'homepage_sections' and coalesce(p.qual, 'true') = 'true')))
     or (p.policyname = 'ps_admin_users_read_own' and coalesce(p.qual, '') !~ 'user_id = auth\.uid\(\)')
     or (p.policyname = 'ps_admin_users_admin_read' and coalesce(p.qual, '') !~ '^\(?(public\.)?is_admin\(\)\)?$');

  -- Any other policy on these tables (permissive policies are OR-ed: an extra one could widen access)
  select coalesce(jsonb_agg(jsonb_build_object('policy', p.tablename || '.' || p.policyname, 'cmd', p.cmd,
                                               'permissive', p.permissive, 'roles', p.roles,
                                               'using', p.qual, 'check', p.with_check)), '[]'::jsonb)
    into v_extra
  from pg_policies p
  where p.schemaname = 'public' and p.tablename = any (v_tables)
    and not exists (select 1 from jsonb_array_elements(v_expected) e
                    where e ->> 'table' = p.tablename and e ->> 'name' = p.policyname);

  select coalesce(jsonb_agg(f), '[]'::jsonb) into v_fmissing
  from unnest(array['is_admin()', 'is_super_admin()', 'validate_coupon(text,numeric)',
                    'place_order(jsonb,jsonb,text,text)', 'admin_delete_product(uuid)',
                    'admin_list_admin_users()', 'admin_grant_admin(text,text)',
                    'admin_update_admin(uuid,text,boolean)', 'admin_revoke_admin(uuid)']) f
  where to_regprocedure('public.' || f) is null;

  select coalesce(jsonb_agg(t), '[]'::jsonb) into v_rlsoff
  from unnest(v_tables) t
  where to_regclass('public.' || t) is null
     or not (select c.relrowsecurity from pg_class c where c.oid = ('public.' || t)::regclass);

  select coalesce(jsonb_agg(g.table_name || ':' || g.privilege_type), '[]'::jsonb) into v_anonw
  from information_schema.role_table_grants g
  where g.table_schema = 'public' and g.grantee in ('anon', 'PUBLIC') and g.privilege_type <> 'SELECT';

  v_res := v_res || jsonb_build_object(
    'functions_missing', v_fmissing,
    'policies_missing', v_missing,
    'policies_wrong', v_wrong,
    'policies_unexpected', v_extra,
    'rls_off', v_rlsoff,
    'anon_write_grants', v_anonw,
    'policies_present_count', (select count(*) from pg_policies p
                               where p.schemaname = 'public' and p.tablename = any (v_tables)),
    'function_security', (
      select coalesce(jsonb_agg(jsonb_build_object('name', p.proname, 'security_definer', p.prosecdef,
                                                   'search_path_set', p.proconfig is not null) order by p.proname), '[]'::jsonb)
      from pg_proc p
      where p.pronamespace = 'public'::regnamespace
        and p.proname in ('is_admin', 'is_super_admin', 'validate_coupon', 'place_order', 'admin_delete_product',
                          'admin_list_admin_users', 'admin_grant_admin', 'admin_update_admin', 'admin_revoke_admin')),
    'anon_can_execute', (
      select coalesce(jsonb_agg(p.proname order by p.proname), '[]'::jsonb)
      from pg_proc p
      where p.pronamespace = 'public'::regnamespace and has_function_privilege('anon', p.oid, 'EXECUTE')),
    'admin_users_rows_for_uid', (select count(*) from public.admin_users where user_id = v_uid));

  v_res := v_res || jsonb_build_object('step2_complete',
    jsonb_array_length(v_fmissing) = 0 and jsonb_array_length(v_missing) = 0 and jsonb_array_length(v_wrong) = 0
    and jsonb_array_length(v_extra) = 0 and jsonb_array_length(v_rlsoff) = 0 and jsonb_array_length(v_anonw) = 0);

  -- What is_admin() returns for the administrator's JWT (always rolled back)
  if to_regprocedure('public.is_admin()') is not null then
    begin
      perform set_config('request.jwt.claims',
        json_build_object('sub', v_uid::text, 'role', 'authenticated', 'aud', 'authenticated')::text, true);
      execute 'set local role authenticated';
      begin
        v_txt := coalesce(public.is_admin()::text, 'null');
      exception when others then
        v_txt := 'ERROR: ' || sqlstate || ' ' || sqlerrm;
      end;
      v_res := v_res || jsonb_build_object('is_admin_for_admin_uid', v_txt);
      raise exception 'ps_probe_rollback';
    exception when others then
      if sqlerrm <> 'ps_probe_rollback' then
        v_res := v_res || jsonb_build_object('is_admin_probe_error', sqlstate || ' ' || sqlerrm);
      end if;
    end;
  end if;

  perform set_config('ps.check2', v_res::text, false);
end $$;

select key as check_name, value as result
from jsonb_each_text(coalesce(nullif(current_setting('ps.check2', true), ''), '{"error":"run the whole file in one go"}')::jsonb)
order by key;
