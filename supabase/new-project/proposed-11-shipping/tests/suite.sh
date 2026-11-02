#!/bin/bash
# Migration 11 tests. Runs INSIDE a disposable postgres:17.11 container with no network, over the
# local socket only. Every charge and PIN code here is a test fixture, not a business value.
R=/sql; V=/sql/proposed-09-v2; T10=/sql/proposed-10-outbox; T=/sql/proposed-11-shipping; F=$T10/tests/fixtures; W=/tmp/w; mkdir -p $W
M=$T/11_shipping.sql; VER=$T/11_verify_readonly.sql; RB=$T/11_rollback.sql
M9=$V/09v2_razorpay_payments.sql; RB9=$V/09v2_rollback.sql; M10=$T10/10_outbox.sql; VER10=$T10/10_verify_readonly.sql
export PGCLIENTENCODING=UTF8 PGHOST=/var/run/postgresql
FP8=f58df5ff55e84e958d1e27336cd82f6e; FPC=11e685594045be8687ee025bcba72c8c
FPM=ae7666b99cc00a000ebe74611c4e1f24; FPG=acfa79d5e0d9f1f6adabc914cb1ba7fe
FP11=5bb8e3ce49eafb371a0644a783c921a2; FP11C=b229458111f7d02b5e3a26f642bcdfbb
su(){ local db=$1; shift; psql -U checker -d "$db" -q -v ON_ERROR_STOP=1 "$@"; }
ow(){ local db=$1; shift; psql -U postgres -d "$db" -q -v ON_ERROR_STOP=1 "$@"; }
q(){ su "$1" -A -t -c "$2" 2>&1; }
# One request, as the SQL Editor sends it
em(){ psql -X -q -U postgres -d "$1" -A -t -F '|' -c "$(cat "$2")"; }
emro(){ PGOPTIONS='-c default_transaction_read_only=on' em "$1" "$2"; }
PASS=0; FAIL=0; FAILS=()
ck(){ if [[ "$2" == $3 ]]; then PASS=$((PASS+1)); echo "  PASS  $1"; else FAIL=$((FAIL+1)); FAILS+=("$1 => $2"); echo "  FAIL  $1 => $(echo "$2" | cut -c1-170)"; fi; }
stops(){ local out; out=$(em "$2" "$3" 2>&1); local rc=$?; [ $rc -ne 0 ] && [[ "$out" == $4 ]] && { PASS=$((PASS+1)); echo "  PASS  $1"; } || { FAIL=$((FAIL+1)); FAILS+=("$1 => rc=$rc $out"); echo "  FAIL  $1 => rc=$rc $(echo "$out" | cut -c1-170)"; }; }
falses(){ awk -F'|' '$3=="f"{print $2}'; }
newdb(){ q postgres "create database $1 template $2" >/dev/null; }
fp(){ q "$1" "select md5(ltrim(replace(prosrc, E'\r',''),E'\n')) from pg_proc where oid = to_regprocedure('public.$2')::oid"; }
fps(){ echo "$(fp $1 'place_order(jsonb, jsonb, text, text, uuid)') $(fp $1 'place_order_core(jsonb, jsonb, text, text, uuid)') $(fp $1 'mark_order_paid(text, text, bigint)') $(fp $1 'ps_orders_payment_guard()')"; }
# buy <db> <fn> <pin> <items jsonb> [coupon] [key] [extra customer jsonb]
buy(){
  local coupon=null key=null extra=${7:-'{}'}
  [ -n "$5" ] && coupon="'$5'"; [ -n "$6" ] && key="'$6'"
  q "$1" "select t11.buy('$2', '$3', '$4'::jsonb, $coupon, $key, '$extra'::jsonb)"
}
# Amounts with whole-rupee ".00" dropped, for readable expectations; parity checks stay exact
nbuy(){ buy "$@" | sed -E 's/\.00(\/|$)/\1/g'; }
adm(){ q "$1" "select t11.admin(\$s\$$2\$s\$${3:+, '$3'})"; }
quote(){ q "$1" "select t.run('anon', null, \$s\$select public.get_shipping_quote($2)::text\$s\$)"; }
I1='[{"type":"variant","variant_id":"00000000-0000-0000-0000-00000000000a","quantity":1}]'
I2='[{"type":"variant","variant_id":"00000000-0000-0000-0000-00000000000a","quantity":2}]'

[ "$(tail -n +2 /proc/net/route | wc -l)" = "0" ] || { echo "NETWORK PRESENT: STOP"; exit 9; }
echo "server: $(q postgres 'select version()' | cut -c1-60)"
echo "network routes: 0; .env visible: $(ls -a /sql | grep -c '^\.env'); credential-like env vars: $(env | grep -ciE 'supabase|razorpay|resend|database_url')"
echo "md5 11_shipping $(md5sum < $M | cut -c1-32); verify $(md5sum < $VER | cut -c1-32); rollback $(md5sum < $RB | cut -c1-32)"
md5sum $R/*.sql $V/*.sql $T10/*.sql $T/*.sql > $W/before.md5

q postgres "create database base" >/dev/null; su base -f $F/prelude.sql >/dev/null 2>$W/e || { cat $W/e; exit 1; }
for f in 01_schema 02_auth_functions_rls 08_checkout_hardening; do ow base -f $R/$f.sql >$W/o 2>&1 || { echo "FAILED $f"; tail -3 $W/o; exit 1; }; done
su base -f $F/harness.sql >/dev/null 2>$W/e || { cat $W/e; exit 1; }
su base -f $T/tests/fixtures/harness11.sql >/dev/null 2>$W/e || { cat $W/e; exit 1; }
su base -f $F/seed.sql >/dev/null 2>$W/e || { cat $W/e; exit 1; }
em base $M9 >/dev/null 2>$W/e || { echo "09 v2 FAILED"; cat $W/e; exit 1; }
newdb b9 base
em base $M10 >/dev/null 2>$W/e || { echo "10 FAILED"; cat $W/e; exit 1; }
newdb b10 base
q b10 "select t.snap()" >/dev/null

echo "=== 0. baseline and installation ==="
ck "T0.1 PostgreSQL is 17.11" "$(q postgres 'show server_version')" "17.11*"
ck "T0.2 starting fingerprints are steps 08 to 10" "$(fps b10)" "$FP8 $FPC $FPM $FPG"
stops "T0.3 refuses without Migration 10" b9 $M "*Migration 10 is not applied*"
stops "T0.4 verify before the migration stops with its plain message" b10 $VER "*Migration 11 is not applied, so nothing was verified. No data was changed.*"
newdb b11 b10
RF=$(q b11 "select pg_relation_filenode('public.orders')"); UP=$(q b11 "select max(updated_at) from public.orders")
OUT=$(em b11 $M 2>&1); ck "T0.5 clean install as one request" "$?" "0"
stops "T0.6 second run stops" b11 $M "*step 11 appears to be applied already*"
ck "T0.7 new checkout fingerprints, payment functions untouched" "$(fps b11)" "$FP11 $FP11C $FPM $FPG"
V1=$(emro b11 $VER 2>&1); ck "T0.8 verify runs read-only, no false rows" "$(echo "$V1" | grep -c '|')/$(echo "$V1" | falses | wc -l)" "1[0-9]/0"
echo "$V1" | awk -F'|' '$3==""{print "    " $2}'
ck "T0.8b open decisions are reported as not decided" "$(echo "$V1" | grep -c 'decision = NOT DECIDED')" "2"
newdb b11s b10; OUT=$(ow b11s -f $M 2>&1); ck "T0.9 clean install statement by statement" "$?" "0"
ck "T0.10 no rewrite of orders" "$(q b11 "select pg_relation_filenode('public.orders')")" "$RF"
ck "T0.11 existing orders identical apart from the two new empty columns" "$(q b11 "select count(*) filter (where (to_jsonb(o) - array['shipping_pincode','shipping_rate']) = b.j and o.xmin::text = b.x and o.shipping_pincode is null and o.shipping_rate is null) || '/' || count(*) from public.orders o join t.b_orders b on b.id = o.id")" "$(q b10 'select count(*) from public.orders')/$(q b10 'select count(*) from public.orders')"
ck "T0.12 updated_at unchanged" "$(q b11 "select max(updated_at) from public.orders")" "$UP"
ck "T0.13 starts in legacy mode with nothing decided and no rates" "$(q b11 "select mode||'/'||coalesce(fallback_allowed::text,'-')||'/'||coalesce(free_shipping_rule,'-')||'/'||(select count(*) from public.shipping_pincodes)||'/'||(select count(*) from public.shipping_zones) from public.shipping_config")" "legacy/-/-/0/0"
# same10 compares whole order rows, which T0.11 already covers without the new columns
S10=$(q b11 'select t.same10()' | sed -E 's/^orders [0-9]+\/[0-9]+ *//; s/ +$//')
ck "T0.14 coupons, catalogue and settings unchanged" "${S10:-same}" "same"

echo "=== 1. legacy mode: prices identical to steps 08 and 09 v2 ==="
newdb l10 b10; newdb l11 b11
CASES=(
  "place_order|$I1|"
  "place_order|$I2|"
  "place_order|[{\"type\":\"variant\",\"variant_id\":\"00000000-0000-0000-0000-00000000000c\",\"quantity\":1}]|"
  "place_order|[{\"type\":\"variant\",\"variant_id\":\"00000000-0000-0000-0000-00000000000b\",\"quantity\":1}]|"
  "place_order|[{\"type\":\"combo\",\"combo_id\":\"00000000-0000-0000-0000-0000000000d1\",\"quantity\":1}]|"
  "place_order|$I1|TEN"
  "place_order|[{\"type\":\"variant\",\"variant_id\":\"00000000-0000-0000-0000-00000000000c\",\"quantity\":1}]|SEED"
  "place_order_core|$I1|"
  "place_order_core|$I2|TEN"
  "place_order_core|[{\"type\":\"variant\",\"variant_id\":\"00000000-0000-0000-0000-00000000000b\",\"quantity\":1}]|"
)
SETTINGS=(
  "seeded 1500/99|"
  "3000/149.50|update public.store_settings set setting_value='\"3000\"' where setting_key='free_shipping_threshold'; update public.store_settings set setting_value='\"149.50\"' where setting_key='standard_shipping_fee'"
  "malformed values|update public.store_settings set setting_value='abc' where setting_key='free_shipping_threshold'; update public.store_settings set setting_value='' where setting_key='standard_shipping_fee'"
  "no settings rows|delete from public.store_settings where setting_key in ('free_shipping_threshold','standard_shipping_fee')"
)
n=0
for s in "${SETTINGS[@]}"; do
  label=${s%%|*}; sql=${s#*|}
  [ -n "$sql" ] && { q l10 "$sql" >/dev/null; q l11 "$sql" >/dev/null; }
  for c in "${CASES[@]}"; do
    IFS='|' read -r fn items coupon <<< "$c"; n=$((n+1))
    A=$(buy l10 $fn 516001 "$items" "$coupon"); B=$(buy l11 $fn 516001 "$items" "$coupon")
    ck "T1.$n [$label] $fn ${coupon:-no coupon}: same amounts ($A)" "$B" "$A"
  done
done
ck "T1.$((n+1)) every legacy case placed an order" "$(q l11 "select count(*) from public.orders where shipping_rate->>'source' = 'legacy'")" "$n"
ck "T1.$((n+2)) coupon counts identical" "$(q l11 "select string_agg(code||':'||used_count, ' ' order by code) from public.coupons")" "$(q l10 "select string_agg(code||':'||used_count, ' ' order by code) from public.coupons")"
ck "T1.$((n+3)) PIN code and legacy rule recorded on the order" "$(q l11 "select shipping_pincode||' '||(shipping_rate - 'amount')::text from public.orders where shipping_rate is not null limit 1")" '516001 {"source": "legacy"}'
ck "T1.$((n+4)) recorded amount equals the order's shipping" "$(q l11 "select count(*) from public.orders where shipping_rate is not null and (shipping_rate->>'amount')::numeric <> shipping_amount")" "0"
ck "T1.$((n+5)) legacy ignores the PIN code list" "$(nbuy l11 place_order 999999 "$I1")" "OK 1000/99/0/1099"
ck "T1.$((n+6)) legacy quote for visitors" "$(quote l11 "'516001', 1000")" 'OK {"ok": true, "mode": "legacy", "amount": 99, "message": null, "free_shipping_threshold": null}'

echo "=== 2. access ==="
newdb a1 b11
E2=00000000-0000-0000-0000-0000000000e2
ck "T2.1 visitors cannot read PIN codes" "$(q a1 "select t.run('anon', null, 'select count(*)::text from public.shipping_pincodes')")" "ERR 42501*"
ck "T2.2 visitors cannot read the config" "$(q a1 "select t.run('anon', null, 'select mode from public.shipping_config')")" "ERR 42501*"
ck "T2.3 visitors cannot call the internal rule" "$(q a1 "select t.run('anon', null, \$s\$select public.ps_shipping_quote('516001', 1)::text\$s\$)")" "ERR 42501*"
ck "T2.4 signed-in non-admin sees no PIN codes" "$(q a1 "select t.run('authenticated', '$E2', 'select count(*)::text from public.shipping_pincodes')")" "OK 0"
ck "T2.5 signed-in non-admin cannot add one" "$(adm a1 "insert into public.shipping_pincodes (pincode, charge) values ('516001', 1)" $E2)" "ERR 42501*row-level security*"
ck "T2.6 signed-in non-admin cannot change the mode" "$(adm a1 "update public.shipping_config set mode='pincode' where id" $E2)" "OK 0"
ck "T2.7 admin adds a zone" "$(adm a1 "insert into public.shipping_zones (name, charge) values ('Test zone', 1)")" "OK 1"
ck "T2.8 admin adds a PIN code" "$(adm a1 "insert into public.shipping_pincodes (pincode, charge) values ('516001', 2)")" "OK 1"
ck "T2.9 admin cannot add a second config row" "$(adm a1 "insert into public.shipping_config (id) values (true)")" "ERR 42501*"
ck "T2.10 admin cannot delete the config row" "$(adm a1 "delete from public.shipping_config where id")" "ERR 42501*"
ck "T2.11 the server role has no table access either" "$(q a1 "select t.run('service_role', null, 'select count(*)::text from public.shipping_pincodes')")" "ERR 42501*"

echo "=== 3. configuration rules ==="
newdb g1 b11
ck "T3.1 PIN code must be 6 digits, not starting with 0" "$(adm g1 "insert into public.shipping_pincodes (pincode, charge) values ('016001', 1)")" "ERR 23514*"
ck "T3.2 serviceable PIN code needs a charge or a zone" "$(adm g1 "insert into public.shipping_pincodes (pincode) values ('516001')")" "ERR 23514*shipping_pincodes_needs_charge*"
ck "T3.3 a not-serviceable PIN code needs no charge" "$(adm g1 "insert into public.shipping_pincodes (pincode, is_serviceable) values ('516003', false)")" "OK 1"
ck "T3.4 negative charge refused" "$(adm g1 "insert into public.shipping_pincodes (pincode, charge) values ('516009', -1)")" "ERR 23514*"
ck "T3.5 pincode mode refused while nothing is decided" "$(adm g1 "update public.shipping_config set mode='pincode' where id")" "ERR 23514*shipping_config_pincode_mode_decided*"
ck "T3.6 fallback allowed needs its charge" "$(adm g1 "update public.shipping_config set fallback_allowed=true where id")" "ERR 23514*shipping_config_fallback_needs_charge*"
ck "T3.7 free-shipping threshold needs its amount" "$(adm g1 "update public.shipping_config set free_shipping_rule='subtotal_threshold' where id")" "ERR 23514*shipping_config_threshold_needs_amount*"
ck "T3.8 decisions recorded, but no deliverable PIN code" "$(adm g1 "update public.shipping_config set fallback_allowed=false, free_shipping_rule='none', mode='pincode' where id")" "ERR *needs at least one active, serviceable PIN code*"
ck "T3.9 config unchanged after the refusals" "$(q g1 "select mode||'/'||coalesce(fallback_allowed::text,'-') from public.shipping_config")" "legacy/-"
adm g1 "insert into public.shipping_pincodes (pincode, charge) values ('516001', 120)" >/dev/null
ck "T3.10 with one deliverable PIN code, pincode mode starts" "$(adm g1 "update public.shipping_config set fallback_allowed=false, free_shipping_rule='none', mode='pincode' where id")" "OK 1"
ck "T3.11 deactivating the last deliverable PIN code is refused" "$(adm g1 "update public.shipping_pincodes set is_active=false where pincode='516001'")" "ERR *would leave no PIN code*"
ck "T3.12 deleting it is refused" "$(adm g1 "delete from public.shipping_pincodes where pincode='516001'")" "ERR *would leave no PIN code*"
ck "T3.13 marking it not serviceable is refused" "$(adm g1 "update public.shipping_pincodes set is_serviceable=false where pincode='516001'")" "ERR *would leave no PIN code*"
ck "T3.14 back to the standard rule is always allowed" "$(adm g1 "update public.shipping_config set mode='legacy' where id")" "OK 1"
ck "T3.15 then the PIN code can be removed" "$(adm g1 "delete from public.shipping_pincodes where pincode='516001'")" "OK 1"
ck "T3.16 a zone with PIN codes cannot be deleted" "$(adm g1 "insert into public.shipping_zones (id, name, charge) values ('00000000-0000-0000-0000-00000000c0a1','Zone A', 80)")/$(adm g1 "insert into public.shipping_pincodes (pincode, zone_id) values ('516002','00000000-0000-0000-0000-00000000c0a1')")/$(adm g1 "delete from public.shipping_zones where name='Zone A'")" "OK 1/OK 1/ERR 23503*"
ck "T3.17 zone names are unique, ignoring case" "$(adm g1 "insert into public.shipping_zones (name, charge) values (' zone a ', 1)")" "ERR 23505*"

echo "=== 4. pincode mode: pricing ==="
newdb p1 b11
ZA=00000000-0000-0000-0000-00000000c0a1; ZB=00000000-0000-0000-0000-00000000c0b1
adm p1 "insert into public.shipping_zones (id, name, charge) values ('$ZA','Zone A', 80), ('$ZB','Zone B', 60)" >/dev/null
adm p1 "insert into public.shipping_pincodes (pincode, charge, zone_id, is_serviceable, is_active) values ('516001', 120, null, true, true), ('516002', null, '$ZA', true, true), ('516003', null, null, false, true), ('516004', 50, null, true, false), ('516005', null, '$ZB', true, true), ('516006', 45, '$ZA', true, true)" >/dev/null
adm p1 "update public.shipping_zones set is_active=false where name='Zone B'" >/dev/null
ck "T4.0 pincode mode on" "$(adm p1 "update public.shipping_config set fallback_allowed=false, free_shipping_rule='none', mode='pincode' where id")" "OK 1"
ck "T4.1 own charge (COD)" "$(nbuy p1 place_order 516001 "$I1")" "OK 1000/120/0/1120"
ck "T4.2 zone charge (COD)" "$(nbuy p1 place_order 516002 "$I1")" "OK 1000/80/0/1080"
ck "T4.3 own charge wins over its zone" "$(nbuy p1 place_order 516006 "$I1")" "OK 1000/45/0/1045"
ck "T4.4 not serviceable: clear refusal" "$(nbuy p1 place_order 516003 "$I1")" "ERR P0001 Sorry, we do not deliver to PIN code 516003. Please check the PIN code, or contact us for help."
ck "T4.5 inactive row is ignored: refused without a fallback" "$(nbuy p1 place_order 516004 "$I1")" "ERR P0001 Sorry, we do not deliver to PIN code 516004 yet.*"
ck "T4.6 zone switched off: refused" "$(nbuy p1 place_order 516005 "$I1")" "ERR P0001 Sorry, we do not deliver to PIN code 516005 yet.*"
ck "T4.7 unlisted, no fallback: refused" "$(nbuy p1 place_order 560001 "$I1")" "ERR P0001 Sorry, we do not deliver to PIN code 560001 yet.*"
ck "T4.8 Razorpay prices the same way" "$(nbuy p1 place_order_core 516001 "$I1")/$(nbuy p1 place_order_core 516002 "$I1")" "OK 1000/120/0/1120/OK 1000/80/0/1080"
ck "T4.9 Razorpay refuses the same PIN codes" "$(nbuy p1 place_order_core 516003 "$I1")" "ERR P0001 Sorry, we do not deliver to PIN code 516003.*"
ck "T4.10 coupon unchanged by shipping (TEN on 1000)" "$(nbuy p1 place_order 516001 "$I1" TEN)" "OK 1000/120/100/1020"
ck "T4.11 Razorpay coupon unchanged too" "$(nbuy p1 place_order_core 516002 "$I1" TEN)" "OK 1000/80/100/980"
ck "T4.12 shipping sent by the browser is ignored" "$(nbuy p1 place_order 516001 "$I1" '' '' '{"shipping_amount":0,"shipping":0,"shipping_fee":0,"total":1}')" "OK 1000/120/0/1120"
ck "T4.13 refused order saves nothing" "$(q p1 "select count(*) from public.orders where shipping_pincode in ('516003','516004','516005','560001')")" "0"
ck "T4.14 rule recorded with the order" "$(q p1 "select shipping_rate->>'source'||'/'||(shipping_rate->>'zone_name')||'/'||(shipping_rate->>'base_charge') from public.orders where shipping_pincode='516002' limit 1")" "zone/Zone A/80.00"
ck "T4.15 rate reference recorded" "$(q p1 "select count(*) from public.orders o join public.shipping_pincodes p on p.id = (o.shipping_rate->>'pincode_rate_id')::uuid where o.shipping_pincode = p.pincode")" "[1-9]*"
adm p1 "update public.shipping_config set fallback_allowed=true, fallback_charge=150 where id" >/dev/null
ck "T4.16 approved fallback prices unlisted PIN codes" "$(nbuy p1 place_order 560001 "$I1")" "OK 1000/150/0/1150"
ck "T4.17 fallback also covers an inactive row" "$(nbuy p1 place_order 516004 "$I1")" "OK 1000/150/0/1150"
ck "T4.18 fallback never overrides 'not serviceable'" "$(nbuy p1 place_order 516003 "$I1")" "ERR P0001 Sorry, we do not deliver to PIN code 516003.*"
ck "T4.19 fallback recorded as such" "$(q p1 "select shipping_rate->>'source' from public.orders where shipping_pincode='560001' limit 1")" "fallback"
adm p1 "update public.shipping_config set free_shipping_rule='subtotal_threshold', free_shipping_threshold=2000 where id" >/dev/null
ck "T4.20 free shipping at the threshold" "$(nbuy p1 place_order 516001 "$I2")" "OK 2000/0/0/2000"
ck "T4.21 below the threshold it is charged" "$(nbuy p1 place_order 516001 "$I1")" "OK 1000/120/0/1120"
ck "T4.22 threshold uses the item total before the coupon, as the legacy rule does" "$(nbuy p1 place_order 516001 "$I2" TEN)" "OK 2000/0/200/1800"
ck "T4.23 free shipping recorded" "$(q p1 "select (shipping_rate->>'free_shipping_applied')||'/'||(shipping_rate->>'base_charge') from public.orders where total_amount=2000 and shipping_pincode='516001' limit 1")" "true/120.00"
K=e0000000-0000-0000-0000-000000000001
buy p1 place_order 516002 "$I1" '' $K >/dev/null
adm p1 "update public.shipping_zones set charge=300 where name='Zone A'" >/dev/null
ck "T4.24 retry of a saved attempt keeps its price after a rate change" "$(q p1 "select t.run('anon', null, format('select (x->>%L)||''/''||(x->>%L) from (select public.place_order(%L::jsonb,%L::jsonb,null,%L,%L::uuid) x) s', 'total_amount', 'replayed', t11.cust('516002'), '$I1', 'COD', '$K'))")" "OK 1080.00/true"
ck "T4.25 a new order uses the new rate" "$(nbuy p1 place_order 516002 "$I1")" "OK 1000/300/0/1300"

echo "=== 5. the checkout page's quote ==="
ck "T5.1 quote matches the order" "$(quote p1 "'516002', 1000")" '*"ok": true*"amount": 300*'
ck "T5.2 quote shows no rate rows, ids or zone names" "$(quote p1 "'516002', 1000" | grep -cE 'zone|rate_id|base_charge|source')" "0"
ck "T5.3 no PIN code yet: asks for one" "$(quote p1 "null, 1000")" '*"ok": false*"mode": "pincode"*"needs_pincode": true*'
ck "T5.4 refused PIN code: the shopper's message" "$(quote p1 "'516003', 1000")" '*"ok": false*"message": "Sorry, we do not deliver to PIN code 516003.*'
ck "T5.5 malformed PIN code" "$(quote p1 "'51600', 1000")" '*"ok": false*"message": "Please enter a valid 6-digit PIN code."*'
ck "T5.6 free-shipping threshold shown for the bag" "$(quote p1 "'516001', 2500")" '*"amount": 0*"free_shipping_threshold": 2000*'
ck "T5.7 absurd subtotal from the page is bounded and harmless" "$(quote p1 "'516001', -5")" '*"amount": 120*'

echo "=== 6. payments still work on shipping-priced orders ==="
sv(){ psql -X -q -U checker -d "$1" -A -t -F '|' -v ON_ERROR_STOP=1 -c "set role service_role; $2" 2>&1; }
# Saves a Razorpay order at <pin> and links it to <razorpay order id>
rzo(){ buy p1 place_order_core "$1" "$I1" '' "$2" >/dev/null
  q p1 "select t.run('service_role', null, format('select public.attach_razorpay_order((select id from public.orders where idempotency_key=%L),%L)', '$2', '$3'))" >/dev/null; }
rzo 516001 e0000000-0000-0000-0000-0000000000f1 order_SH1
ck "T6.1 paid with shipping in the amount (1000 + 120)" "$(sv p1 "select public.finalize_payment_and_enqueue('order_SH1','pay_SH1',112000)->>'result'")" "paid"
rzo 516002 e0000000-0000-0000-0000-0000000000f2 order_SH2
ck "T6.2 an amount without the shipping is a mismatch" "$(sv p1 "select public.finalize_payment_and_enqueue('order_SH2','pay_SH2',100000)->>'result'")" "amount_mismatch"

echo "=== 7. rollback ==="
newdb r1 p1
stops "T7.1 rollback refuses while pincode mode is on, unless confirmed" r1 $RB "*PIN code shipping is on*"
sed 's/^-- set local ps.confirm_return_to_legacy_shipping/set local ps.confirm_return_to_legacy_shipping/' $RB > $W/rbc.sql
OUT=$(em r1 $W/rbc.sql 2>&1); ck "T7.2 confirmed rollback" "$?" "0"
ck "T7.3 steps 08 and 09 v2 functions restored exactly" "$(fps r1)" "$FP8 $FPC $FPM $FPG"
ck "T7.4 shipping functions removed" "$(q r1 "select count(*) from pg_proc where pronamespace='public'::regnamespace and proname in ('ps_shipping_quote','get_shipping_quote','ps_shipping_ready','ps_shipping_config_guard','ps_shipping_rates_guard')")" "0"
ck "T7.5 rates, zones and config kept" "$(q r1 "select (select count(*) from public.shipping_pincodes)||'/'||(select count(*) from public.shipping_zones)||'/'||(select mode from public.shipping_config)")" "6/2/pincode"
ck "T7.6 orders keep their shipping record" "$(q r1 "select count(*) from public.orders where shipping_rate is not null")" "$(q p1 "select count(*) from public.orders where shipping_rate is not null")"
ck "T7.7 checkout prices by the legacy rule again" "$(nbuy r1 place_order 516003 "$I1")" "OK 1000/99/0/1099"
ck "T7.8 Migration 10 verify is clean again" "$(emro r1 $VER10 2>&1 | falses | wc -l)" "0"
newdb r2 b11
OUT=$(em r2 $RB 2>&1); ck "T7.9 rollback in legacy mode needs no confirmation" "$?" "0"
ck "T7.10 reapply after the rollback" "$(em r1 $M >/dev/null 2>&1; echo $?)/$(fps r1)" "0/$FP11 $FP11C $FPM $FPG"
ck "T7.11 reapplied: owner's rates and mode still there" "$(nbuy r1 place_order 516001 "$I1")" "OK 1000/120/0/1120"
stops "T7.12 09 v2 rollback refuses while step 11 is applied" b11 $RB9 "*place_order differs from step 08*"
ck "T7.13 Migration 10 verify reports the replaced functions (documented)" "$(emro b11 $VER10 2>&1 | falses | grep -c 'place_order')" "[1-9]*"

echo "=== RESULTS ==="
echo "  pass $PASS, fail $FAIL"
for f in "${FAILS[@]}"; do echo "FAIL | $f" | cut -c1-210; done
echo "SQL files changed during run: $(md5sum -c $W/before.md5 2>/dev/null | grep -vc ': OK$')"
exit $FAIL
