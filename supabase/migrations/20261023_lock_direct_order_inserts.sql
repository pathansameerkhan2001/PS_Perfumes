-- ============================================================================
-- PS PERFUMES — Close direct (browser-priced) order inserts
-- File: supabase/migrations/20261023_lock_direct_order_inserts.sql
-- Status: NOT YET APPLIED.
--
-- ORDER OF OPERATIONS — do not run this early:
--   1. 20261019_admin_media_and_product_delete.sql   (applied)
--   2. 20261022_server_side_checkout.sql              (applied; place_order exists)
--   3. Frontend that calls place_order is DEPLOYED and one test order succeeded
--   4. THEN run this file.
-- Running it before step 3 breaks checkout for the old frontend (it inserts directly).
--
-- What it does: removes every policy that lets anon/authenticated visitors INSERT into
-- orders / order_items directly, so the only way to create an order is place_order(), which
-- prices the order from the database. Admin policies (ps_admin_manage_*) are not touched.
-- RLS stays enabled. No rows are changed.
--
-- ROLLBACK: re-run section 5 "Anonymous checkout" of 20261019_admin_media_and_product_delete.sql
--           (it recreates ps_checkout_insert_orders / ps_checkout_insert_order_items).
-- ============================================================================

begin;

do $$
begin
  if to_regprocedure('public.place_order(jsonb, jsonb, text, text)') is null then
    raise exception 'public.place_order is not installed — apply 20261022_server_side_checkout.sql and deploy the new frontend first';
  end if;
end $$;

-- Names used by the 20261019 migration and by earlier repository scripts
drop policy if exists "ps_checkout_insert_orders"      on public.orders;
drop policy if exists "ps_checkout_insert_order_items" on public.order_items;
drop policy if exists "Anyone can create orders"        on public.orders;
drop policy if exists "Anyone can create order items"   on public.order_items;
drop policy if exists "Orders Insert Policy"            on public.orders;
drop policy if exists "Order Items Insert Policy"       on public.order_items;

-- Report anything else that still allows non-admin inserts (not changed automatically)
do $$
declare r record;
begin
  for r in
    select tablename, policyname, cmd, roles::text as roles, coalesce(with_check, '') as chk
    from pg_policies
    where schemaname = 'public' and tablename in ('orders', 'order_items')
      and cmd in ('INSERT', 'ALL')
      and policyname not like 'ps_admin_manage_%'
  loop
    raise notice 'REVIEW: %.% policy "%" (%, roles %, check %) may still allow direct inserts.',
      'public', r.tablename, r.policyname, r.cmd, r.roles, r.chk;
  end loop;
end $$;

commit;
