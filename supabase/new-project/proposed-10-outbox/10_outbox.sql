-- ============================================================================
-- PS PERFUMES — STEP 10: durable notification outbox
-- Target: ps-perfumes-production (project ref pwacxxrghlglvdtclbig)
-- Status: PROPOSED. NOT APPLIED. Run only after written approval, manually, in the SQL Editor of
--         the project above, AFTER Migration 09 v2.
--
-- What it adds
--   1. Table notification_outbox: every payment e-mail or alert, stored in the same transaction
--      as the payment result. No grants: only the functions below can reach it.
--   2. Service-role functions: finalize_payment_and_enqueue, enqueue_payment_alert,
--      claim_notifications, complete_notification, fail_notification.
--
-- What it does NOT change
--   place_order, place_order_core, mark_order_paid, ps_orders_payment_guard and every other step 08
--   and step 09 object. No order, customer, coupon or catalogue row. COD creates no outbox row.
--   Nothing uses this until the application code is changed, which is a separate approval.
--
-- One transaction: on any error nothing changes, and the file can simply be run again.
-- PRE-CHECK: 10_precheck_readonly.sql. VERIFY: 10_verify_readonly.sql. ROLLBACK: 10_rollback.sql.
-- If Migration 09 v2 is ever rolled back, roll this migration back FIRST.
-- ============================================================================

begin;

-- Give up quickly instead of queueing checkouts: the foreign key briefly locks orders
set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- ---------------------------------------------------------------------------
-- 0. Preflight (stops before any change)
-- ---------------------------------------------------------------------------
do $$
declare
  v_table_columns int;
  r record;
begin
  for r in
    select * from (values
      ('place_order(jsonb, jsonb, text, text, uuid)', 'f58df5ff55e84e958d1e27336cd82f6e'),
      ('place_order_core(jsonb, jsonb, text, text, uuid)', '11e685594045be8687ee025bcba72c8c'),
      ('mark_order_paid(text, text, bigint)', 'ae7666b99cc00a000ebe74611c4e1f24'),
      ('ps_orders_payment_guard()', 'acfa79d5e0d9f1f6adabc914cb1ba7fe')
    ) as t(sig, fp)
  loop
    if (select md5(ltrim(replace(prosrc, E'\r', ''), E'\n')) from pg_proc
        where oid = to_regprocedure('public.' || r.sig)::oid) is distinct from r.fp then
      raise exception 'public.% is missing or differs from Migration 09 v2. Review before continuing.', r.sig;
    end if;
  end loop;

  if to_regprocedure('public.finalize_payment_and_enqueue(text, text, bigint)') is not null then
    raise exception 'finalize_payment_and_enqueue already exists — step 10 appears to be applied already';
  end if;

  -- 0: first run. 18: reapplying after 10_rollback.sql, which keeps the table and its records.
  -- pg_attribute, not information_schema, which hides tables this role has no rights on
  select count(*) into v_table_columns from pg_attribute
   where attrelid = to_regclass('public.notification_outbox') and attnum > 0 and not attisdropped;
  if v_table_columns not in (0, 18) then
    raise exception 'notification_outbox has % columns. Review before continuing.', v_table_columns;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. Table
-- ---------------------------------------------------------------------------
create table if not exists public.notification_outbox (
  id                  uuid primary key default gen_random_uuid(),
  dedupe_key          text not null,
  order_id            uuid references public.orders (id) on delete set null,
  razorpay_payment_id text,
  razorpay_order_id   text,
  notification_type   text not null,
  payload             jsonb not null default '{}'::jsonb,
  status              text not null default 'pending',
  attempt_count       integer not null default 0,
  max_attempts        integer not null default 8,
  next_attempt_at     timestamptz not null default now(),
  lease_token         uuid,
  lease_expires_at    timestamptz,
  last_error          text,
  resend_id           text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  delivered_at        timestamptz,
  constraint notification_outbox_dedupe_key_key unique (dedupe_key),
  -- Doubles as the Resend Idempotency-Key, which allows 1 to 256 characters
  constraint notification_outbox_dedupe_key_length check (char_length(dedupe_key) between 1 and 256),
  constraint notification_outbox_type_check check (notification_type in (
    'customer_receipt', 'owner_paid', 'customer_paid_after_cancel', 'owner_refund_needed',
    'amount_mismatch', 'unknown_order', 'duplicate_payment')),
  constraint notification_outbox_status_check check (status in ('pending', 'processing', 'sent', 'failed')),
  constraint notification_outbox_sent_needs_delivery check (
    (status = 'sent') = (delivered_at is not null)),
  constraint notification_outbox_sent_needs_resend_id check (
    status <> 'sent' or (resend_id is not null and resend_id <> '')),
  constraint notification_outbox_processing_needs_lease check (
    (status = 'processing') = (lease_token is not null and lease_expires_at is not null)),
  constraint notification_outbox_attempts_check check (
    max_attempts between 1 and 20 and attempt_count between 0 and max_attempts),
  constraint notification_outbox_payload_check check (
    jsonb_typeof(payload) = 'object' and pg_column_size(payload) <= 1024),
  constraint notification_outbox_last_error_check check (
    last_error is null or char_length(last_error) <= 300)
);

comment on table public.notification_outbox is
  'Payment e-mails and alerts waiting for delivery. Holds ids and amounts only, never customer details.';

-- A row being worked on keeps next_attempt_at equal to its lease expiry, so one index serves both
create index if not exists notification_outbox_due_idx
  on public.notification_outbox (next_attempt_at) where status in ('pending', 'processing');
create index if not exists notification_outbox_order_id_idx
  on public.notification_outbox (order_id) where order_id is not null;

drop trigger if exists ps_set_updated_at on public.notification_outbox;
create trigger ps_set_updated_at before update on public.notification_outbox
  for each row execute function public.ps_set_updated_at();

-- RLS on with no policy, and no table privileges: only the functions below reach this table
alter table public.notification_outbox enable row level security;
revoke all on public.notification_outbox from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Internal helpers (nobody but the functions below may call these)
-- ---------------------------------------------------------------------------
create function public.ps_outbox_sanitize_error(p_error text)
returns text
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v text := coalesce(p_error, 'Unknown error');
begin
  v := regexp_replace(v, '[[:cntrl:]]+', ' ', 'g');
  v := regexp_replace(v, '[^[:space:]<>"'']+@[^[:space:]<>"'']+', '[redacted]', 'g');
  v := regexp_replace(v, '(bearer|basic)[[:space:]]+[^[:space:]]+', '[redacted]', 'gi');
  v := regexp_replace(v, '(api[_-]?key|secret|password|token)[[:space:]]*[:=][[:space:]]*[^[:space:]]+', '[redacted]', 'gi');
  v := regexp_replace(v, '\m(re|rzp|sb|sk|pk|whsec)_[A-Za-z0-9_-]{6,}', '[redacted]', 'g');
  v := regexp_replace(v, 'eyJ[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]+)*', '[redacted]', 'g');
  v := regexp_replace(v, '\+?[0-9][0-9 -]{8,}[0-9]', '[redacted]', 'g');
  return left(trim(v), 300);
end;
$$;

-- Payment ids go into dedupe keys, so only the shape Razorpay uses is accepted
create function public.ps_outbox_check_id(p_value text)
returns void
language plpgsql
immutable
set search_path = public, pg_temp
as $$
begin
  if p_value is null or p_value !~ '^[A-Za-z0-9_-]{1,64}$' then
    raise exception 'Invalid Razorpay identifier';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Recording notifications
-- ---------------------------------------------------------------------------

-- Returns true when this call stored a new alert, false when it was already stored
create function public.enqueue_payment_alert(
  p_notification_type   text,
  p_razorpay_payment_id text,
  p_razorpay_order_id   text default null,
  p_order_id            uuid default null,
  p_amount_paise        bigint default null,
  p_expected_paise      bigint default null
)
returns boolean
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_suffix text;
begin
  v_suffix := case p_notification_type
                when 'amount_mismatch' then 'amount_mismatch'
                when 'unknown_order' then 'unknown_order'
                when 'duplicate_payment' then 'duplicate'
              end;
  if v_suffix is null then
    raise exception 'Unknown alert type';
  end if;
  if p_razorpay_payment_id is null then
    raise exception 'An alert needs a Razorpay payment id';
  end if;
  perform public.ps_outbox_check_id(p_razorpay_payment_id);
  if p_razorpay_order_id is not null then
    perform public.ps_outbox_check_id(p_razorpay_order_id);
  end if;

  insert into public.notification_outbox (dedupe_key, order_id, razorpay_payment_id, razorpay_order_id,
                                          notification_type, payload)
  values ('payment/' || p_razorpay_payment_id || '/' || v_suffix, p_order_id, p_razorpay_payment_id,
          p_razorpay_order_id, p_notification_type,
          jsonb_strip_nulls(jsonb_build_object('amount_paise', p_amount_paise, 'expected_paise', p_expected_paise)))
  on conflict (dedupe_key) do nothing;
  return found;
end;
$$;

-- mark_order_paid decides the outcome; this adds the notifications in the same transaction, so
-- when an insert fails the payment change is undone too and the caller must try again.
create function public.finalize_payment_and_enqueue(
  p_razorpay_order_id   text,
  p_razorpay_payment_id text,
  p_amount_paise        bigint
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_outcome  jsonb;
  v_result   text;
  v_order_id uuid;
  v_kinds    text[];
  v_queued   int := 0;
  v_rows     int;
  o          record;
begin
  perform public.ps_outbox_check_id(p_razorpay_order_id);
  perform public.ps_outbox_check_id(p_razorpay_payment_id);
  -- mark_order_paid compares with <>, which a null would pass, marking the order paid
  if p_amount_paise is null then
    raise exception 'A payment amount is required';
  end if;

  v_outcome := public.mark_order_paid(p_razorpay_order_id, p_razorpay_payment_id, p_amount_paise);
  v_result := v_outcome ->> 'result';
  v_order_id := (v_outcome ->> 'order_id')::uuid;

  if v_result in ('paid', 'already_paid') then
    select order_status, payment_status, customer_email_sent_at, owner_email_sent_at, round(total_amount * 100)::bigint as paise
      into o from public.orders where id = v_order_id;

    -- A refunded order answers already_paid and needs no notice. E-mails sent before this
    -- migration are recorded on the order and are not repeated.
    if o.payment_status = 'paid' then
      v_kinds := array[]::text[];
      if o.customer_email_sent_at is null then
        v_kinds := v_kinds || case when o.order_status = 'cancelled' then 'customer_paid_after_cancel' else 'customer_receipt' end;
      end if;
      if o.owner_email_sent_at is null then
        v_kinds := v_kinds || case when o.order_status = 'cancelled' then 'owner_refund_needed' else 'owner_paid' end;
      end if;

      -- Keyed by recipient, not kind: an order cancelled after payment and redelivered before
      -- sending must not give the same person a second notice of another kind
      insert into public.notification_outbox (dedupe_key, order_id, razorpay_payment_id, razorpay_order_id,
                                              notification_type, payload)
      select 'order/' || v_order_id || '/' || split_part(kind, '_', 1), v_order_id, p_razorpay_payment_id, p_razorpay_order_id,
             kind, jsonb_build_object('amount_paise', o.paise)
        from unnest(v_kinds) as kind
      on conflict (dedupe_key) do nothing;
      get diagnostics v_rows = row_count;
      v_queued := v_rows;
    end if;

  elsif v_result = 'duplicate_payment' then
    v_queued := public.enqueue_payment_alert('duplicate_payment', p_razorpay_payment_id, p_razorpay_order_id,
                                             v_order_id, p_amount_paise)::int;

  elsif v_result = 'amount_mismatch' then
    select round(total_amount * 100)::bigint as paise into o from public.orders where id = v_order_id;
    v_queued := public.enqueue_payment_alert('amount_mismatch', p_razorpay_payment_id, p_razorpay_order_id,
                                             v_order_id, p_amount_paise, o.paise)::int;

  elsif v_result = 'not_found' then
    v_queued := public.enqueue_payment_alert('unknown_order', p_razorpay_payment_id, p_razorpay_order_id,
                                             null, p_amount_paise)::int;

  else
    raise exception 'Unexpected payment outcome';
  end if;

  return v_outcome || jsonb_build_object('notifications_queued', v_queued);
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Delivering notifications
-- ---------------------------------------------------------------------------

-- Leases due rows to one caller. SKIP LOCKED keeps workers apart. A lease that ran out means a
-- worker died mid-send, which counts as an attempt, so a crash cannot loop for ever.
-- p_order_id limits the claim to one order, for sending straight after a payment.
create function public.claim_notifications(
  p_limit         integer default 20,
  p_lease_seconds integer default 120,
  p_order_id      uuid default null
)
returns table (
  id uuid, dedupe_key text, order_id uuid, razorpay_payment_id text, razorpay_order_id text,
  notification_type text, payload jsonb, attempt_count integer, lease_token uuid
)
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_lease_until timestamptz := now() + make_interval(secs => least(greatest(coalesce(p_lease_seconds, 120), 30), 900));
  v_token       uuid;
  v_attempts    int;
  r             public.notification_outbox%rowtype;
begin
  for r in
    select n.* from public.notification_outbox n
     where n.status in ('pending', 'processing')
       and n.next_attempt_at <= now()
       and (p_order_id is null or n.order_id = p_order_id)
     order by n.next_attempt_at, n.created_at
     for update of n skip locked
     limit least(greatest(coalesce(p_limit, 20), 1), 100)
  loop
    v_attempts := r.attempt_count + (r.status = 'processing')::int;

    if v_attempts >= r.max_attempts then
      update public.notification_outbox n
         set status = 'failed', attempt_count = v_attempts, lease_token = null, lease_expires_at = null,
             last_error = 'Delivery was interrupted on the final attempt'
       where n.id = r.id;
      continue;
    end if;

    v_token := gen_random_uuid();
    update public.notification_outbox n
       set status = 'processing', attempt_count = v_attempts, lease_token = v_token,
           lease_expires_at = v_lease_until, next_attempt_at = v_lease_until
     where n.id = r.id;

    id := r.id; dedupe_key := r.dedupe_key; order_id := r.order_id;
    razorpay_payment_id := r.razorpay_payment_id; razorpay_order_id := r.razorpay_order_id;
    notification_type := r.notification_type; payload := r.payload;
    attempt_count := v_attempts; lease_token := v_token;
    return next;
  end loop;
end;
$$;

-- Call only after Resend accepted the message. The lease token stops a worker that lost its
-- lease from finishing another worker's claim. Returns false when the lease is no longer held.
create function public.complete_notification(p_id uuid, p_lease_token uuid, p_resend_id text)
returns boolean
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_type     text;
  v_order_id uuid;
begin
  if coalesce(p_resend_id, '') = '' then
    raise exception 'A Resend message id is required';
  end if;

  update public.notification_outbox n
     set status = 'sent', delivered_at = now(), resend_id = left(p_resend_id, 128),
         lease_token = null, lease_expires_at = null, last_error = null
   where n.id = p_id and n.status = 'processing' and n.lease_token = p_lease_token
  returning n.notification_type, n.order_id into v_type, v_order_id;
  if not found then
    return false;
  end if;

  -- Keeps Admin → Orders accurate; it reads these two dates
  if v_order_id is not null then
    if v_type in ('customer_receipt', 'customer_paid_after_cancel') then
      update public.orders o set customer_email_sent_at = now()
       where o.id = v_order_id and o.customer_email_sent_at is null;
    elsif v_type in ('owner_paid', 'owner_refund_needed') then
      update public.orders o set owner_email_sent_at = now()
       where o.id = v_order_id and o.owner_email_sent_at is null;
    end if;
  end if;
  return true;
end;
$$;

-- p_permanent: retrying cannot help, for example a rejected address.
-- p_consume_attempt = false: nothing was attempted, for example e-mail is not configured.
-- p_retry_after_seconds: the provider's Retry-After. It can only lengthen the wait, up to 24 hours.
-- Returns the new status, or null when the lease is no longer held.
create function public.fail_notification(
  p_id                  uuid,
  p_lease_token         uuid,
  p_error               text,
  p_retry_after_seconds integer default null,
  p_permanent           boolean default false,
  p_consume_attempt     boolean default true
)
returns text
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  c_delays constant interval[] := array['1 minute', '5 minutes', '15 minutes', '1 hour', '4 hours',
                                        '12 hours', '24 hours', '24 hours']::interval[];
  v_attempts int;
  v_max      int;
  v_status   text;
  v_delay    interval;
begin
  select n.attempt_count, n.max_attempts into v_attempts, v_max
    from public.notification_outbox n
   where n.id = p_id and n.status = 'processing' and n.lease_token = p_lease_token
     for update;
  if not found then
    return null;
  end if;

  if coalesce(p_consume_attempt, true) then
    v_attempts := v_attempts + 1;
  end if;
  v_status := case when coalesce(p_permanent, false) or v_attempts >= v_max then 'failed' else 'pending' end;

  v_delay := c_delays[least(greatest(v_attempts, 1), array_length(c_delays, 1))];
  v_delay := greatest(v_delay, make_interval(secs => least(greatest(coalesce(p_retry_after_seconds, 0), 0), 86400)));

  update public.notification_outbox n
     set status = v_status, attempt_count = v_attempts, next_attempt_at = now() + v_delay,
         lease_token = null, lease_expires_at = null,
         last_error = public.ps_outbox_sanitize_error(p_error)
   where n.id = p_id;
  return v_status;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Privileges: the server only
-- ---------------------------------------------------------------------------
revoke all on function public.ps_outbox_sanitize_error(text) from public, anon, authenticated, service_role;
revoke all on function public.ps_outbox_check_id(text) from public, anon, authenticated, service_role;
revoke all on function public.enqueue_payment_alert(text, text, text, uuid, bigint, bigint) from public, anon, authenticated;
revoke all on function public.finalize_payment_and_enqueue(text, text, bigint) from public, anon, authenticated;
revoke all on function public.claim_notifications(integer, integer, uuid) from public, anon, authenticated;
revoke all on function public.complete_notification(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.fail_notification(uuid, uuid, text, integer, boolean, boolean) from public, anon, authenticated;

grant execute on function public.enqueue_payment_alert(text, text, text, uuid, bigint, bigint) to service_role;
grant execute on function public.finalize_payment_and_enqueue(text, text, bigint) to service_role;
grant execute on function public.claim_notifications(integer, integer, uuid) to service_role;
grant execute on function public.complete_notification(uuid, uuid, text) to service_role;
grant execute on function public.fail_notification(uuid, uuid, text, integer, boolean, boolean) to service_role;

-- ---------------------------------------------------------------------------
-- 6. Post-conditions (any failure undoes everything above)
-- ---------------------------------------------------------------------------
do $$
declare
  v_sig text;
begin
  if not (select relrowsecurity from pg_class where oid = 'public.notification_outbox'::regclass) then
    raise exception 'RLS is off on notification_outbox — rolling back';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'notification_outbox') then
    raise exception 'notification_outbox has a policy — rolling back';
  end if;
  if has_table_privilege('anon', 'public.notification_outbox', 'SELECT,INSERT,UPDATE,DELETE')
     or has_table_privilege('authenticated', 'public.notification_outbox', 'SELECT,INSERT,UPDATE,DELETE')
     or has_table_privilege('service_role', 'public.notification_outbox', 'SELECT,INSERT,UPDATE,DELETE') then
    raise exception 'notification_outbox has table grants — rolling back';
  end if;
  foreach v_sig in array array[
    'public.enqueue_payment_alert(text, text, text, uuid, bigint, bigint)',
    'public.finalize_payment_and_enqueue(text, text, bigint)',
    'public.claim_notifications(integer, integer, uuid)',
    'public.complete_notification(uuid, uuid, text)',
    'public.fail_notification(uuid, uuid, text, integer, boolean, boolean)'
  ] loop
    if has_function_privilege('anon', v_sig, 'EXECUTE')
       or has_function_privilege('authenticated', v_sig, 'EXECUTE')
       or not has_function_privilege('service_role', v_sig, 'EXECUTE') then
      raise exception 'Wrong privileges on % — rolling back', v_sig;
    end if;
  end loop;
  foreach v_sig in array array['public.ps_outbox_sanitize_error(text)', 'public.ps_outbox_check_id(text)'] loop
    if has_function_privilege('anon', v_sig, 'EXECUTE')
       or has_function_privilege('authenticated', v_sig, 'EXECUTE')
       or has_function_privilege('service_role', v_sig, 'EXECUTE') then
      raise exception 'Wrong privileges on % — rolling back', v_sig;
    end if;
  end loop;
end $$;

-- Make the Data API see the new functions immediately (sent at COMMIT)
notify pgrst, 'reload schema';

commit;
