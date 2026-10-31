-- ============================================================================
-- PS PERFUMES — OPTIONAL DESTRUCTIVE CLEANUP AFTER THE ROLLBACK OF STEP 9
-- Target: ps-perfumes-production (project ref pwacxxrghlglvdtclbig)
-- Status: NOT APPLIED to Supabase. Validated on a disposable local database only. Not part of a routine rollback.
--
-- Removes the guard trigger, get_order_receipt and all nine payment columns. This CANNOT be
-- undone without a restore from backup. Receipt links, Razorpay ids, payment notes and e-mail
-- dates on the affected rows are lost.
--
-- It refuses to run while any Razorpay order was paid or refunded, or holds a payment id: those
-- records are never removed by this file. It is meant only for a project where Razorpay orders
-- were never paid, such as after a rehearsal.
--
-- Before running: complete Stage 4 of docs/KT/16-Razorpay-Rollback-Runbook.md, then remove the
-- two leading dashes from the "set local" line below to confirm the backup and the export.
-- One transaction: on any error nothing changes.
-- ============================================================================

begin;

-- set local ps.confirm_backup_and_export = 'yes';

do $$
begin
  if current_setting('ps.confirm_backup_and_export', true) is distinct from 'yes' then
    raise exception 'Backup and export are not confirmed: read the header of this file';
  end if;
  if to_regprocedure('public.place_order_core(jsonb, jsonb, text, text, uuid)') is not null then
    raise exception 'Step 09 is still applied: run 09_rollback.sql first';
  end if;
  if exists (select 1 from public.orders
             where razorpay_payment_id is not null
                or duplicate_payment_id is not null
                or paid_at is not null
                or (payment_method = 'RAZORPAY' and payment_status in ('paid', 'refunded'))) then
    raise exception 'Payment records exist. They must be kept: this cleanup does not run on this database.';
  end if;
  if exists (select 1 from public.orders
             where payment_method = 'RAZORPAY' and order_status <> 'cancelled') then
    raise exception 'A Razorpay order is still open. Run 09_rollback.sql first.';
  end if;
end $$;

drop trigger ps_orders_payment_guard on public.orders;
drop function public.ps_orders_payment_guard();
drop function public.get_order_receipt(uuid);

-- The three unique indexes on these columns are removed with them
alter table public.orders
  drop column razorpay_order_id,
  drop column razorpay_payment_id,
  drop column duplicate_payment_id,
  drop column paid_at,
  drop column payment_error,
  drop column coupon_code,
  drop column receipt_token,
  drop column customer_email_sent_at,
  drop column owner_email_sent_at;

notify pgrst, 'reload schema';

commit;
