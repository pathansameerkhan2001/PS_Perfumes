-- Disposable test database only. PostgREST logs in as authenticator and switches to the role in the
-- request's JWT, as Supabase does. The test_ functions let the tests arrange and inspect rows.
create role authenticator login noinherit;
grant anon, authenticated, service_role to authenticator;

create function public.test_whoami() returns text language sql as $$ select current_user::text $$;
grant execute on function public.test_whoami() to anon, service_role;

create function public.test_new_order(p_key uuid, p_rz text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_order jsonb;
begin
  v_order := public.place_order_core(t.cust()::jsonb, t.items()::jsonb, null, 'RAZORPAY', p_key);
  perform public.attach_razorpay_order((v_order ->> 'order_id')::uuid, p_rz);
  return jsonb_build_object('id', v_order ->> 'order_id', 'paise', round((v_order ->> 'total_amount')::numeric * 100)::bigint);
end $$;

create function public.test_reset() returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  delete from public.notification_outbox where true;
end $$;

create function public.test_outbox() returns jsonb
language sql security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(to_jsonb(n) order by n.dedupe_key), '[]'::jsonb) from public.notification_outbox n
$$;

create function public.test_order(p_rz text) returns jsonb
language sql security definer set search_path = public, pg_temp as $$
  select to_jsonb(o) from public.orders o where o.razorpay_order_id = p_rz
$$;

create function public.test_set_order(p_rz text, p_order_status text, p_payment_status text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.orders
     set order_status = coalesce(p_order_status, order_status), payment_status = coalesce(p_payment_status, payment_status)
   where razorpay_order_id = p_rz;
end $$;

create function public.test_delete_order(p_rz text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  delete from public.order_items where order_id = (select id from public.orders where razorpay_order_id = p_rz);
  delete from public.orders where razorpay_order_id = p_rz;
end $$;

-- A worker crash or an elapsed retry wait, without really waiting
create function public.test_make_due() returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.notification_outbox
     set next_attempt_at = now() - interval '1 second',
         lease_expires_at = case when status = 'processing' then now() - interval '1 second' else lease_expires_at end
   where status in ('pending', 'processing');
end $$;

create function public.test_set_attempts(p_attempts int) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.notification_outbox set attempt_count = p_attempts where status in ('pending', 'processing');
end $$;

-- PIN code shipping with one test PIN code (a fixture, not a business rate), or back to legacy
create function public.test_shipping(p_pincode text, p_charge numeric) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.shipping_config set mode = 'legacy' where id;
  delete from public.shipping_pincodes where true;
  if p_pincode is not null then
    insert into public.shipping_pincodes (pincode, charge) values (p_pincode, p_charge);
    update public.shipping_config set fallback_allowed = false, free_shipping_rule = 'none', mode = 'pincode' where id;
  end if;
end $$;

create function public.test_fingerprints() returns jsonb
language sql security definer set search_path = public, pg_temp as $$
  select jsonb_object_agg(proname, md5(ltrim(replace(prosrc, E'\r', ''), E'\n')))
    from pg_proc
   where pronamespace = 'public'::regnamespace
     and proname in ('mark_order_paid', 'place_order', 'place_order_core', 'ps_orders_payment_guard',
                     'claim_order_email', 'release_order_email', 'get_payment_order')
$$;
