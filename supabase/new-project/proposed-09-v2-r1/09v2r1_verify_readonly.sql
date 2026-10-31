-- ============================================================================
-- PS PERFUMES — STEP 9 v2 POST-MIGRATION VERIFICATION (READ-ONLY), REVISION r1
-- Target: ps-perfumes-production (project ref pwacxxrghlglvdtclbig)
-- Status: PROPOSED. One read-only check, then one SELECT; it changes nothing.
--
-- Run the whole file in the SQL Editor after 09v2_razorpay_payments.sql. Only change from
-- 09v2_verify_readonly.sql: run before the migration, it now stops with a plain message instead of
-- 'column "receipt_token" does not exist'.
-- Every row with ok = false needs review. ok = null: compare with the pre-check export.
-- ============================================================================

do $$
begin
  if (select count(*) from information_schema.columns
      where table_schema = 'public' and table_name = 'orders'
        and column_name in ('razorpay_order_id', 'razorpay_payment_id', 'duplicate_payment_id', 'paid_at',
                            'payment_error', 'coupon_code', 'receipt_token',
                            'customer_email_sent_at', 'owner_email_sent_at')) <> 9
     or to_regprocedure('public.place_order_core(jsonb, jsonb, text, text, uuid)') is null then
    raise exception 'Migration 09 v2 is not applied, so nothing was verified. No data was changed.';
  end if;
end $$;

with
server_fns(sig) as (
  values ('place_order_core(jsonb,jsonb,text,text,uuid)'),
         ('attach_razorpay_order(uuid,text)'),
         ('mark_order_paid(text,text,bigint)'),
         ('record_payment_failure(text,text)'),
         ('get_payment_order(text)'),
         ('get_order_receipt(uuid)'),
         ('claim_order_email(uuid,text)'),
         ('release_order_email(uuid,text)')
),
fn_state as (
  select sig, to_regprocedure('public.' || sig) as oid from server_fns
),
columns_wanted(c) as (
  values ('idempotency_key'), ('razorpay_order_id'), ('razorpay_payment_id'), ('duplicate_payment_id'),
         ('paid_at'), ('payment_error'), ('coupon_code'), ('receipt_token'),
         ('customer_email_sent_at'), ('owner_email_sent_at')
),
target as (
  select to_regprocedure('public.place_order(jsonb, jsonb, text, text, uuid)') as fn
)
select * from (
  select '1 COD unchanged' as section, 'exactly one place_order' as check_name,
         (select count(*) = 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'place_order') as ok,
         (select coalesce(string_agg(pg_get_function_identity_arguments(oid), ' | '), 'none')
            from pg_proc where pronamespace = 'public'::regnamespace and proname = 'place_order') as detail
  union all
  select '1 COD unchanged', 'place_order body identical to step 08 (fingerprint)',
         coalesce((select md5(ltrim(replace(p.prosrc, E'\r', ''), E'\n')) = 'f58df5ff55e84e958d1e27336cd82f6e'
                   from pg_proc p join target t on p.oid = t.fn), false),
         coalesce((select md5(ltrim(replace(p.prosrc, E'\r', ''), E'\n'))
                   from pg_proc p join target t on p.oid = t.fn), 'missing')
  union all
  select '1 COD unchanged', 'visitors can run place_order (COD checkout)',
         coalesce((select has_function_privilege('anon', fn::oid, 'EXECUTE') from target), false), 'expect true'
  union all
  select '1 COD unchanged', 'signed-in users can run place_order',
         coalesce((select has_function_privilege('authenticated', fn::oid, 'EXECUTE') from target), false), 'expect true'

  union all
  select '2 structure', 'order columns present',
         not exists (select 1 from columns_wanted w where not exists (
           select 1 from information_schema.columns
           where table_schema = 'public' and table_name = 'orders' and column_name = w.c)),
         coalesce((select string_agg(w.c, ', ') from columns_wanted w where not exists (
           select 1 from information_schema.columns
           where table_schema = 'public' and table_name = 'orders' and column_name = w.c)), 'none missing')
  union all
  select '2 structure', 'receipt_token has a default for new rows',
         exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'orders' and column_name = 'receipt_token'
                   and column_default like 'gen_random_uuid()%'),
         'expect true'
  union all
  select '2 structure', 'three unique payment indexes present and valid',
         (select count(*) = 3 from pg_index ix join pg_class c on c.oid = ix.indexrelid
           where ix.indrelid = 'public.orders'::regclass and ix.indisunique and ix.indisvalid
             and c.relname in ('orders_razorpay_order_id_key', 'orders_razorpay_payment_id_key', 'orders_receipt_token_key')),
         'expect true'
  union all
  select '2 structure', 'payment guard trigger enabled on INSERT and UPDATE',
         exists (select 1 from pg_trigger
                 where tgrelid = 'public.orders'::regclass and tgname = 'ps_orders_payment_guard' and tgenabled = 'O'
                   and tgtype & 4 <> 0 and tgtype & 16 <> 0),
         'expect true'
  union all
  select '2 structure', 'payment guard is the strict version',
         coalesce((select position('Payment details of a Razorpay order cannot be edited' in prosrc) > 0
                   from pg_proc where oid = to_regprocedure('public.ps_orders_payment_guard()')::oid), false),
         'expect true'
  union all
  select '2 structure', 'Razorpay server functions present',
         not exists (select 1 from fn_state where oid is null),
         coalesce((select string_agg(sig, ', ') from fn_state where oid is null), 'none missing')

  union all
  select '3 privileges', 'server functions callable by service_role',
         not exists (select 1 from fn_state where oid is null or not has_function_privilege('service_role', oid, 'EXECUTE')),
         'expect true'
  union all
  select '3 privileges', 'server functions NOT callable by visitors or signed-in users',
         not exists (select 1 from fn_state where oid is null
                       or has_function_privilege('anon', oid, 'EXECUTE')
                       or has_function_privilege('authenticated', oid, 'EXECUTE')),
         'a visitor must never be able to mark an order paid'
  union all
  select '3 privileges', 'guard function not callable by visitors or signed-in users',
         coalesce((select not has_function_privilege('anon', f, 'EXECUTE') and not has_function_privilege('authenticated', f, 'EXECUTE')
                   from to_regprocedure('public.ps_orders_payment_guard()') f), false),
         'expect true'
  union all
  select '3 privileges', 'visitors cannot read orders',
         not (has_table_privilege('anon', 'public.orders', 'SELECT') or has_table_privilege('anon', 'public.order_items', 'SELECT')),
         'expect true'
  union all
  select '3 privileges', 'RLS on orders and order_items',
         (select bool_and(relrowsecurity) from pg_class where oid in ('public.orders'::regclass, 'public.order_items'::regclass)),
         'expect true'

  union all
  select '4 data', 'every Razorpay order that can be paid has a receipt token',
         not exists (select 1 from public.orders where payment_method = 'RAZORPAY' and receipt_token is null
                       and not (order_status = 'cancelled' and payment_status in ('pending', 'failed'))),
         'a cancelled unpaid order kept by 09_rollback_cleanup_optional.sql has none and needs none'
  union all
  select '4 data', 'no paid Razorpay order without a payment id or paid date',
         not exists (select 1 from public.orders where payment_method = 'RAZORPAY' and payment_status = 'paid'
                       and (razorpay_payment_id is null or paid_at is null)),
         'expect true'
  union all
  select '4 data', 'no unpaid Razorpay order is being processed',
         not exists (select 1 from public.orders where payment_method = 'RAZORPAY' and payment_status in ('pending', 'failed')
                       and order_status not in ('pending', 'cancelled')),
         'expect true'
  union all
  select '4 data', 'no second payment awaiting a refund decision',
         not exists (select 1 from public.orders where duplicate_payment_id is not null),
         'expect true'
  union all
  select '4 data', 'orders by method and payment status (info)', null,
         (select coalesce(jsonb_agg(x)::text, '[]') from (
            select payment_method, payment_status, count(*) as n
            from public.orders group by 1, 2 order by 1, 2) x)

  union all
  select '5 compare with pre-check', 'orders (must not be lower)', null, (select count(*)::text from public.orders)
  union all
  select '5 compare with pre-check', 'order_items (must not be lower)', null, (select count(*)::text from public.order_items)
  union all
  select '5 compare with pre-check', 'customers', null, (select count(*)::text from public.customers)
  union all
  select '5 compare with pre-check', 'coupons (rows / total used_count)', null,
         (select count(*)::text || ' / ' || coalesce(sum(used_count), 0)::text from public.coupons)
  union all
  select '5 compare with pre-check', 'products / variants (expect 71 / 312)', null,
         (select count(*) from public.products)::text || ' / ' || (select count(*) from public.product_variants)::text
  union all
  select '5 compare with pre-check', 'latest order update (moves only with real order activity)', null,
         (select coalesce(max(updated_at)::text, 'none') from public.orders)
) checks
order by section, check_name;
