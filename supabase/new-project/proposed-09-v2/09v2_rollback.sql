-- ============================================================================
-- PS PERFUMES — ROLLBACK OF STEP 9 v2 (database stage only)
-- Target: ps-perfumes-production (project ref pwacxxrghlglvdtclbig)
-- Status: PROPOSED. NOT TESTED AND NOT APPLIED. Use it only with 09v2_razorpay_payments.sql, never
--         with the original step 09: that one replaces place_order, and this file stops if so.
--
-- Run this only as Stage 3 of docs/KT/16-Razorpay-Rollback-Runbook.md, after the soft stop, the
-- reconciliation (09_reconciliation_readonly.sql) and a confirmed backup. SQL cannot prove the
-- reconciliation happened: step 1 below cancels open unpaid orders, so finish it first.
-- Check the result with 09_rollback_postcheck_readonly.sql.
--
-- What it does
--   1. Stops if the state is not safe (see the preflight below).
--   2. Cancels Razorpay orders that are still open and unpaid.
--   3. Drops place_order_core and the payment-writing server functions.
--
-- What it deliberately keeps
--   * place_order, which step 09 v2 never changed, so COD checkout is not touched.
--   * Every order, order item, payment id, paid date, receipt token and e-mail date. It drops no
--     column and deletes no row. No COD order is changed.
--   * Trigger ps_orders_payment_guard, so unpaid orders still cannot be dispatched.
--   * Function get_order_receipt, so receipt links already e-mailed keep working.
--   * The unique indexes on the kept columns.
--
-- It issues no refund and does not contact Razorpay. It changes no product, coupon or customer.
-- One transaction: on any error nothing changes.
-- To undo this rollback, run 09v2_razorpay_payments.sql again; it detects the kept columns.
-- ============================================================================

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- ---------------------------------------------------------------------------
-- 0. Preflight (stops before any change)
-- ---------------------------------------------------------------------------
do $$
declare
  -- Razorpay gives no guarantee that an open payment window has closed, so a quiet period is
  -- required since the last Razorpay order. Lengthen it if the reconciliation calls for that.
  c_quiet constant interval := interval '60 minutes';
begin
  if to_regprocedure('public.place_order_core(jsonb, jsonb, text, text, uuid)') is null then
    raise exception 'place_order_core not found — step 09 is not applied, or was already rolled back';
  end if;
  if (select count(*) from pg_proc
      where pronamespace = 'public'::regnamespace and proname = 'place_order') <> 1 then
    raise exception 'Expected exactly one place_order function. Review before continuing.';
  end if;
  -- This file does not restore place_order, so it must still be the function of step 08
  if (select md5(ltrim(replace(prosrc, E'\r', ''), E'\n')) from pg_proc
      where oid = to_regprocedure('public.place_order(jsonb, jsonb, text, text, uuid)')::oid)
     is distinct from 'f58df5ff55e84e958d1e27336cd82f6e' then
    raise exception 'place_order differs from step 08. Dropping place_order_core could break COD. Review first.';
  end if;
  if exists (select 1 from public.orders
             where payment_method = 'RAZORPAY' and payment_status in ('pending', 'failed')
               and order_status not in ('pending', 'cancelled')) then
    raise exception 'An unpaid Razorpay order is being processed. Resolve it before rolling back.';
  end if;
  if exists (select 1 from public.orders
             where payment_method = 'RAZORPAY' and payment_status = 'paid'
               and (razorpay_payment_id is null or paid_at is null)) then
    raise exception 'A paid Razorpay order has no payment id or paid date. Resolve it before rolling back.';
  end if;
  if exists (select 1 from public.orders
             where payment_method = 'RAZORPAY' and payment_status in ('pending', 'failed')
               and order_status = 'pending' and created_at > now() - c_quiet) then
    raise exception 'An unpaid Razorpay order is newer than %. Confirm the kill switch and wait.', c_quiet;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. Close open unpaid orders while the guard is in place. Reconciliation has already matched
--    any captured payment to its order, so these orders were not paid.
-- ---------------------------------------------------------------------------
update public.orders
   set order_status = 'cancelled',
       notes = coalesce(notes || ' | ', '') || 'Cancelled: online payment withdrawn by rollback of step 09'
 where payment_method = 'RAZORPAY'
   and payment_status in ('pending', 'failed')
   and order_status = 'pending';

-- ---------------------------------------------------------------------------
-- 2. Remove the functions that create or change Razorpay orders. Exact signatures, no CASCADE.
-- ---------------------------------------------------------------------------
drop function public.attach_razorpay_order(uuid, text);
drop function public.mark_order_paid(text, text, bigint);
drop function public.record_payment_failure(text, text);
drop function public.get_payment_order(text);
drop function public.claim_order_email(uuid, text);
drop function public.release_order_email(uuid, text);
drop function public.place_order_core(jsonb, jsonb, text, text, uuid);

-- ---------------------------------------------------------------------------
-- 3. Post-condition (any failure undoes everything above)
-- ---------------------------------------------------------------------------
do $$
begin
  if (select md5(ltrim(replace(prosrc, E'\r', ''), E'\n')) from pg_proc
      where oid = to_regprocedure('public.place_order(jsonb, jsonb, text, text, uuid)')::oid)
     is distinct from 'f58df5ff55e84e958d1e27336cd82f6e' then
    raise exception 'place_order check failed after rollback — nothing was changed';
  end if;
  if not has_function_privilege('anon', 'public.place_order(jsonb, jsonb, text, text, uuid)', 'EXECUTE') then
    raise exception 'Visitors cannot run place_order — nothing was changed';
  end if;
  if to_regprocedure('public.get_order_receipt(uuid)') is null then
    raise exception 'get_order_receipt is missing — nothing was changed';
  end if;
  if not exists (select 1 from pg_trigger
                 where tgrelid = 'public.orders'::regclass and tgname = 'ps_orders_payment_guard') then
    raise exception 'ps_orders_payment_guard is missing — nothing was changed';
  end if;
  if exists (select 1 from public.orders
             where payment_method = 'RAZORPAY' and payment_status in ('pending', 'failed')
               and order_status <> 'cancelled') then
    raise exception 'An unpaid Razorpay order is still open — nothing was changed';
  end if;
end $$;

notify pgrst, 'reload schema';

commit;
