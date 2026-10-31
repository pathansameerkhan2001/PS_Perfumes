-- ============================================================================
-- PS PERFUMES — STEP 9 v2 PRE-MIGRATION CHECK (READ-ONLY)
-- Target: ps-perfumes-production (project ref pwacxxrghlglvdtclbig)
-- Status: PROPOSED. NOT TESTED. One SELECT; it changes nothing and takes no blocking lock.
--
-- Run the whole file in the SQL Editor and export the grid. Continue only when:
--   * every row with ok = false has been resolved, and
--   * the "record these" counts are saved to compare after the migration.
-- ok: true = safe, false = stop, null = information.
-- SQL cannot see the backup or the Vercel kill switch: confirm those separately.
-- ============================================================================

with
new_fns(sig) as (
  values ('place_order_core(jsonb,jsonb,text,text,uuid)'),
         ('attach_razorpay_order(uuid,text)'),
         ('mark_order_paid(text,text,bigint)'),
         ('record_payment_failure(text,text)'),
         ('get_payment_order(text)'),
         ('get_order_receipt(uuid)'),
         ('claim_order_email(uuid,text)'),
         ('release_order_email(uuid,text)'),
         ('ps_orders_payment_guard()')
),
new_columns(c) as (
  values ('razorpay_order_id'), ('razorpay_payment_id'), ('duplicate_payment_id'), ('paid_at'),
         ('payment_error'), ('coupon_code'), ('receipt_token'),
         ('customer_email_sent_at'), ('owner_email_sent_at')
),
new_indexes(i) as (
  values ('orders_razorpay_order_id_key'), ('orders_razorpay_payment_id_key'), ('orders_receipt_token_key')
),
target as (
  select to_regprocedure('public.place_order(jsonb, jsonb, text, text, uuid)') as fn
)
select * from (
  select '1 step 08' as section, 'place_order has the 5-argument signature' as check_name,
         (select fn is not null from target) as ok,
         coalesce((select string_agg(pg_get_function_identity_arguments(oid), ' | ')
                   from pg_proc where pronamespace = 'public'::regnamespace and proname = 'place_order'), 'none') as detail
  union all
  select '1 step 08', 'exactly one place_order',
         (select count(*) = 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'place_order'),
         (select count(*)::text from pg_proc where pronamespace = 'public'::regnamespace and proname = 'place_order')
  union all
  select '1 step 08', 'place_order body identical to step 08 (fingerprint)',
         coalesce((select md5(ltrim(replace(p.prosrc, E'\r', ''), E'\n')) = 'f58df5ff55e84e958d1e27336cd82f6e'
                   from pg_proc p join target t on p.oid = t.fn), false),
         coalesce((select md5(ltrim(replace(p.prosrc, E'\r', ''), E'\n'))
                   from pg_proc p join target t on p.oid = t.fn), 'missing')
  union all
  select '1 step 08', 'visitors can run place_order (COD checkout)',
         coalesce((select has_function_privilege('anon', fn::oid, 'EXECUTE') from target), false), 'expect true'

  union all
  select '2 step 09 not started', 'no step 09 function exists yet',
         not exists (select 1 from new_fns where to_regprocedure('public.' || sig) is not null),
         coalesce((select string_agg(sig, ', ') from new_fns where to_regprocedure('public.' || sig) is not null), 'none found')
  union all
  select '2 step 09 not started', 'no payment column exists yet',
         not exists (select 1 from information_schema.columns ic join new_columns n on ic.column_name = n.c
                     where ic.table_schema = 'public' and ic.table_name = 'orders'),
         coalesce((select string_agg(ic.column_name, ', ') from information_schema.columns ic join new_columns n on ic.column_name = n.c
                   where ic.table_schema = 'public' and ic.table_name = 'orders'), 'none found')
  union all
  select '2 step 09 not started', 'no payment index exists yet',
         not exists (select 1 from pg_indexes p join new_indexes n on p.indexname = n.i where p.schemaname = 'public'),
         coalesce((select string_agg(p.indexname, ', ') from pg_indexes p join new_indexes n on p.indexname = n.i
                   where p.schemaname = 'public'), 'none found')
  union all
  select '2 step 09 not started', 'payment guard trigger does not exist yet',
         not exists (select 1 from pg_trigger where tgrelid = 'public.orders'::regclass and tgname = 'ps_orders_payment_guard'),
         'expect true'

  union all
  select '3 existing payment records', 'every order is COD, or a cancelled unpaid Razorpay order',
         not exists (select 1 from public.orders where upper(trim(coalesce(payment_method, ''))) <> 'COD'
                       and not (payment_method = 'RAZORPAY' and order_status = 'cancelled' and payment_status in ('pending', 'failed'))),
         (select count(*)::text from public.orders where upper(trim(coalesce(payment_method, ''))) <> 'COD')
  union all
  select '3 existing payment records', 'orders already paid or refunded (info: unexpected, but not a stop for COD)', null,
         (select count(*)::text from public.orders where payment_status in ('paid', 'refunded'))
  union all
  select '3 existing payment records', 'orders by method and payment status (info)', null,
         (select coalesce(jsonb_agg(x)::text, '[]') from (
            select payment_method, payment_status, count(*) as n
            from public.orders group by 1, 2 order by 1, 2) x)

  union all
  select '4 locking', 'no transaction open for over 1 minute',
         not exists (select 1 from pg_stat_activity
                     where datname = current_database() and pid <> pg_backend_pid()
                       and xact_start < now() - interval '1 minute'),
         (select count(*)::text from pg_stat_activity
          where datname = current_database() and pid <> pg_backend_pid()
            and xact_start < now() - interval '1 minute')
  union all
  select '4 locking', 'orders table size (info)', null,
         pg_size_pretty(pg_total_relation_size('public.orders'))

  union all
  select '5 record these', 'orders', null, (select count(*)::text from public.orders)
  union all
  select '5 record these', 'order_items', null, (select count(*)::text from public.order_items)
  union all
  select '5 record these', 'customers', null, (select count(*)::text from public.customers)
  union all
  select '5 record these', 'coupons (rows / total used_count)', null,
         (select count(*)::text || ' / ' || coalesce(sum(used_count), 0)::text from public.coupons)
  union all
  select '5 record these', 'products / variants (expect 71 / 312)', null,
         (select count(*) from public.products)::text || ' / ' || (select count(*) from public.product_variants)::text
  union all
  select '5 record these', 'latest order update (must not move because of the migration)', null,
         (select coalesce(max(updated_at)::text, 'none') from public.orders)
) checks
order by section, check_name;
