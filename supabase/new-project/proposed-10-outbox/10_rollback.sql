-- ============================================================================
-- PS PERFUMES — ROLLBACK OF STEP 10
-- Target: ps-perfumes-production (project ref pwacxxrghlglvdtclbig)
-- Status: PROPOSED. NOT APPLIED. Run only after separate written approval, manually, in the SQL
--         Editor of the project above.
--
-- Order of work: first revert the application code and stop the worker, because that code calls
-- these functions. Then run this file.
-- If Migration 09 v2 is to be rolled back too, this file comes FIRST: finalize_payment_and_enqueue
-- calls mark_order_paid, and 09v2_rollback.sql would otherwise leave it broken.
--
-- What it does
--   Stops if a notification is still undelivered, unless that is confirmed below.
--   Drops the five server functions and the two helpers.
--
-- What it deliberately keeps
--   Table notification_outbox with every row, as the record of what was sent, and its dedupe keys.
--   It stays locked: RLS on, no policy, no grants. It changes no order, payment or e-mail date.
--
-- Undelivered notifications: export them first, then remove the two leading dashes from the
-- "set local" line below to confirm. Nothing here sends them.
-- One transaction: on any error nothing changes.
-- To undo this rollback, run 10_outbox.sql again; it detects the kept table.
-- ============================================================================

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- set local ps.confirm_undelivered_exported = 'yes';

do $$
declare
  v_open bigint;
begin
  if to_regprocedure('public.finalize_payment_and_enqueue(text, text, bigint)') is null then
    raise exception 'finalize_payment_and_enqueue not found — step 10 is not applied, or was already rolled back';
  end if;
  select count(*) into v_open from public.notification_outbox where status in ('pending', 'processing');
  if v_open > 0 and current_setting('ps.confirm_undelivered_exported', true) is distinct from 'yes' then
    raise exception '% notification(s) are undelivered. Export them, then confirm as the header of this file explains.', v_open;
  end if;
end $$;

drop function public.finalize_payment_and_enqueue(text, text, bigint);
drop function public.enqueue_payment_alert(text, text, text, uuid, bigint, bigint);
drop function public.claim_notifications(integer, integer, uuid);
drop function public.complete_notification(uuid, uuid, text);
drop function public.fail_notification(uuid, uuid, text, integer, boolean, boolean);
drop function public.ps_outbox_sanitize_error(text);
drop function public.ps_outbox_check_id(text);

do $$
begin
  if to_regclass('public.notification_outbox') is null then
    raise exception 'notification_outbox is missing — nothing was changed';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.notification_outbox'::regclass) then
    raise exception 'RLS is off on notification_outbox — nothing was changed';
  end if;
end $$;

notify pgrst, 'reload schema';

commit;
