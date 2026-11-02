-- ============================================================================
-- PS PERFUMES — STEP 10 PRE-MIGRATION CHECK (READ-ONLY)
-- Target: ps-perfumes-production (project ref pwacxxrghlglvdtclbig)
-- Status: PROPOSED. One SELECT; it changes nothing and takes no blocking lock.
--
-- Run the whole file BEFORE 10_outbox.sql and export the grid. Continue only when every row with
-- ok = false has been resolved, and save the counts to compare after the migration.
-- ok: true = safe, false = stop, null = information.
-- Reapplying after 10_rollback.sql: the "not started" table row is false, which is expected there.
-- SQL cannot see the backup or the Vercel kill switch: confirm those separately.
-- ============================================================================

with
fingerprints(sig, fp) as (
  values ('place_order(jsonb, jsonb, text, text, uuid)', 'f58df5ff55e84e958d1e27336cd82f6e'),
         ('place_order_core(jsonb, jsonb, text, text, uuid)', '11e685594045be8687ee025bcba72c8c'),
         ('mark_order_paid(text, text, bigint)', 'ae7666b99cc00a000ebe74611c4e1f24'),
         ('ps_orders_payment_guard()', 'acfa79d5e0d9f1f6adabc914cb1ba7fe')
),
live as (
  select f.sig, f.fp, md5(ltrim(replace(p.prosrc, E'\r', ''), E'\n')) as actual
    from fingerprints f
    left join pg_proc p on p.oid = to_regprocedure('public.' || f.sig)::oid
),
new_fns(sig) as (
  values ('finalize_payment_and_enqueue(text,text,bigint)'),
         ('enqueue_payment_alert(text,text,text,uuid,bigint,bigint)'),
         ('claim_notifications(integer,integer,uuid)'),
         ('complete_notification(uuid,uuid,text)'),
         ('fail_notification(uuid,uuid,text,integer,boolean,boolean)'),
         ('ps_outbox_sanitize_error(text)'),
         ('ps_outbox_check_id(text)')
)
select * from (
  select '1 existing functions' as section, 'unchanged: ' || sig as check_name,
         actual is not distinct from fp as ok, coalesce(actual, 'missing') as detail
    from live
  union all
  select '1 existing functions', 'visitors can run place_order (COD checkout)',
         coalesce(has_function_privilege('anon', to_regprocedure('public.place_order(jsonb,jsonb,text,text,uuid)')::oid, 'EXECUTE'), false),
         'expect true'
  union all
  select '1 existing functions', 'visitors cannot run mark_order_paid',
         coalesce(not has_function_privilege('anon', to_regprocedure('public.mark_order_paid(text,text,bigint)')::oid, 'EXECUTE'), false),
         'expect true'
  union all
  select '1 existing functions', 'payment guard trigger enabled',
         exists (select 1 from pg_trigger where tgrelid = 'public.orders'::regclass
                   and tgname = 'ps_orders_payment_guard' and tgenabled = 'O'),
         'expect true'

  union all
  select '2 step 10 not started', 'no step 10 function exists yet',
         not exists (select 1 from new_fns where to_regprocedure('public.' || sig) is not null),
         coalesce((select string_agg(sig, ', ') from new_fns where to_regprocedure('public.' || sig) is not null), 'none found')
  union all
  select '2 step 10 not started', 'notification_outbox does not exist yet',
         to_regclass('public.notification_outbox') is null,
         coalesce(to_regclass('public.notification_outbox')::text, 'none found')

  union all
  select '3 locking', 'no transaction open for over 1 minute',
         not exists (select 1 from pg_stat_activity where datname = current_database() and pid <> pg_backend_pid()
                       and xact_start < now() - interval '1 minute'),
         (select count(*)::text from pg_stat_activity where datname = current_database() and pid <> pg_backend_pid()
            and xact_start < now() - interval '1 minute')

  union all
  select '4 record these', 'orders by method and payment status', null,
         (select coalesce(jsonb_agg(x)::text, '[]') from (
            select payment_method, payment_status, count(*) as n from public.orders group by 1, 2 order by 1, 2) x)
  union all
  select '4 record these', 'orders', null, (select count(*)::text from public.orders)
  union all
  select '4 record these', 'order_items', null, (select count(*)::text from public.order_items)
  union all
  select '4 record these', 'products / variants', null,
         (select count(*) from public.products)::text || ' / ' || (select count(*) from public.product_variants)::text
  union all
  select '4 record these', 'latest order update (must not move because of the migration)', null,
         (select coalesce(max(updated_at)::text, 'none') from public.orders)
) checks
order by section, check_name;
