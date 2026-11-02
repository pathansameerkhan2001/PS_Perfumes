-- ============================================================================
-- PS PERFUMES — STEP 10 POST-MIGRATION VERIFICATION (READ-ONLY)
-- Target: ps-perfumes-production (project ref pwacxxrghlglvdtclbig)
-- Status: PROPOSED. One read-only check, then one SELECT; it changes nothing.
--
-- NEVER RUN THIS BEFORE THE MIGRATION. Run the whole file only after 10_outbox.sql has succeeded.
-- If it stops with "Migration 10 is not applied", the migration did not run: stop and review.
-- Every row with ok = false needs review. ok = null: compare with the pre-check export.
-- ============================================================================

do $$
begin
  if to_regclass('public.notification_outbox') is null
     or to_regprocedure('public.finalize_payment_and_enqueue(text, text, bigint)') is null then
    raise exception 'Migration 10 is not applied, so nothing was verified. No data was changed.';
  end if;
end $$;

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
server_fns(sig) as (
  values ('finalize_payment_and_enqueue(text,text,bigint)'),
         ('enqueue_payment_alert(text,text,text,uuid,bigint,bigint)'),
         ('claim_notifications(integer,integer,uuid)'),
         ('complete_notification(uuid,uuid,text)'),
         ('fail_notification(uuid,uuid,text,integer,boolean,boolean)')
),
fn_state as (
  select sig, to_regprocedure('public.' || sig) as oid from server_fns
),
helper_fns(sig) as (
  values ('ps_outbox_sanitize_error(text)'), ('ps_outbox_check_id(text)')
),
helper_state as (
  select sig, to_regprocedure('public.' || sig) as oid from helper_fns
),
columns_wanted(c) as (
  values ('id'), ('dedupe_key'), ('order_id'), ('razorpay_payment_id'), ('razorpay_order_id'), ('notification_type'),
         ('payload'), ('status'), ('attempt_count'), ('max_attempts'), ('next_attempt_at'), ('lease_token'),
         ('lease_expires_at'), ('last_error'), ('resend_id'), ('created_at'), ('updated_at'), ('delivered_at')
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
  select '1 existing functions', 'payment guard trigger enabled',
         exists (select 1 from pg_trigger where tgrelid = 'public.orders'::regclass
                   and tgname = 'ps_orders_payment_guard' and tgenabled = 'O'),
         'expect true'

  union all
  select '2 structure', 'all 18 columns present',
         not exists (select 1 from columns_wanted w where not exists (
           select 1 from information_schema.columns
           where table_schema = 'public' and table_name = 'notification_outbox' and column_name = w.c)),
         coalesce((select string_agg(w.c, ', ') from columns_wanted w where not exists (
           select 1 from information_schema.columns
           where table_schema = 'public' and table_name = 'notification_outbox' and column_name = w.c)), 'none missing')
  union all
  select '2 structure', 'all 10 check and unique rules present',
         (select count(*) = 10 from pg_constraint
           where conrelid = 'public.notification_outbox'::regclass and contype in ('c', 'u')),
         (select count(*)::text from pg_constraint
           where conrelid = 'public.notification_outbox'::regclass and contype in ('c', 'u'))
  union all
  select '2 structure', 'order_id uses ON DELETE SET NULL',
         exists (select 1 from pg_constraint where conrelid = 'public.notification_outbox'::regclass
                   and contype = 'f' and confrelid = 'public.orders'::regclass and confdeltype = 'n'),
         'expect true'
  union all
  select '2 structure', 'due and order_id indexes valid',
         (select count(*) = 2 from pg_index ix join pg_class c on c.oid = ix.indexrelid
           where ix.indrelid = 'public.notification_outbox'::regclass and ix.indisvalid
             and c.relname in ('notification_outbox_due_idx', 'notification_outbox_order_id_idx')),
         'expect true'
  union all
  select '2 structure', 'server functions present',
         not exists (select 1 from fn_state where oid is null),
         coalesce((select string_agg(sig, ', ') from fn_state where oid is null), 'none missing')

  union all
  select '3 security', 'RLS on, with no policy',
         (select relrowsecurity from pg_class where oid = 'public.notification_outbox'::regclass)
           and not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'notification_outbox'),
         'expect true'
  union all
  select '3 security', 'no table privilege for anon, authenticated or service_role',
         not (has_table_privilege('anon', 'public.notification_outbox', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
           or has_table_privilege('authenticated', 'public.notification_outbox', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
           or has_table_privilege('service_role', 'public.notification_outbox', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')),
         'expect true'
  union all
  select '3 security', 'server functions callable by service_role',
         not exists (select 1 from fn_state where oid is null or not has_function_privilege('service_role', oid, 'EXECUTE')),
         'expect true'
  union all
  select '3 security', 'server functions NOT callable by visitors or signed-in users',
         not exists (select 1 from fn_state where oid is null
                       or has_function_privilege('anon', oid, 'EXECUTE')
                       or has_function_privilege('authenticated', oid, 'EXECUTE')),
         'expect true'
  union all
  select '3 security', 'helpers callable by nobody but their owner',
         not exists (select 1 from helper_state where oid is null
                       or has_function_privilege('anon', oid, 'EXECUTE')
                       or has_function_privilege('authenticated', oid, 'EXECUTE')
                       or has_function_privilege('service_role', oid, 'EXECUTE')),
         'expect true'
  union all
  select '3 security', 'server functions: security definer, fixed search_path',
         (select count(*) = 5 from pg_proc p join fn_state f on p.oid = f.oid::oid
           where p.prosecdef and p.proconfig = array['search_path=public, pg_temp']),
         'expect true'

  union all
  select '4 data', 'no outbox row belongs to a COD order',
         not exists (select 1 from public.notification_outbox n join public.orders o on o.id = n.order_id
                      where o.payment_method <> 'RAZORPAY'),
         'expect true'
  union all
  select '4 data', 'no notification has permanently failed',
         not exists (select 1 from public.notification_outbox where status = 'failed'),
         (select count(*)::text from public.notification_outbox where status = 'failed')
  union all
  select '4 data', 'outbox rows by status (info)', null,
         (select coalesce(jsonb_agg(x)::text, '[]') from (
            select status, count(*) as n from public.notification_outbox group by 1 order by 1) x)

  union all
  select '5 compare with pre-check', 'orders by method and payment status', null,
         (select coalesce(jsonb_agg(x)::text, '[]') from (
            select payment_method, payment_status, count(*) as n from public.orders group by 1, 2 order by 1, 2) x)
  union all
  select '5 compare with pre-check', 'orders', null, (select count(*)::text from public.orders)
  union all
  select '5 compare with pre-check', 'order_items', null, (select count(*)::text from public.order_items)
  union all
  select '5 compare with pre-check', 'products / variants', null,
         (select count(*) from public.products)::text || ' / ' || (select count(*) from public.product_variants)::text
  union all
  select '5 compare with pre-check', 'latest order update (moves only with real order activity)', null,
         (select coalesce(max(updated_at)::text, 'none') from public.orders)
) checks
order by section, check_name;
