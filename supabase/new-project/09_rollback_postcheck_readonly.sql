-- ============================================================================
-- PS PERFUMES — STEP 9 POST-ROLLBACK CHECK (READ-ONLY)
-- Target: ps-perfumes-production (project ref pwacxxrghlglvdtclbig)
-- Status: validated on a disposable local database only. One SELECT; it changes nothing. Run after 09_rollback.sql.
--
-- Every row with ok = false needs review. ok = null: compare with the preflight export.
-- Use this instead of 08_diagnostic_readonly.sql, which reports the kept guard trigger and
-- columns as differences. The fingerprint is the md5 of the place_order body of step 08.
-- ============================================================================

with
removed(sig) as (
  values ('place_order_core(jsonb,jsonb,text,text,uuid)'),
         ('attach_razorpay_order(uuid,text)'),
         ('mark_order_paid(text,text,bigint)'),
         ('record_payment_failure(text,text)'),
         ('get_payment_order(text)'),
         ('claim_order_email(uuid,text)'),
         ('release_order_email(uuid,text)')
),
kept_columns(c) as (
  values ('idempotency_key'), ('razorpay_order_id'), ('razorpay_payment_id'), ('duplicate_payment_id'),
         ('paid_at'), ('payment_error'), ('coupon_code'), ('receipt_token'),
         ('customer_email_sent_at'), ('owner_email_sent_at')
),
target as (
  select to_regprocedure('public.place_order(jsonb, jsonb, text, text, uuid)') as fn,
         to_regprocedure('public.get_order_receipt(uuid)') as receipt_fn
),
p as (
  select pr.oid, pr.prosrc, pr.prosecdef, pr.proconfig
  from pg_proc pr join target t on pr.oid = t.fn
)
select * from (
  select '1 step 08 restored' as section, 'exactly one place_order' as check_name,
         (select count(*) = 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'place_order') as ok,
         (select coalesce(string_agg(pg_get_function_identity_arguments(oid), ' | '), 'none')
            from pg_proc where pronamespace = 'public'::regnamespace and proname = 'place_order') as detail
  union all
  select '1 step 08 restored', 'place_order body identical to step 08 (fingerprint)',
         coalesce((select md5(ltrim(replace(prosrc, E'\r', ''), E'\n')) = 'f58df5ff55e84e958d1e27336cd82f6e' from p), false),
         coalesce((select md5(ltrim(replace(prosrc, E'\r', ''), E'\n')) from p), 'missing')
  union all
  select '1 step 08 restored', 'security definer with search_path public, pg_temp',
         coalesce((select prosecdef and proconfig = array['search_path=public, pg_temp'] from p), false),
         coalesce((select array_to_string(proconfig, '; ') from p), 'not set')
  union all
  select '1 step 08 restored', 'visitors can run place_order (COD checkout)',
         coalesce((select has_function_privilege('anon', fn::oid, 'EXECUTE') from target), false), 'expect true'
  union all
  select '1 step 08 restored', 'signed-in users can run place_order',
         coalesce((select has_function_privilege('authenticated', fn::oid, 'EXECUTE') from target), false), 'expect true'

  union all
  select '2 removed', 'payment-writing functions are gone',
         not exists (select 1 from removed where to_regprocedure('public.' || sig) is not null),
         coalesce((select string_agg(sig, ', ') from removed where to_regprocedure('public.' || sig) is not null), 'none left')

  union all
  select '3 kept', 'payment guard on INSERT and UPDATE, enabled',
         exists (select 1 from pg_trigger
                 where tgrelid = 'public.orders'::regclass and tgname = 'ps_orders_payment_guard' and tgenabled = 'O'
                   and tgtype & 4 <> 0 and tgtype & 16 <> 0),
         'expect true'
  union all
  select '3 kept', 'all payment columns present',
         not exists (select 1 from kept_columns k where not exists (
           select 1 from information_schema.columns
           where table_schema = 'public' and table_name = 'orders' and column_name = k.c)),
         coalesce((select string_agg(k.c, ', ') from kept_columns k where not exists (
           select 1 from information_schema.columns
           where table_schema = 'public' and table_name = 'orders' and column_name = k.c)), 'none missing')
  union all
  select '3 kept', 'three unique payment indexes present',
         (select count(*) = 3 from pg_indexes where schemaname = 'public' and tablename = 'orders'
            and indexname in ('orders_razorpay_order_id_key', 'orders_razorpay_payment_id_key', 'orders_receipt_token_key')),
         (select count(*)::text from pg_indexes where schemaname = 'public' and tablename = 'orders'
            and indexname in ('orders_razorpay_order_id_key', 'orders_razorpay_payment_id_key', 'orders_receipt_token_key'))
  union all
  select '3 kept', 'server can read receipts',
         coalesce((select has_function_privilege('service_role', receipt_fn::oid, 'EXECUTE') from target), false), 'expect true'
  union all
  select '3 kept', 'visitors cannot call get_order_receipt directly',
         coalesce((select not has_function_privilege('anon', receipt_fn::oid, 'EXECUTE')
                      and not has_function_privilege('authenticated', receipt_fn::oid, 'EXECUTE') from target), false),
         'expect true'

  union all
  select '4 data', 'no unpaid Razorpay order left open',
         not exists (select 1 from public.orders where payment_method = 'RAZORPAY'
                       and payment_status in ('pending', 'failed') and order_status <> 'cancelled'),
         'expect true'
  union all
  select '4 data', 'every paid Razorpay order has a payment id and paid date',
         not exists (select 1 from public.orders where payment_method = 'RAZORPAY' and payment_status = 'paid'
                       and (razorpay_payment_id is null or paid_at is null)),
         'expect true'
  union all
  select '4 data', 'visitors cannot read orders',
         not (has_table_privilege('anon', 'public.orders', 'SELECT') or has_table_privilege('anon', 'public.order_items', 'SELECT')),
         'expect true'
  union all
  select '4 data', 'orders total (must not be lower than the preflight)', null,
         (select count(*)::text from public.orders)
  union all
  select '4 data', 'order items total (must not be lower than the preflight)', null,
         (select count(*)::text from public.order_items)
  union all
  select '4 data', 'Razorpay orders with a payment id (must equal the preflight)', null,
         (select count(*)::text from public.orders where payment_method = 'RAZORPAY' and razorpay_payment_id is not null)
) checks
order by section, check_name;
