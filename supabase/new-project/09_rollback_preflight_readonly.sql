-- ============================================================================
-- PS PERFUMES — STEP 9 ROLLBACK PREFLIGHT (READ-ONLY)
-- Target: ps-perfumes-production (project ref pwacxxrghlglvdtclbig)
-- Status: validated on a disposable local database only. One SELECT; it changes nothing. Requires step 09.
--
-- Run the whole file and export the grid as CSV. Continue to 09_rollback.sql only when every
-- ok = true row is true and every REVIEW row has a recorded decision.
-- ok: true = safe, false = stop, null = information or a decision to record.
-- SQL cannot see Vercel or Razorpay: the kill switch, the backup and the reconciliation are
-- confirmed by the person running the rollback (docs/KT/16-Razorpay-Rollback-Runbook.md).
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
rz as (
  select * from public.orders where payment_method = 'RAZORPAY'
)
select * from (
  select '1 structure' as section, 'step 09 functions all present' as check_name,
         not exists (select 1 from server_fns where to_regprocedure('public.' || sig) is null) as ok,
         coalesce((select string_agg(sig, ', ') from server_fns where to_regprocedure('public.' || sig) is null), 'none missing') as detail
  union all
  select '1 structure', 'exactly one place_order',
         (select count(*) = 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'place_order'),
         (select coalesce(string_agg(pg_get_function_identity_arguments(oid), ' | '), 'none')
            from pg_proc where pronamespace = 'public'::regnamespace and proname = 'place_order')
  union all
  select '1 structure', 'payment guard trigger present',
         exists (select 1 from pg_trigger where tgrelid = 'public.orders'::regclass and tgname = 'ps_orders_payment_guard'),
         'kept by the rollback'

  union all
  select '2 blocking', 'no unpaid Razorpay order is being processed',
         not exists (select 1 from rz where payment_status in ('pending', 'failed') and order_status not in ('pending', 'cancelled')),
         (select count(*)::text from rz where payment_status in ('pending', 'failed') and order_status not in ('pending', 'cancelled'))
  union all
  select '2 blocking', 'every paid Razorpay order has a payment id and paid date',
         not exists (select 1 from rz where payment_status = 'paid' and (razorpay_payment_id is null or paid_at is null)),
         (select count(*)::text from rz where payment_status = 'paid' and (razorpay_payment_id is null or paid_at is null))
  union all
  select '2 blocking', 'no open unpaid Razorpay order newer than 60 minutes',
         not exists (select 1 from rz where payment_status in ('pending', 'failed') and order_status = 'pending'
                       and created_at > now() - interval '60 minutes'),
         coalesce((select max(created_at)::text from rz where payment_status in ('pending', 'failed') and order_status = 'pending'), 'none open')

  union all
  select '3 review', 'REVIEW: second payments awaiting a refund decision', null,
         (select count(*)::text from rz where duplicate_payment_id is not null)
  union all
  select '3 review', 'REVIEW: paid after cancellation, awaiting a refund decision', null,
         (select count(*)::text from rz where payment_status = 'paid' and order_status = 'cancelled')
  union all
  select '3 review', 'REVIEW: paid orders with a customer or owner e-mail not sent', null,
         (select count(*)::text from rz where payment_status = 'paid'
            and (customer_email_sent_at is null or owner_email_sent_at is null))
  union all
  select '3 review', 'REVIEW: orders with a payment note', null,
         (select count(*)::text from rz where payment_error is not null)
  union all
  select '3 review', 'REVIEW: open unpaid orders the rollback will cancel', null,
         (select count(*)::text from rz where payment_status in ('pending', 'failed') and order_status = 'pending')

  union all
  select '4 record these', 'orders total (compare after rollback)', null,
         (select count(*)::text from public.orders)
  union all
  select '4 record these', 'order items total (compare after rollback)', null,
         (select count(*)::text from public.order_items)
  union all
  select '4 record these', 'Razorpay orders with a payment id (compare after rollback)', null,
         (select count(*)::text from rz where razorpay_payment_id is not null)
  union all
  select '4 record these', 'Razorpay orders by status (info)', null,
         (select coalesce(jsonb_agg(x)::text, '[]') from (
            select payment_status, order_status, count(*) as n from rz group by 1, 2 order by 1, 2) x)
) checks
order by section, check_name;
