-- ============================================================================
-- PS PERFUMES — STEPS 08 + 09 VERIFICATION (READ-ONLY)
-- Target: ps-perfumes-production (project ref pwacxxrghlglvdtclbig)
-- Changes nothing (plain SELECTs on the catalogue and a count of orders). Safe before and after
-- the migrations: before 08 and 09 the ok column simply shows false.
-- Run the WHOLE file in the SQL Editor. After step 09, every row with ok = false needs review;
-- ok = null is informational.
-- ============================================================================

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
)
select * from (
  select '08' as step, 'place_order has the 5-argument signature' as check_name,
         to_regprocedure('public.place_order(jsonb,jsonb,text,text,uuid)') is not null as ok,
         coalesce((select string_agg(pg_get_function_identity_arguments(oid), ' | ')
                   from pg_proc where pronamespace = 'public'::regnamespace and proname = 'place_order'), 'none') as detail
  union all
  select '08/09', 'exactly one place_order',
         (select count(*) = 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'place_order'),
         (select count(*)::text from pg_proc where pronamespace = 'public'::regnamespace and proname = 'place_order')
  union all
  select '08/09', 'order columns present',
         not exists (select 1 from columns_wanted w where not exists (
           select 1 from information_schema.columns
           where table_schema = 'public' and table_name = 'orders' and column_name = w.c)),
         coalesce((select string_agg(w.c, ', ') from columns_wanted w where not exists (
           select 1 from information_schema.columns
           where table_schema = 'public' and table_name = 'orders' and column_name = w.c)), 'none missing')
  union all
  select '09', 'server functions present',
         not exists (select 1 from fn_state where oid is null),
         coalesce((select string_agg(sig, ', ') from fn_state where oid is null), 'none missing')
  union all
  select '09', 'server functions callable by service_role',
         not exists (select 1 from fn_state where oid is null or not has_function_privilege('service_role', oid, 'EXECUTE')),
         'expect all'
  union all
  select '09', 'server functions NOT callable by visitors or signed-in users',
         not exists (select 1 from fn_state where oid is null
                       or has_function_privilege('anon', oid, 'EXECUTE')
                       or has_function_privilege('authenticated', oid, 'EXECUTE')),
         'a visitor must never be able to mark an order paid'
  union all
  select '09', 'visitors can still call place_order (COD checkout)',
         coalesce(has_function_privilege('anon', to_regprocedure('public.place_order(jsonb,jsonb,text,text,uuid)'), 'EXECUTE'), false),
         'expect true'
  union all
  select '09', 'payment guard trigger enabled on INSERT and UPDATE',
         exists (select 1 from pg_trigger
                 where tgrelid = 'public.orders'::regclass and tgname = 'ps_orders_payment_guard' and tgenabled = 'O'
                   and tgtype & 4 <> 0 and tgtype & 16 <> 0),
         'expect true'
  union all
  select '09', 'payment guard is the strict version',
         coalesce((select position('Payment details of a Razorpay order cannot be edited' in prosrc) > 0
                   from pg_proc where oid = to_regprocedure('public.ps_orders_payment_guard()')::oid), false),
         'expect true'
  union all
  select '09', 'unique indexes on Razorpay ids and receipt token',
         (select count(*) = 3 from pg_indexes where schemaname = 'public' and tablename = 'orders'
            and indexname in ('orders_razorpay_order_id_key', 'orders_razorpay_payment_id_key', 'orders_receipt_token_key')),
         (select count(*)::text from pg_indexes where schemaname = 'public' and tablename = 'orders'
            and indexname in ('orders_razorpay_order_id_key', 'orders_razorpay_payment_id_key', 'orders_receipt_token_key'))
  union all
  select 'safety', 'visitors cannot read orders',
         not (has_table_privilege('anon', 'public.orders', 'SELECT') or has_table_privilege('anon', 'public.order_items', 'SELECT')),
         'expect true'
  union all
  select 'safety', 'RLS on orders and order_items',
         (select bool_and(relrowsecurity) from pg_class where oid in ('public.orders'::regclass, 'public.order_items'::regclass)),
         'expect true'
  union all
  select 'data', 'orders by method and payment status (info)', null,
         (select coalesce(jsonb_agg(x)::text, '[]') from (
            select payment_method, payment_status, count(*) as n
            from public.orders group by 1, 2 order by 1, 2) x)
  union all
  select 'data', 'catalogue row counts, unchanged by 08 and 09: expect 71 / 312 (info)', null,
         (select count(*) from public.products)::text || ' / ' || (select count(*) from public.product_variants)::text
) checks
order by step, check_name;

-- ============================================================================
-- After step 09 only, run this second query on its own: it reads the Razorpay columns, so it
-- fails with "column does not exist" before step 09. All three counts must be 0.
--
--   select
--     count(*) filter (where payment_method = 'RAZORPAY' and payment_status = 'paid'
--                        and (razorpay_payment_id is null or paid_at is null))   as paid_without_payment_id,
--     count(*) filter (where payment_method = 'RAZORPAY' and payment_status in ('pending', 'failed')
--                        and order_status not in ('pending', 'cancelled'))       as unpaid_but_dispatched,
--     count(*) filter (where duplicate_payment_id is not null)                   as second_payments_to_refund
--   from public.orders;
-- ============================================================================
