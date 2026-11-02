create schema t;
create table t.results (id serial, label text, verdict text, actual text);
create function t.run(p_role text, p_uid text, p_sql text) returns text language plpgsql as $$
declare v text;
begin
  perform set_config('app.uid', coalesce(p_uid, ''), false);
  begin
    perform set_config('role', p_role, true);
    execute p_sql into v;
    perform set_config('role', 'none', true);
    return 'OK ' || coalesce(v, 'null');
  exception when others then
    return 'ERR ' || sqlstate || ' ' || sqlerrm;
  end;
end $$;
create function t.chk(p_label text, p_actual text, p_like text) returns void language sql as $$
  insert into t.results (label, verdict, actual)
  values (p_label, case when coalesce(p_actual, '<null>') like p_like then 'PASS' else 'FAIL' end, left(coalesce(p_actual, '<null>'), 120));
$$;
create function t.cust(p_city text default 'Kadapa') returns text language sql as $$
  select jsonb_build_object('first_name','A','last_name','B','email','a@example.com','phone','9876543210',
    'address','1 Street','city',p_city,'state','AP','pincode','516001','landmark','')::text $$;
create function t.items(q int default 1) returns text language sql as $$
  select jsonb_build_array(jsonb_build_object('type','variant','variant_id','00000000-0000-0000-0000-00000000000a','quantity',q))::text $$;
create function t.sql(p_fn text, p_key text, p_coupon text, p_method text, p_q int default 1, p_city text default 'Kadapa') returns text language sql as $$
  select format('select public.%I(%L::jsonb,%L::jsonb,%L,%L,%L::uuid)::text', p_fn, t.cust(p_city), t.items(p_q), p_coupon, p_method, p_key) $$;
-- Creates and links an unpaid Razorpay order
create function t.rz(p_key text, p_rz text, p_coupon text default null) returns text language sql as $$
  select t.run('service_role', null, t.sql('place_order_core', p_key, p_coupon, 'RAZORPAY'))
      || t.run('service_role', null, format('select public.attach_razorpay_order((select id from public.orders where idempotency_key=%L),%L)', p_key, p_rz)) $$;
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000e1', 'editor@example.com'), ('00000000-0000-0000-0000-0000000000e2', 'plain@example.com');
insert into public.admin_users (user_id, role) values ('00000000-0000-0000-0000-0000000000e1', 'editor');
insert into public.products (id, name, slug) values ('00000000-0000-0000-0000-000000000001', 'Oud', 'oud');
insert into public.product_variants (id, product_id, bottle_type, size_ml, price, stock_quantity) values ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000001', 'Glass Bottle', '50 ml', 1000, 500);
insert into public.coupons (code, discount_type, discount_value, usage_limit) values ('TEN','percentage',10,null),('LIM','percentage',10,1),('FULL','percentage',100,null),('CODC','percentage',10,null);
-- v2: preservation evidence
create function t.snap() returns void language plpgsql as $$
declare tb text; h text; n bigint;
begin
  drop table if exists t.b_orders; drop table if exists t.b_tab;
  create table t.b_orders as select o.id, to_jsonb(o) j, o.xmin::text x, o.ctid::text c from public.orders o;
  create table t.b_tab (tb text, h text, n bigint);
  foreach tb in array array['order_items','customers','coupons','products','product_variants','categories','combos','combo_items','store_settings'] loop
    execute format('select md5(coalesce(string_agg(x::text, ''|'' order by x::text), '''')), count(*) from public.%I x', tb) into h, n;
    insert into t.b_tab values (tb, h, n);
  end loop;
end $$;
create function t.same() returns text language plpgsql as $$
declare r record; h text; n bigint; bad text := ''; total bigint; ok bigint;
begin
  select count(*) into total from public.orders;
  select count(*) into ok from public.orders o join t.b_orders b on b.id = o.id
   where (to_jsonb(o) - array['razorpay_order_id','razorpay_payment_id','duplicate_payment_id','paid_at','payment_error','coupon_code','receipt_token','customer_email_sent_at','owner_email_sent_at']) = b.j
     and o.xmin::text = b.x and o.ctid::text = b.c;
  if ok <> total or total <> (select count(*) from t.b_orders) then bad := bad || format('orders %s/%s ', ok, total); end if;
  for r in select * from t.b_tab loop
    execute format('select md5(coalesce(string_agg(x::text, ''|'' order by x::text), '''')), count(*) from public.%I x', r.tb) into h, n;
    if h <> r.h or n <> r.n then bad := bad || r.tb || ' '; end if;
  end loop;
  return coalesce(nullif(bad, ''), 'same');
end $$;
-- columns/functions/trigger/indexes of step 09 that exist: 0/0/0/0 means none
create function t.state() returns text language sql as $$
  select (select count(*) from information_schema.columns where table_schema='public' and table_name='orders' and column_name in ('razorpay_order_id','razorpay_payment_id','duplicate_payment_id','paid_at','payment_error','coupon_code','receipt_token','customer_email_sent_at','owner_email_sent_at'))
    || '/' || (select count(*) from pg_proc where pronamespace='public'::regnamespace and proname in ('place_order_core','attach_razorpay_order','mark_order_paid','record_payment_failure','get_payment_order','get_order_receipt','claim_order_email','release_order_email','ps_orders_payment_guard'))
    || '/' || (select count(*) from pg_trigger where tgname='ps_orders_payment_guard')
    || '/' || (select count(*) from pg_indexes where indexname in ('orders_razorpay_order_id_key','orders_razorpay_payment_id_key','orders_receipt_token_key')) $$;
create function t.fp() returns text language sql as $$
  select md5(ltrim(replace(prosrc, E'\r',''),E'\n')) from pg_proc where proname='place_order' $$;
-- Migration 10 adds no column to orders, so the whole row must match
create function t.same10() returns text language plpgsql as $$
declare r record; h text; n bigint; bad text := ''; total bigint; ok bigint;
begin
  select count(*) into total from public.orders;
  select count(*) into ok from public.orders o join t.b_orders b on b.id = o.id
   where to_jsonb(o) = b.j and o.xmin::text = b.x and o.ctid::text = b.c;
  if ok <> total or total <> (select count(*) from t.b_orders) then bad := bad || format('orders %s/%s ', ok, total); end if;
  for r in select * from t.b_tab loop
    execute format('select md5(coalesce(string_agg(x::text, ''|'' order by x::text), '''')), count(*) from public.%I x', r.tb) into h, n;
    if h <> r.h or n <> r.n then bad := bad || r.tb || ' '; end if;
  end loop;
  return coalesce(nullif(bad, ''), 'same');
end $$;
