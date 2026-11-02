#!/bin/bash
# Migration 10 tests. Runs INSIDE a disposable postgres:17.11 container with no network, over the
# local socket only. No Razorpay or Resend is called: acceptance and failures are simulated.
R=/sql; V=/sql/proposed-09-v2; T=/sql/proposed-10-outbox; F=$T/tests/fixtures; W=/tmp/w; mkdir -p $W
M=$T/10_outbox.sql; PRE=$T/10_precheck_readonly.sql; VER=$T/10_verify_readonly.sql; RB=$T/10_rollback.sql
M9=$V/09v2_razorpay_payments.sql; RB9=$V/09v2_rollback.sql
export PGCLIENTENCODING=UTF8 PGHOST=/var/run/postgresql
FP8=f58df5ff55e84e958d1e27336cd82f6e; FPC=11e685594045be8687ee025bcba72c8c
FPM=ae7666b99cc00a000ebe74611c4e1f24; FPG=acfa79d5e0d9f1f6adabc914cb1ba7fe
su(){ local db=$1; shift; psql -U checker -d "$db" -q -v ON_ERROR_STOP=1 "$@"; }
ow(){ local db=$1; shift; psql -U postgres -d "$db" -q -v ON_ERROR_STOP=1 "$@"; }
q(){ su "$1" -A -t -c "$2" 2>&1; }
# One request, as the SQL Editor sends it
em(){ psql -X -q -U postgres -d "$1" -A -t -F '|' -c "$(cat "$2")"; }
emro(){ PGOPTIONS='-c default_transaction_read_only=on' em "$1" "$2"; }
# Calls as the server role. Multiple lines of output stay as they are.
sv(){ psql -X -q -U checker -d "$1" -A -t -F '|' -v ON_ERROR_STOP=1 -c "set role service_role; $2" 2>&1; }
as(){ q "$1" "select t.run('$2', $3, \$q\$$4\$q\$)"; }
PASS=0; FAIL=0; FAILS=()
ck(){ if [[ "$2" == $3 ]]; then PASS=$((PASS+1)); echo "  PASS  $1"; else FAIL=$((FAIL+1)); FAILS+=("$1 => $2"); echo "  FAIL  $1 => $(echo "$2" | cut -c1-170)"; fi; }
stops(){ local out; out=$(em "$2" "$3" 2>&1); local rc=$?; [ $rc -ne 0 ] && [[ "$out" == $4 ]] && { PASS=$((PASS+1)); echo "  PASS  $1"; } || { FAIL=$((FAIL+1)); FAILS+=("$1 => rc=$rc $out"); echo "  FAIL  $1 => rc=$rc $(echo "$out" | cut -c1-170)"; }; }
falses(){ awk -F'|' '$3=="f"{print $2}'; }
newdb(){ q postgres "create database $1 template $2" >/dev/null; }
inj(){ awk -v t="$2" -v a="$3" 'index($0,a)==1 && !d {print t; d=1} {print}' "$1"; }
fps(){ q "$1" "select string_agg(md5(ltrim(replace(prosrc, E'\r',''),E'\n')), ' ' order by proname) from pg_proc where pronamespace='public'::regnamespace and proname in ('mark_order_paid','place_order','place_order_core','ps_orders_payment_guard')"; }
FPALL="$FPM $FP8 $FPC $FPG"
# Every public function outside step 10: body, settings, definer flag and privileges
fpwide(){ q "$1" "select md5(string_agg(oid::regprocedure::text||prosrc||coalesce(proconfig::text,'')||prosecdef::text||coalesce(proacl::text,''), '|' order by oid::regprocedure::text)) from pg_proc where pronamespace='public'::regnamespace and proname not in ('finalize_payment_and_enqueue','enqueue_payment_alert','claim_notifications','complete_notification','fail_notification','ps_outbox_sanitize_error','ps_outbox_check_id')"; }
ostate(){ q "$1" "select (select count(*) from pg_proc where pronamespace='public'::regnamespace and proname in ('finalize_payment_and_enqueue','enqueue_payment_alert','claim_notifications','complete_notification','fail_notification','ps_outbox_sanitize_error','ps_outbox_check_id')) || '/' || (to_regclass('public.notification_outbox') is not null)::text"; }
rz(){ q "$1" "select t.rz('$2','$3')" >/dev/null; }
fin(){ sv "$1" "select public.finalize_payment_and_enqueue('$2','$3',$4)::text"; }
rows(){ q "$1" "select count(*) from public.notification_outbox ${2:-}"; }
# Claims due rows and prints id|lease_token for the first one
claim1(){ sv "$1" "select id||'|'||lease_token from public.claim_notifications(1, 120)"; }
makedue(){ q "$1" "update public.notification_outbox set next_attempt_at = now() - interval '1 second', lease_expires_at = case when status='processing' then now() - interval '1 second' else lease_expires_at end where status in ('pending','processing')" >/dev/null; }

[ "$(tail -n +2 /proc/net/route | wc -l)" = "0" ] || { echo "NETWORK PRESENT: STOP"; exit 9; }
echo "server: $(q postgres 'select version()' | cut -c1-60)"
echo "network routes: 0; .env visible: $(ls -a /sql | grep -c '^\.env'); credential-like env vars: $(env | grep -ciE 'supabase|razorpay|resend|database_url')"
echo "md5 10_outbox $(md5sum < $M | cut -c1-32); precheck $(md5sum < $PRE | cut -c1-32); verify $(md5sum < $VER | cut -c1-32); rollback $(md5sum < $RB | cut -c1-32)"
echo "md5 08 $(md5sum < $R/08_checkout_hardening.sql | cut -c1-32); 09v2 $(md5sum < $M9 | cut -c1-32); v2r1 verify $(md5sum < /sql/proposed-09-v2-r1/09v2r1_verify_readonly.sql | cut -c1-32)"
md5sum $R/*.sql $V/*.sql /sql/proposed-09-v2-r1/*.sql $T/*.sql > $W/before.md5

q postgres "create database base" >/dev/null; su base -f $F/prelude.sql >/dev/null 2>$W/e || { cat $W/e; exit 1; }
for f in 01_schema 02_auth_functions_rls 08_checkout_hardening; do ow base -f $R/$f.sql >$W/o 2>&1 || { echo "FAILED $f"; tail -3 $W/o; exit 1; }; done
su base -f $F/harness.sql >/dev/null 2>$W/e || { cat $W/e; exit 1; }
newdb clean08 base
su base -f $F/seed.sql >/dev/null 2>$W/e || { cat $W/e; exit 1; }
em base $M9 >/dev/null 2>$W/e || { echo "09 v2 FAILED"; cat $W/e; exit 1; }
em clean08 $M9 >/dev/null 2>$W/e || { echo "09 v2 clean FAILED"; cat $W/e; exit 1; }

echo "=== 0. baseline ==="
ck "T0.1 PostgreSQL is 17.11" "$(q postgres 'show server_version')" "17.11*"
ck "T0.2 fingerprints on Migration 09 v2" "$(fps base)" "$FPALL"

echo "=== 1. clean installation and 2. precheck ==="
newdb c1 clean08
PC=$(emro c1 $PRE 2>&1); ck "T1.1 precheck runs read-only" "$(echo "$PC" | grep -c '|')" "1[0-9]"
ck "T1.2 precheck: no false rows" "$(echo "$PC" | falses | wc -l)" "0"
stops "T1.3 verify before the migration stops with its plain message" c1 $VER "*Migration 10 is not applied, so nothing was verified. No data was changed.*"
OUT=$(em c1 $M 2>&1); ck "T1.4 clean install as one request" "$?" "0"
ck "T1.5 seven functions and the table exist" "$(ostate c1)" "7/true"
stops "T1.6 second run stops" c1 $M "*step 10 appears to be applied already*"
ck "T1.7 fingerprints unchanged" "$(fps c1)" "$FPALL"
newdb c2 clean08; OUT=$(ow c2 -f $M 2>&1); ck "T1.8 clean install statement by statement" "$?" "0"

echo "=== 3. verification ==="
V1=$(emro c1 $VER 2>&1); ck "T3.1 verify runs read-only, no false rows" "$(echo "$V1" | grep -c '|')/$(echo "$V1" | falses | wc -l)" "2[0-9]/0"
echo "    verify rows: $(echo "$V1" | grep -c '|'), true: $(echo "$V1" | awk -F'|' '$3=="t"' | wc -l), information: $(echo "$V1" | awk -F'|' '$3==""' | wc -l)"
ck "T3.2 read-only session refuses a write (control)" "$(PGOPTIONS='-c default_transaction_read_only=on' psql -X -q -U postgres -d c1 -c 'update public.coupons set used_count=0' 2>&1 | grep -c 'read-only transaction')" "1"

echo "=== representative store: nothing existing is touched ==="
newdb p1 base; q p1 "select t.snap()" >/dev/null
RF=$(q p1 "select pg_relation_filenode('public.orders')"); UP=$(q p1 "select max(updated_at) from public.orders"); FW=$(fpwide p1)
ck "T4.1 precheck on the store: no false rows" "$(emro p1 $PRE 2>&1 | falses | wc -l)" "0"
OUT=$(em p1 $M 2>&1); ck "T4.2 migration on the store" "$?" "0"
ck "T4.3 no rewrite of orders" "$(q p1 "select pg_relation_filenode('public.orders')")" "$RF"
ck "T4.4 orders, items, customers, coupons, catalogue identical" "$(q p1 'select t.same10()')" "same"
ck "T4.5 updated_at unchanged" "$(q p1 "select max(updated_at) from public.orders")" "$UP"
ck "T4.6 no outbox row for existing orders" "$(rows p1)" "0"
ck "T4.7 existing orders have no new columns from step 10" "$(q p1 "select count(*) from information_schema.columns where table_name='orders' and column_name like '%outbox%'")" "0"
ck "T4.8 every other public function and its privileges unchanged" "$(fpwide p1)" "$FW"

echo "=== 4. COD compatibility ==="
newdb cod p1
ck "T5.1 COD order" "$(q cod "select left(t.run('anon',null,t.sql('place_order','c0000000-0000-0000-0000-000000000001','SEED','COD')),2)")" "OK"
ck "T5.2 COD retry replays" "$(q cod "select t.run('anon',null,t.sql('place_order','c0000000-0000-0000-0000-000000000001','SEED','COD'))")" 'OK *"replayed": true*'
ck "T5.3 coupon counted once" "$(q cod "select used_count from public.coupons where code='SEED'")" "9"
ck "T5.4 COD creates no outbox row" "$(rows cod)" "0"
ck "T5.5 non-COD still refused by place_order" "$(q cod "select t.run('anon',null,t.sql('place_order','c0000000-0000-0000-0000-000000000002',null,'RAZORPAY'))")" "ERR * Only Cash on Delivery*"
ck "T5.6 admin can still ship COD" "$(q cod "select t.run('authenticated','00000000-0000-0000-0000-0000000000e1',\$q\$with u as (update public.orders set order_status='shipped' where idempotency_key='c0000000-0000-0000-0000-000000000001' returning 1) select count(*)::text from u\$q\$)")" "OK 1"
ck "T5.7 finalize cannot touch a COD order" "$(fin cod order_none pay_cod1 109900 | grep -c not_found)/$(q cod "select payment_status from public.orders where idempotency_key='c0000000-0000-0000-0000-000000000001'")" "1/pending"

echo "=== 5. successful payment ==="
newdb s1 p1; rz s1 d0000000-0000-0000-0000-000000000001 order_S1
OUT=$(fin s1 order_S1 pay_S1 109900)
ck "T6.1 outcome semantics kept" "$OUT" '*"result": "paid"*'
ck "T6.2 reports 2 queued" "$OUT" '*"notifications_queued": 2*'
ck "T6.3 order paid and confirmed" "$(q s1 "select payment_status||'/'||order_status||'/'||razorpay_payment_id from public.orders where razorpay_order_id='order_S1'")" "paid/confirmed/pay_S1"
OID=$(q s1 "select id from public.orders where razorpay_order_id='order_S1'")
ck "T6.4 receipt and owner rows with stable keys" "$(q s1 "select string_agg(dedupe_key,' ' order by dedupe_key) from public.notification_outbox")" "order/$OID/customer order/$OID/owner"
ck "T6.5 payload holds an amount only" "$(q s1 "select distinct payload::text from public.notification_outbox")" '{"amount_paise": 109900}'
ck "T6.6 no customer detail anywhere in the outbox" "$(q s1 "select count(*) from public.notification_outbox n where n::text ilike '%example.com%' or n::text like '%9876543210%' or n::text ilike '%kadapa%'")" "0"

echo "=== 6. duplicate payment and deduplication ==="
OUT=$(fin s1 order_S1 pay_S1 109900); ck "T7.1 repeat delivery is already_paid, queues 0" "$OUT" '*"already_paid"*"notifications_queued": 0*'
ck "T7.2 still 2 rows" "$(rows s1)" "2"
OUT=$(fin s1 order_S1 pay_S2 109900); ck "T7.3 second payment: outcome kept, alert queued" "$OUT" '*"notifications_queued": 1*'
ck "T7.4 alert stored" "$(q s1 "select notification_type||'/'||dedupe_key||'/'||(order_id is not null)::text from public.notification_outbox where razorpay_payment_id='pay_S2'")" "duplicate_payment/payment/pay_S2/duplicate/true"
OUT=$(fin s1 order_S1 pay_S2 109900); ck "T7.5 repeated second payment: no new alert" "$OUT/$(rows s1 "where notification_type='duplicate_payment'")" '*"notifications_queued": 0*/1'
ck "T7.6 first payment id kept" "$(q s1 "select razorpay_payment_id||'/'||duplicate_payment_id from public.orders where razorpay_order_id='order_S1'")" "pay_S1/pay_S2"
ck "T7.7 enqueue_payment_alert is permanent too" "$(sv s1 "select public.enqueue_payment_alert('duplicate_payment','pay_S2','order_S1')")" "f"
rz s1 d0000000-0000-0000-0000-000000000002 order_S2
for i in 1 2 3 4 5 6; do fin s1 order_S2 pay_P 109900 > $W/f$i 2>&1 & done; wait
ck "T7.8 six parallel deliveries: one paid, five already_paid" "$(cat $W/f? | grep -c '"result": "paid"')/$(cat $W/f? | grep -c 'already_paid')" "1/5"
ck "T7.9 six parallel deliveries: exactly 2 rows" "$(rows s1 "where razorpay_order_id='order_S2'")" "2"
ck "T7.10 event order does not matter (order.paid after payment.captured)" "$(fin s1 order_S2 pay_P 109900 | grep -c '"notifications_queued": 0')" "1"
rz s1 d0000000-0000-0000-0000-000000000003 order_S3
q s1 "update public.orders set order_status='cancelled' where razorpay_order_id='order_S3'" >/dev/null
OUT=$(fin s1 order_S3 pay_S3 109900)
ck "T7.11 paid after cancel: refund notices, not receipts" "$(q s1 "select string_agg(notification_type,' ' order by notification_type) from public.notification_outbox where razorpay_order_id='order_S3'")" "customer_paid_after_cancel owner_refund_needed"
rz s1 d0000000-0000-0000-0000-000000000004 order_S4; fin s1 order_S4 pay_S4 109900 >/dev/null
q s1 "update public.orders set payment_status='refunded' where razorpay_order_id='order_S4'; delete from public.notification_outbox where razorpay_order_id='order_S4'" >/dev/null
ck "T7.12 refunded order: repeat queues nothing" "$(fin s1 order_S4 pay_S4 109900 | grep -c '"notifications_queued": 0')/$(rows s1 "where razorpay_order_id='order_S4'")" "1/0"
rz s1 d0000000-0000-0000-0000-000000000005 order_S5
q s1 "update public.orders set customer_email_sent_at=now() where razorpay_order_id='order_S5'" >/dev/null
fin s1 order_S5 pay_S5 109900 >/dev/null
ck "T7.13 e-mail already recorded on the order is not repeated" "$(q s1 "select string_agg(notification_type,' ') from public.notification_outbox where razorpay_order_id='order_S5'")" "owner_paid"
rz s1 d0000000-0000-0000-0000-000000000007 order_S7; fin s1 order_S7 pay_S7 109900 >/dev/null
q s1 "update public.orders set order_status='cancelled' where razorpay_order_id='order_S7'" >/dev/null
OUT=$(fin s1 order_S7 pay_S7 109900)
ck "T7.14 paid, cancelled, redelivered before sending: one notice per person" "$(echo "$OUT" | grep -c '"notifications_queued": 0')/$(q s1 "select string_agg(notification_type,' ' order by notification_type) from public.notification_outbox where razorpay_order_id='order_S7'")" "1/customer_receipt owner_paid"

echo "=== 7. unknown order and 8. amount mismatch ==="
OUT=$(fin s1 order_NOPE pay_U1 50000); ck "T8.1 unknown order: not_found kept, alert queued" "$OUT" '*"not_found"*"notifications_queued": 1*'
ck "T8.2 stored with no order link" "$(q s1 "select notification_type||'/'||dedupe_key||'/'||(order_id is null)::text||'/'||razorpay_order_id||'/'||payload::text from public.notification_outbox where razorpay_payment_id='pay_U1'")" 'unknown_order/payment/pay_U1/unknown_order/true/order_NOPE/{"amount_paise": 50000}'
ck "T8.3 repeated: no new alert" "$(fin s1 order_NOPE pay_U1 50000 | grep -c '"notifications_queued": 0')/$(rows s1 "where razorpay_payment_id='pay_U1'")" "1/1"
rz s1 d0000000-0000-0000-0000-000000000006 order_M1
OUT=$(fin s1 order_M1 pay_M1 100); ck "T9.1 mismatch: outcome kept, alert queued" "$OUT" '*"amount_mismatch"*"notifications_queued": 1*'
ck "T9.2 order is NOT paid" "$(q s1 "select payment_status||'/'||(razorpay_payment_id is null)::text from public.orders where razorpay_order_id='order_M1'")" "pending/true"
ck "T9.3 alert carries both amounts" "$(q s1 "select payload::text from public.notification_outbox where razorpay_payment_id='pay_M1'")" '{"amount_paise": 100, "expected_paise": 109900}'
ck "T9.4 repeated: one alert" "$(fin s1 order_M1 pay_M1 100 >/dev/null; rows s1 "where razorpay_payment_id='pay_M1'")" "1"
ck "T9.5 invalid payment id refused" "$(sv s1 "select public.enqueue_payment_alert('unknown_order','bad id; drop')" | grep -c 'Invalid Razorpay identifier')" "1"
ck "T9.6 invalid alert type refused" "$(sv s1 "select public.enqueue_payment_alert('customer_receipt','pay_X')" | grep -c 'Unknown alert type')" "1"
ck "T9.7 null payment id refused" "$(sv s1 "select public.enqueue_payment_alert('unknown_order',null)" | grep -c 'needs a Razorpay payment id')" "1"
rz s1 d0000000-0000-0000-0000-000000000008 order_N1
ck "T9.8 a missing amount is refused and the order stays unpaid" "$(sv s1 "select public.finalize_payment_and_enqueue('order_N1','pay_N1',null)::text" | grep -c 'amount is required')/$(q s1 "select payment_status||'/'||(razorpay_payment_id is null)::text from public.orders where razorpay_order_id='order_N1'")" "1/pending/true"

echo "=== 9. transaction rollback when the outbox insert fails ==="
newdb r1 p1; q r1 "select t.rz('e0000000-0000-0000-0000-000000000001','order_R1','TEN')" >/dev/null
B=$(q r1 "select used_count from public.coupons where code='TEN'")
q r1 "create function t.boom() returns trigger language plpgsql as \$b\$ begin raise exception 'outbox unavailable'; end \$b\$; create trigger boom before insert on public.notification_outbox for each row execute function t.boom();" >/dev/null
OUT=$(fin r1 order_R1 pay_R1 98900)
ck "T10.1 the caller gets an error" "$OUT" "*outbox unavailable*"
ck "T10.2 payment undone: order still unpaid, no payment id" "$(q r1 "select payment_status||'/'||order_status||'/'||(razorpay_payment_id is null)::text||'/'||(paid_at is null)::text from public.orders where razorpay_order_id='order_R1'")" "pending/pending/true/true"
ck "T10.3 coupon count undone" "$(q r1 "select used_count from public.coupons where code='TEN'")" "$B"
ck "T10.4 no outbox row" "$(rows r1)" "0"
q r1 "drop trigger boom on public.notification_outbox" >/dev/null
TOT=$(q r1 "select round(total_amount*100)::bigint from public.orders where razorpay_order_id='order_R1'")
ck "T10.5 redelivery after recovery succeeds" "$(fin r1 order_R1 pay_R1 $TOT)" '*"result": "paid"*"notifications_queued": 2*'
ck "T10.6 coupon counted exactly once" "$(( $(q r1 "select used_count from public.coupons where code='TEN'") - B ))" "1"

echo "=== 10. concurrent workers ==="
newdb w1 p1
q w1 "select set_config('role','service_role',false); select public.enqueue_payment_alert('unknown_order','pay_C'||g) from generate_series(1,200) g" >/dev/null
for i in 1 2 3 4 5 6 7 8; do ( for n in $(seq 1 12); do sv w1 "select id from public.claim_notifications(10, 120)"; done > $W/w$i 2>&1 ) & done; wait
ck "T11.1 all 200 claimed" "$(cat $W/w? | grep -cE '^[0-9a-f-]{36}$')" "200"
ck "T11.2 no row claimed twice" "$(cat $W/w? | grep -E '^[0-9a-f-]{36}$' | sort | uniq -d | wc -l)" "0"
ck "T11.3 more than one worker did work" "$(for i in 1 2 3 4 5 6 7 8; do grep -cE '^[0-9a-f-]{36}$' $W/w$i; done | awk '$1>0' | wc -l)" "[2-8]"
ck "T11.4 no errors" "$(cat $W/w? | grep -c ERROR)" "0"
ck "T11.5 a live lease is not claimed again" "$(sv w1 "select count(*) from public.claim_notifications(100, 120)")" "0"
sv w1 "select public.enqueue_payment_alert('unknown_order','pay_LOCK')" >/dev/null
psql -X -q -U checker -d w1 -c "begin; select 1 from public.notification_outbox where razorpay_payment_id='pay_LOCK' for update; select pg_sleep(4); commit;" >/dev/null 2>&1 & BL=$!
sleep 1
T0=$(date +%s%N); N=$(sv w1 "select count(*) from public.claim_notifications(100, 120)"); MS=$(( ($(date +%s%N)-T0)/1000000 ))
ck "T11.6 locked row skipped, not waited for (${MS} ms)" "$N/$(( MS<2000 ))" "0/1"
wait $BL

echo "=== 11. expired lease recovery ==="
newdb l1 p1; q l1 "select set_config('role','service_role',false); select public.enqueue_payment_alert('unknown_order','pay_L1')" >/dev/null
C1=$(claim1 l1); ID=${C1%|*}; TK1=${C1#*|}
ck "T12.1 claimed with a lease" "$(q l1 "select status||'/'||(lease_expires_at > now())::text from public.notification_outbox")" "processing/true"
ck "T12.2 attempt not yet counted" "$(q l1 "select attempt_count from public.notification_outbox")" "0"
makedue l1
C2=$(claim1 l1); TK2=${C2#*|}
ck "T12.3 expired lease is recovered by another worker" "$( [ -n "$TK2" ] && [ "$TK1" != "$TK2" ] && echo new-token)" "new-token"
ck "T12.4 the crashed attempt is counted" "$(q l1 "select attempt_count from public.notification_outbox")" "1"
ck "T12.5 the dead worker can no longer complete" "$(sv l1 "select public.complete_notification('$ID','$TK1','msg_old')")" "f"
ck "T12.6 the dead worker can no longer fail it" "$(sv l1 "select coalesce(public.fail_notification('$ID','$TK1','late'),'null-result')")" "null-result"
ck "T12.7 still processing under the new lease" "$(q l1 "select status||'/'||(lease_token='$TK2')::text from public.notification_outbox")" "processing/true"
q l1 "update public.notification_outbox set attempt_count=7" >/dev/null; makedue l1
ck "T12.8 crash on the last attempt fails it, no endless loop" "$(sv l1 "select count(*) from public.claim_notifications(5,120)")/$(q l1 "select status||'/'||attempt_count from public.notification_outbox")" "0/failed/8"

echo "=== 12. eight attempts and final failure ==="
newdb a1 p1; q a1 "select set_config('role','service_role',false); select public.enqueue_payment_alert('unknown_order','pay_A1')" >/dev/null
for i in 1 2 3 4 5 6 7 8; do
  makedue a1; C=$(claim1 a1); ID=${C%|*}; TK=${C#*|}
  S=$(sv a1 "select public.fail_notification('$ID','$TK','Resend 503')")
  G=$(q a1 "select round(extract(epoch from next_attempt_at-now())/60) from public.notification_outbox")
  case $i in 1) E=1;; 2) E=5;; 3) E=15;; 4) E=60;; 5) E=240;; 6) E=720;; 7) E=1440;; 8) E=1440;; esac
  if [ $i -lt 8 ]; then ck "T13.$i attempt $i pending, next in $E minutes" "$S/$G/$(q a1 "select attempt_count from public.notification_outbox")" "pending/$E/$i"
  else ck "T13.8 attempt 8 is final" "$S/$(q a1 "select attempt_count||'/'||(lease_token is null)::text from public.notification_outbox")" "failed/8/true"; fi
done
ck "T13.9 a failed row is never claimed again" "$(makedue a1; sv a1 "select count(*) from public.claim_notifications(5,120)")" "0"
newdb a2 p1; q a2 "select set_config('role','service_role',false); select public.enqueue_payment_alert('unknown_order','pay_R'||g) from generate_series(1,6) g" >/dev/null
mapfile -t CL < <(sv a2 "select id||'|'||lease_token from public.claim_notifications(6,120) order by id")
gap(){ q a2 "select round(extract(epoch from next_attempt_at-now())/60) from public.notification_outbox where id='$1'"; }
I=${CL[0]%|*}; L=${CL[0]#*|}; sv a2 "select public.fail_notification('$I','$L','slow',7200)" >/dev/null; ck "T13.10 Retry-After lengthens the wait" "$(gap $I)" "120"
I=${CL[1]%|*}; L=${CL[1]#*|}; sv a2 "select public.fail_notification('$I','$L','fast',2)" >/dev/null; ck "T13.11 Retry-After cannot shorten the wait" "$(gap $I)" "1"
I=${CL[2]%|*}; L=${CL[2]#*|}; sv a2 "select public.fail_notification('$I','$L','huge',9999999)" >/dev/null; ck "T13.12 Retry-After capped at 24 hours" "$(gap $I)" "1440"
I=${CL[3]%|*}; L=${CL[3]#*|}; ck "T13.13 missing e-mail settings do not use an attempt" "$(sv a2 "select public.fail_notification('$I','$L','RESEND_API_KEY missing',null,false,false)")/$(q a2 "select attempt_count from public.notification_outbox where id='$I'")" "pending/0"
I=${CL[4]%|*}; L=${CL[4]#*|}; ck "T13.14 a permanent error fails at once" "$(sv a2 "select public.fail_notification('$I','$L','422 invalid address',null,true)")/$(q a2 "select attempt_count from public.notification_outbox where id='$I'")" "failed/1"
I=${CL[5]%|*}; L=${CL[5]#*|}
sv a2 "select public.fail_notification('$I','$L','user@example.com failed for +91 98765 43210 key re_abc123def456 rzp_live_abc123XYZ token Bearer abc.def.ghi jwt eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoi.c2ln
newline $(printf 'x%.0s' $(seq 1 900))')" >/dev/null
E=$(q a2 "select last_error from public.notification_outbox where id='$I'")
ck "T13.15 secrets and contact details removed from errors" "$(echo "$E" | grep -cE 'example\.com|98765|re_abc|rzp_live|Bearer abc|eyJ')" "0"
ck "T13.16 errors truncated to 300 characters" "$(q a2 "select char_length(last_error)<=300 and position(chr(10) in last_error)=0 from public.notification_outbox where id='$I'")" "t"
newdb a3 p1; q a3 "select set_config('role','service_role',false); select public.enqueue_payment_alert('unknown_order','pay_E'||g) from generate_series(1,2) g" >/dev/null
mapfile -t CL < <(sv a3 "select id||'|'||lease_token from public.claim_notifications(2,120) order by id")
I=${CL[0]%|*}; L=${CL[0]#*|}
sv a3 "select public.fail_notification('$I','$L','Authorization: Basic cnpwX3Rlc3RfeHh4Onl5eQ== api_key=topsecret1 password: hunter2x')" >/dev/null
ck "T13.17 Basic credentials and key=value secrets removed from errors" "$(q a3 "select last_error from public.notification_outbox where id='$I'" | grep -cE 'cnpw|topsecret|hunter2')" "0"
I=${CL[1]%|*}; L=${CL[1]#*|}; q a3 "update public.notification_outbox set attempt_count=7 where id='$I'" >/dev/null
ck "T13.18 missing settings on the last attempt keep it" "$(sv a3 "select public.fail_notification('$I','$L','RESEND_API_KEY missing',null,false,false)")/$(q a3 "select attempt_count from public.notification_outbox where id='$I'")" "pending/7"
makedue a3; C=$(sv a3 "select id||'|'||lease_token from public.claim_notifications(5,120) where id='$I'"); L=${C#*|}
ck "T13.19 the kept attempt can still run, and is then final" "$(sv a3 "select public.fail_notification('$I','$L','Resend 503')")" "failed"

echo "=== 13. Resend acceptance (simulated) ==="
newdb d1 p1; rz d1 f0000000-0000-0000-0000-000000000001 order_D1; fin d1 order_D1 pay_D1 109900 >/dev/null
OIDD=$(q d1 "select id from public.orders where razorpay_order_id='order_D1'")
C=$(sv d1 "select id||'|'||lease_token||'|'||notification_type from public.claim_notifications(1,120) where notification_type='customer_receipt'")
[ -n "$C" ] || C=$(sv d1 "select id||'|'||lease_token||'|'||notification_type from public.claim_notifications(1,120)")
ID=$(echo "$C" | cut -d'|' -f1); TK=$(echo "$C" | cut -d'|' -f2); TY=$(echo "$C" | cut -d'|' -f3)
ck "T14.1 not sent until Resend accepts: the order shows no e-mail date yet" "$(q d1 "select (customer_email_sent_at is null and owner_email_sent_at is null)::text from public.orders where id='$OIDD'")" "true"
ck "T14.2 a Resend id is mandatory" "$(sv d1 "select public.complete_notification('$ID','$TK','')" | grep -c 'Resend message id is required')" "1"
ck "T14.3 the wrong lease cannot complete it" "$(sv d1 "select public.complete_notification('$ID','00000000-0000-0000-0000-000000000000','msg_1')")" "f"
ck "T14.4 acceptance marks it sent" "$(sv d1 "select public.complete_notification('$ID','$TK','msg_1')")" "t"
ck "T14.5 message id and delivered_at stored, lease cleared" "$(q d1 "select status||'/'||resend_id||'/'||(delivered_at is not null)::text||'/'||(lease_token is null)::text from public.notification_outbox where id='$ID'")" "sent/msg_1/true/true"
if [ "$TY" = "customer_receipt" ]; then C1="customer_email_sent_at"; else C1="owner_email_sent_at"; fi
ck "T14.6 the order's e-mail date is set for Admin" "$(q d1 "select ($C1 is not null)::text from public.orders where id='$OIDD'")" "true"
ck "T14.7 a sent row is never claimed again" "$(makedue d1; sv d1 "select count(*) from public.claim_notifications(10,120) where id='$ID'")" "0"
ck "T14.8 database refuses sent without delivered_at" "$(q d1 "update public.notification_outbox set delivered_at=null where id='$ID'" | grep -c 'notification_outbox_sent_needs_delivery')" "1"
ck "T14.9 database refuses an unknown type" "$(q d1 "insert into public.notification_outbox (dedupe_key, notification_type) values ('x','other')" | grep -c 'type_check')" "1"
ck "T14.10 database refuses an unknown status" "$(q d1 "insert into public.notification_outbox (dedupe_key, notification_type, status) values ('s1','unknown_order','queued')" | grep -c 'status_check')" "1"
ck "T14.11 database refuses a large payload" "$(q d1 "insert into public.notification_outbox (dedupe_key, notification_type, payload) values ('y','unknown_order', jsonb_build_object('a', md5(random()::text)||repeat(md5(random()::text),400)))" | grep -c 'payload_check')" "1"
ck "T14.12 dedupe key is unique at the database" "$(q d1 "insert into public.notification_outbox (dedupe_key, notification_type) select dedupe_key, notification_type from public.notification_outbox limit 1" | grep -c 'dedupe_key_key')" "1"
q d1 "delete from public.order_items where order_id='$OIDD'; delete from public.orders where id='$OIDD'" >/dev/null
ck "T14.13 deleting an order keeps its outbox rows, unlinked" "$(rows d1 "where order_id is null and razorpay_order_id='order_D1'")" "2"

echo "=== 14. RLS and permissions ==="
ED="'00000000-0000-0000-0000-0000000000e1'"; PL="'00000000-0000-0000-0000-0000000000e2'"
newdb x1 s1
q x1 "create role plainrole nologin; grant usage on schema t to plainrole, anon, authenticated, service_role; create table t.fn2 (call text);
insert into t.fn2 values (\$\$select public.finalize_payment_and_enqueue('order_X','pay_X',1)::text\$\$), (\$\$select public.enqueue_payment_alert('unknown_order','pay_X')::text\$\$), (\$\$select count(*)::text from public.claim_notifications()\$\$), (\$\$select public.complete_notification('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000000000','m')::text\$\$), (\$\$select public.fail_notification('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000000000','e')\$\$);" >/dev/null
for r in "anon null" "authenticated $PL" "authenticated $ED" "plainrole null"; do set -- $r
  ck "T15 $1 ${2:0:5}: refused on all 5 functions" "$(q x1 "select count(*) from t.fn2 where t.run('$1', $2, call) like 'ERR 42501%'")" "5"
  ck "T15 $1 ${2:0:5}: cannot read the table" "$(q x1 "select t.run('$1', $2, 'select count(*)::text from public.notification_outbox')")" "ERR 42501*"
  ck "T15 $1 ${2:0:5}: cannot insert" "$(q x1 "select t.run('$1', $2, \$q\$with u as (insert into public.notification_outbox (dedupe_key, notification_type) values ('z','unknown_order') returning 1) select count(*)::text from u\$q\$)")" "ERR 42501*"
done
ck "T15 service_role: allowed on all 5 functions" "$(q x1 "select count(*) from t.fn2 where t.run('service_role', null, call) not like 'ERR 42501%'")" "5"
ck "T15 service_role: no direct table access" "$(q x1 "select t.run('service_role', null, 'select count(*)::text from public.notification_outbox')")" "ERR 42501*"
ck "T15 service_role: cannot call helpers" "$(q x1 "select t.run('service_role', null, \$q\$select public.ps_outbox_sanitize_error('x')\$q\$)")" "ERR 42501*"
ck "T15 anon: cannot call helpers" "$(q x1 "select t.run('anon', null, \$q\$select public.ps_outbox_check_id('x')::text\$q\$)")" "ERR 42501*"
ck "T15 RLS on, no policy" "$(q x1 "select relrowsecurity::text||'/'||(select count(*) from pg_policies where tablename='notification_outbox') from pg_class where oid='public.notification_outbox'::regclass")" "true/0"
ck "T15 all five are definer with fixed search_path" "$(q x1 "select count(*) from pg_proc where pronamespace='public'::regnamespace and prosecdef and proconfig=array['search_path=public, pg_temp'] and proname in ('finalize_payment_and_enqueue','enqueue_payment_alert','claim_notifications','complete_notification','fail_notification')")" "5"
ck "T15 anon still runs COD" "$(q x1 "select left(t.run('anon',null,t.sql('place_order','c1000000-0000-0000-0000-000000000001',null,'COD')),2)")" "OK"
ck "T15 visitors still cannot mark paid" "$(q x1 "select t.run('anon',null,\$q\$select public.mark_order_paid('x','y',1)::text\$q\$)")" "ERR 42501*"

echo "=== migration safety stops ==="
newdb g1 base; q g1 "do \$d\$ begin execute replace(pg_get_functiondef('public.mark_order_paid(text,text,bigint)'::regprocedure),'select * into o','select  * into o'); end \$d\$" >/dev/null
stops "T16.1 stops when mark_order_paid differs by one byte" g1 $M "*public.mark_order_paid*differs from Migration 09 v2*"
newdb g2 base; q g2 "create table public.notification_outbox (id int)" >/dev/null
stops "T16.2 stops on a foreign table of the same name" g2 $M "*notification_outbox has 1 columns*"
newdb g3 base; inj $M 'select 1/0;' '-- Make the Data API see' > $W/f1.sql; OUT=$(em g3 $W/f1.sql 2>&1)
ck "T16.3 failure at the very end leaves nothing" "$(ostate g3)" "0/false"
newdb g4 base
awk 'index($0,"-- 6. Post-conditions")==1 && !d {print "grant execute on function public.fail_notification(uuid, uuid, text, integer, boolean, boolean) to anon;"; d=1} {print}' $M > $W/f2.sql
OUT=$(em g4 $W/f2.sql 2>&1); ck "T16.4 post-condition catches a visitor grant" "$OUT/$(ostate g4)" "*Wrong privileges on public.fail_notification*/0/false"
newdb g5 base
psql -X -q -U checker -d g5 -c "begin; lock table public.orders in access exclusive mode; select pg_sleep(9); commit;" >/dev/null 2>&1 & BL=$!
sleep 1; T0=$(date +%s%N); OUT=$(em g5 $M 2>&1); MS=$(( ($(date +%s%N)-T0)/1000000 ))
ck "T16.5 gives up on a locked orders table (${MS} ms)" "$(echo "$OUT" | grep -c 'lock timeout')/$(( MS>=4500 && MS<=7000 ))/$(ostate g5)" "1/1/0/false"
wait $BL

echo "=== 15. rollback of Migration 10 only ==="
newdb b1 s1; q b1 "select t.snap()" >/dev/null
OUT=$(em b1 $RB 2>&1); ck "T17.1 undelivered rows stop the rollback" "$OUT" "*notification(s) are undelivered*"
ck "T17.2 that stop changed nothing" "$(ostate b1)" "7/true"
N=$(rows b1); sed -E 's/^-- (set local ps\.confirm_undelivered_exported)/\1/' $RB > $W/rb_ok.sql
ck "T17.3 confirmed copy differs by one line" "$(diff $RB $W/rb_ok.sql | grep -c '^[<>]')" "2"
OUT=$(em b1 $W/rb_ok.sql 2>&1); ck "T17.4 confirmed rollback ran" "$?" "0"
ck "T17.5 functions gone, table kept" "$(ostate b1)" "0/true"
ck "T17.6 every outbox row kept" "$(rows b1)" "$N"
ck "T17.7 table stays locked down" "$(q b1 "select relrowsecurity::text from pg_class where oid='public.notification_outbox'::regclass")/$(q b1 "select has_table_privilege('anon','public.notification_outbox','SELECT')::text")" "true/false"
ck "T17.8 orders, catalogue identical" "$(q b1 'select t.same10()')" "same"
ck "T17.9 fingerprints unchanged" "$(fps b1)" "$FPALL"
ck "T17.10 Migration 09 v2 functions intact" "$(sv b1 "select public.mark_order_paid('order_NONE','pay_N',1)::text")" '*not_found*'
ck "T17.11 COD works after rollback" "$(q b1 "select left(t.run('anon',null,t.sql('place_order','c2000000-0000-0000-0000-000000000001',null,'COD')),2)")" "OK"
stops "T17.12 rollback twice stops" b1 $RB "*step 10 is not applied, or was already rolled back*"
stops "T17.13 verify after rollback gives its plain message" b1 $VER "*Migration 10 is not applied*"
ck "T17.14 every other public function and its privileges unchanged" "$(fpwide b1)" "$FW"

echo "=== 16. reinstallation after rollback ==="
OUT=$(em b1 $M 2>&1); ck "T18.1 reinstall ran" "$?" "0"
ck "T18.2 functions back, rows kept" "$(ostate b1)/$(rows b1)" "7/true/$N"
V2=$(emro b1 $VER 2>&1); ck "T18.3 verify after reinstall: no false rows" "$(echo "$V2" | falses | wc -l)" "0"
ck "T18.4 dedupe survives: repeat delivery queues nothing" "$(fin b1 order_S2 pay_P 109900 | grep -c '"notifications_queued": 0')" "1"
ck "T18.5 pending work is claimable again" "$(sv b1 "select (count(*)>0)::text from public.claim_notifications(5,120)")" "true"
ck "T18.6 fingerprints unchanged" "$(fps b1)/$(fpwide b1)" "$FPALL/$FW"
ck "T18.7 privileges restored" "$(q b1 "select has_function_privilege('anon','public.claim_notifications(integer,integer,uuid)','EXECUTE')::text||'/'||has_function_privilege('service_role','public.claim_notifications(integer,integer,uuid)','EXECUTE')::text")" "false/true"

echo "=== rollback order with Migration 09 ==="
newdb o1 p1; rz o1 aa000000-0000-0000-0000-000000000001 order_O1; fin o1 order_O1 pay_O1 109900 >/dev/null
sed -E 's/^-- (set local ps\.confirm_undelivered_exported)/\1/' $RB > $W/rb_ok.sql
OUT=$(em o1 $W/rb_ok.sql 2>&1); ck "T19.1 correct order: Migration 10 first" "$?" "0"
OUT=$(em o1 $RB9 2>&1); ck "T19.2 correct order: then Migration 09 v2" "$?" "0"
ck "T19.3 COD after both rollbacks" "$(q o1 "select left(t.run('anon',null,t.sql('place_order','c3000000-0000-0000-0000-000000000001',null,'COD')),2)")/$(q o1 'select t.fp()')" "OK/$FP8"
newdb o2 p1; OUT=$(em o2 $RB9 2>&1); RC=$?
ck "T19.4 wrong order: 09 rollback is not blocked by step 10" "$RC" "0"
ck "T19.5 wrong order breaks finalize, which is why the order is documented" "$(fin o2 order_Z pay_Z 1)" "*does not exist*"
OUT=$(em o2 $RB 2>&1); ck "T19.6 Migration 10 can still be removed afterwards" "$?/$(ostate o2)" "0/0/true"

echo "=== 17. fingerprints at the end ==="
for d in c1 p1 s1 r1 w1 x1 b1; do ck "T20 $d fingerprints" "$(fps $d)" "$FPALL"; done

echo "=== RESULTS ==="
echo "  pass $PASS, fail $FAIL"
for f in "${FAILS[@]}"; do echo "FAIL | $f" | cut -c1-210; done
echo "SQL files changed during run: $(md5sum -c $W/before.md5 2>/dev/null | grep -vc ': OK$')"
exit $FAIL
