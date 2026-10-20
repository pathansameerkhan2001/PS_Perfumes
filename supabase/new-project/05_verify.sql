-- ============================================================================
-- PS PERFUMES — NEW PROJECT, STEP 5 of 5: verification (leaves nothing behind)
-- Target: ps-perfumes-production (project ref pwacxxrghlglvdtclbig)
-- Run the WHOLE file in the SQL Editor after steps 1–4, and again after a data import.
-- Export the result grid as CSV.
--
-- Part A writes nothing. Part B simulates requests as "anon" and as the administrator
-- (role switch + JWT claims, like PostgREST and the Storage API do). Every probe runs in a
-- sub-block that always ends with RAISE EXCEPTION, so PostgreSQL rolls back every row it
-- inserted. A row in storage.objects never creates a file. The only thing kept is a session
-- setting holding the result text, gone when the editor connection closes.
--
-- EXPECTED
--   project_tables_rls_off          []        (every application table has RLS on)
--   functions_missing               []
--   admin_auth_user                 exists true, email brandnix.in@gmail.com, email_confirmed true
--   admin_row                       role super_admin, is_active true (exactly one row)
--   bucket                          id Ps-perfumes-media, public true
--   storage_policies                ps_media_admin_select / _insert / _delete
--   anon_read_products              OK (n)    anon_read_orders     0 rows visible
--   anon_insert_product             REJECTED  anon_insert_order    REJECTED
--   anon_storage_insert             REJECTED
--   admin_is_admin                  true      admin_storage_insert ALLOWED
--   admin_storage_insert_returning  ALLOWED   admin_storage_wrong_folder REJECTED
--   admin_insert_product            ALLOWED   other_user_is_admin  false
-- ============================================================================

do $$
declare
  v_admin   uuid;
  v_email   text := 'brandnix.in@gmail.com';
  v_stamp   text := to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS');
  v_res     jsonb := '{}'::jsonb;
  v_val     text;
  v_n       bigint;
  v_tmp     uuid;
begin
  -- ---------------- Part A: catalogue checks (read-only) ----------------
  v_res := v_res || jsonb_build_object('project_tables_rls_off', (
    select coalesce(jsonb_agg(c.relname order by c.relname), '[]'::jsonb)
    from pg_class c
    where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and not c.relrowsecurity));

  v_res := v_res || jsonb_build_object('functions_missing', (
    select coalesce(jsonb_agg(f), '[]'::jsonb)
    from unnest(array['is_admin()', 'is_super_admin()', 'validate_coupon(text,numeric)',
                      'place_order(jsonb,jsonb,text,text)', 'admin_delete_product(uuid)',
                      'admin_list_admin_users()', 'admin_grant_admin(text,text)',
                      'admin_update_admin(uuid,text,boolean)', 'admin_revoke_admin(uuid)']) as f
    where to_regprocedure('public.' || f) is null));

  -- The initial Super Admin, by exact Auth UID (not looked up by e-mail)
  select id into v_admin from auth.users where id = 'a5b3ff02-8d08-454a-8474-d5f51a4d890f'::uuid;
  v_res := v_res || jsonb_build_object('admin_auth_user', (
    select coalesce(jsonb_build_object('exists', true, 'email', u.email,
                                       'email_confirmed', u.email_confirmed_at is not null),
                    jsonb_build_object('exists', false))
    from (select 1) one left join auth.users u on u.id = v_admin));
  v_res := v_res || jsonb_build_object('admin_row', (
    select coalesce(jsonb_agg(jsonb_build_object('role', au.role, 'is_active', au.is_active)), '[]'::jsonb)
    from public.admin_users au where au.user_id = v_admin));
  v_res := v_res || jsonb_build_object('admin_users_total', (select count(*) from public.admin_users));

  v_res := v_res || jsonb_build_object('bucket', (
    select coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'public', b.public, 'file_size_limit', b.file_size_limit,
                                                 'allowed_mime_types', b.allowed_mime_types)), '[]'::jsonb)
    from storage.buckets b where lower(b.id) like 'ps-perfumes%'));

  v_res := v_res || jsonb_build_object('storage_policies', (
    select coalesce(jsonb_agg(jsonb_build_object('name', policyname, 'cmd', cmd, 'permissive', permissive,
                                                 'roles', roles) order by policyname), '[]'::jsonb)
    from pg_policies where schemaname = 'storage' and tablename = 'objects'));

  v_res := v_res || jsonb_build_object('row_counts', jsonb_build_object(
    'categories', (select count(*) from public.categories),
    'products', (select count(*) from public.products),
    'product_variants', (select count(*) from public.product_variants),
    'product_images', (select count(*) from public.product_images),
    'combos', (select count(*) from public.combos),
    'combo_items', (select count(*) from public.combo_items),
    'reviews', (select count(*) from public.reviews),
    'hero_slides', (select count(*) from public.hero_slides),
    'instagram_reels', (select count(*) from public.instagram_reels),
    'homepage_sections', (select count(*) from public.homepage_sections),
    'store_settings', (select count(*) from public.store_settings),
    'coupons', (select count(*) from public.coupons),
    'customers', (select count(*) from public.customers),
    'orders', (select count(*) from public.orders),
    'order_items', (select count(*) from public.order_items),
    'storage_objects', (select count(*) from storage.objects where bucket_id = 'Ps-perfumes-media')));

  -- Stored URLs still pointing at the OLD project (must be 0 after 06_post_import_fixups.sql)
  v_res := v_res || jsonb_build_object('old_project_url_refs', (
    (select count(*) from public.products where main_image_url like '%jnrmmhzhhmjxefapkemv%' or fragrance_notes::text like '%jnrmmhzhhmjxefapkemv%')
    + (select count(*) from public.categories where image_url like '%jnrmmhzhhmjxefapkemv%')
    + (select count(*) from public.combos where image_url like '%jnrmmhzhhmjxefapkemv%')
    + (select count(*) from public.hero_slides where image_url like '%jnrmmhzhhmjxefapkemv%' or mobile_image_url like '%jnrmmhzhhmjxefapkemv%')
    + (select count(*) from public.instagram_reels where thumbnail_url like '%jnrmmhzhhmjxefapkemv%')
    + (select count(*) from public.homepage_sections where image_url like '%jnrmmhzhhmjxefapkemv%' or settings::text like '%jnrmmhzhhmjxefapkemv%')
    + (select count(*) from public.product_images where image_url like '%jnrmmhzhhmjxefapkemv%')
    + (select count(*) from public.store_settings where setting_value like '%jnrmmhzhhmjxefapkemv%')));

  -- ---------------- Part B: simulated requests (always rolled back) ----------------
  -- B1. Anonymous visitor
  begin
    perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
    execute 'set local role anon';

    begin
      select count(*) into v_n from public.products;
      v_val := 'OK (' || v_n || ' active products visible)';
    exception when others then v_val := 'ERROR: ' || sqlstate || ' ' || sqlerrm; end;
    v_res := v_res || jsonb_build_object('anon_read_products', v_val);

    begin
      select count(*) into v_n from public.orders;
      v_val := v_n || ' rows visible';
    exception when others then v_val := 'REJECTED: ' || sqlstate; end;
    v_res := v_res || jsonb_build_object('anon_read_orders', v_val);

    begin
      insert into public.products (name, slug) values ('zz-probe', 'zz-probe-' || v_stamp);
      v_val := 'ALLOWED (UNEXPECTED)';
    exception when others then v_val := 'REJECTED: ' || sqlstate; end;
    v_res := v_res || jsonb_build_object('anon_insert_product', v_val);

    begin
      insert into public.orders (order_number, customer_name) values ('ZZ-' || v_stamp, 'probe');
      v_val := 'ALLOWED (UNEXPECTED)';
    exception when others then v_val := 'REJECTED: ' || sqlstate; end;
    v_res := v_res || jsonb_build_object('anon_insert_order', v_val);

    begin
      insert into storage.objects (bucket_id, name) values ('Ps-perfumes-media', 'products/zz-probe-anon-' || v_stamp || '.webp');
      v_val := 'ALLOWED (UNEXPECTED)';
    exception when others then v_val := 'REJECTED: ' || sqlstate; end;
    v_res := v_res || jsonb_build_object('anon_storage_insert', v_val);

    raise exception 'ps_probe_rollback';
  exception when others then
    if sqlerrm <> 'ps_probe_rollback' then
      v_res := v_res || jsonb_build_object('anon_setup_error', sqlstate || ' ' || sqlerrm);
    end if;
  end;

  -- B2. Administrator
  if v_admin is not null then
    begin
      perform set_config('request.jwt.claims',
        json_build_object('sub', v_admin::text, 'role', 'authenticated', 'email', v_email, 'aud', 'authenticated')::text, true);
      execute 'set local role authenticated';

      begin v_val := coalesce(public.is_admin()::text, 'null');
      exception when others then v_val := 'ERROR: ' || sqlstate || ' ' || sqlerrm; end;
      v_res := v_res || jsonb_build_object('admin_is_admin', v_val);

      begin
        insert into storage.objects (bucket_id, name) values ('Ps-perfumes-media', 'products/zz-probe-admin-' || v_stamp || '.webp');
        v_val := 'ALLOWED';
      exception when others then v_val := 'REJECTED: ' || sqlstate || ' ' || sqlerrm; end;
      v_res := v_res || jsonb_build_object('admin_storage_insert', v_val);

      begin
        insert into storage.objects (bucket_id, name) values ('Ps-perfumes-media', 'products/zz-probe-ret-' || v_stamp || '.webp')
        returning id into v_tmp;
        v_val := 'ALLOWED';
      exception when others then v_val := 'REJECTED: ' || sqlstate || ' ' || sqlerrm; end;
      v_res := v_res || jsonb_build_object('admin_storage_insert_returning', v_val);

      begin
        insert into storage.objects (bucket_id, name) values ('Ps-perfumes-media', 'zz-not-allowed/zz-probe-' || v_stamp || '.webp');
        v_val := 'ALLOWED (UNEXPECTED)';
      exception when others then v_val := 'REJECTED (expected): ' || sqlstate; end;
      v_res := v_res || jsonb_build_object('admin_storage_wrong_folder', v_val);

      begin
        insert into public.products (name, slug) values ('zz-probe', 'zz-probe-admin-' || v_stamp) returning id into v_tmp;
        v_val := 'ALLOWED';
      exception when others then v_val := 'REJECTED: ' || sqlstate || ' ' || sqlerrm; end;
      v_res := v_res || jsonb_build_object('admin_insert_product', v_val);

      raise exception 'ps_probe_rollback';
    exception when others then
      if sqlerrm <> 'ps_probe_rollback' then
        v_res := v_res || jsonb_build_object('admin_setup_error', sqlstate || ' ' || sqlerrm);
      end if;
    end;
  else
    v_res := v_res || jsonb_build_object('admin_is_admin', 'SKIPPED — Auth user a5b3ff02-8d08-454a-8474-d5f51a4d890f not found');
  end if;

  -- B3. A signed-in user who is not in admin_users (same e-mail domain tricks must not help)
  begin
    perform set_config('request.jwt.claims',
      json_build_object('sub', gen_random_uuid()::text, 'role', 'authenticated', 'email', 'admin@psperfumes.com',
                        'user_metadata', json_build_object('role', 'super_admin'))::text, true);
    execute 'set local role authenticated';
    v_res := v_res || jsonb_build_object('other_user_is_admin', coalesce(public.is_admin()::text, 'null'));
    raise exception 'ps_probe_rollback';
  exception when others then
    if sqlerrm <> 'ps_probe_rollback' then
      v_res := v_res || jsonb_build_object('other_user_setup_error', sqlstate || ' ' || sqlerrm);
    end if;
  end;

  perform set_config('ps.verify', v_res::text, false);
end $$;

select key as check_name, value as result
from jsonb_each_text(coalesce(nullif(current_setting('ps.verify', true), ''), '{"error":"run the whole file in one go"}')::jsonb)
order by key;
