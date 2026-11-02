-- Test helpers for Migration 11. Every charge and PIN code used by the tests is a TEST FIXTURE,
-- not a business value: real rates are entered by the owner in Admin → Shipping.
create schema t11;

create function t11.cust(p_pin text, p_extra jsonb default '{}') returns text language sql as $$
  select (jsonb_build_object('first_name','A','last_name','B','email','a@example.com','phone','9876543210',
    'address','1 Street','city','Kadapa','state','AP','pincode',p_pin,'landmark','') || p_extra)::text $$;

-- One cart line: v:<variant suffix> or c:<combo suffix>
create function t11.line(p_ref text, p_q int) returns jsonb language sql as $$
  select case when left(p_ref, 2) = 'c:'
    then jsonb_build_object('type','combo','combo_id','00000000-0000-0000-0000-0000000000' || substr(p_ref, 3),'quantity',p_q)
    else jsonb_build_object('type','variant','variant_id','00000000-0000-0000-0000-0000000000' || substr(p_ref, 3),'quantity',p_q) end $$;

-- Places an order as the real caller would (COD as a visitor, Razorpay as the server) and returns
-- "OK subtotal/shipping/discount/total", or the error
create function t11.buy(p_fn text, p_pin text, p_items jsonb, p_coupon text default null, p_key text default null,
                        p_extra jsonb default '{}') returns text language sql as $$
  select t.run(case when p_fn = 'place_order' then 'anon' else 'service_role' end, null,
    format('select (x->>%L)||''/''||(x->>%L)||''/''||(x->>%L)||''/''||(x->>%L) from (select public.%I(%L::jsonb,%L::jsonb,%L,%L,%L::uuid) x) s',
      'subtotal', 'shipping_amount', 'discount_amount', 'total_amount',
      p_fn, t11.cust(p_pin, p_extra), p_items::text, p_coupon,
      case when p_fn = 'place_order' then 'COD' else 'RAZORPAY' end, p_key)) $$;

-- As the signed-in admin of the fixtures: any insert/update/delete, reports rows changed or the error
create function t11.admin(p_stmt text, p_uid text default '00000000-0000-0000-0000-0000000000e1') returns text language sql as $$
  select t.run('authenticated', p_uid, format('with u as (%s returning 1) select count(*)::text from u', p_stmt)) $$;
