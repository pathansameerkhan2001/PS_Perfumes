#!/bin/bash
# Migration 12 tests. Runs INSIDE a disposable postgres:17.11 container with no network, over the
# local socket only. Every category and product here is a test fixture, not catalogue data.
R=/sql; V=/sql/proposed-09-v2; T10=/sql/proposed-10-outbox; T=/sql/proposed-12-categories; F=$T10/tests/fixtures; W=/tmp/w; mkdir -p $W
M=$T/12_categories.sql; PRE=$T/12_precheck_readonly.sql; VER=$T/12_verify_readonly.sql; RB=$T/12_rollback.sql
M9=$V/09v2_razorpay_payments.sql; M10=$T10/10_outbox.sql
export PGCLIENTENCODING=UTF8 PGHOST=/var/run/postgresql
FP8=f58df5ff55e84e958d1e27336cd82f6e; FPC=11e685594045be8687ee025bcba72c8c
FPM=ae7666b99cc00a000ebe74611c4e1f24; FPG=acfa79d5e0d9f1f6adabc914cb1ba7fe
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
# Everything the migration must not change, and the placement it must change
keep(){ q "$1" "select concat_ws(' ', t12.products(), t12.other_data(), t12.functions(), t12.policies(), t12.grants())"; }
anon(){ q "$1" "select t.run('anon', null, \$s\$$2\$s\$)"; }
own(){ q "$1" "select t.run('postgres', null, \$s\$$2\$s\$)"; }

[ "$(tail -n +2 /proc/net/route | wc -l)" = "0" ] || { echo "NETWORK PRESENT: STOP"; exit 9; }
echo "server: $(q postgres 'select version()' | cut -c1-60)"
echo "network routes: 0; .env visible: $(ls -a /sql | grep -c '^\.env'); credential-like env vars: $(env | grep -ciE 'supabase|razorpay|resend|database_url')"
echo "md5 12_categories $(md5sum < $M | cut -c1-32); precheck $(md5sum < $PRE | cut -c1-32); verify $(md5sum < $VER | cut -c1-32); rollback $(md5sum < $RB | cut -c1-32)"
md5sum $R/*.sql $V/*.sql $T10/*.sql $T/*.sql > $W/before.md5

# Production's state: steps 01, 02, 07, 08, 09 v2 and 10
q postgres "create database base" >/dev/null; su base -f $F/prelude.sql >/dev/null 2>$W/e || { cat $W/e; exit 1; }
for f in 01_schema 02_auth_functions_rls 08_checkout_hardening; do ow base -f $R/$f.sql >$W/o 2>&1 || { echo "FAILED $f"; tail -3 $W/o; exit 1; }; done
su base -f $F/harness.sql >/dev/null 2>$W/e || { cat $W/e; exit 1; }
su base -f $F/seed.sql >/dev/null 2>$W/e || { cat $W/e; exit 1; }
em base $M9 >/dev/null 2>$W/e || { echo "09 v2 FAILED"; cat $W/e; exit 1; }
em base $M10 >/dev/null 2>$W/e || { echo "10 FAILED"; cat $W/e; exit 1; }
ow base -f $R/07_seed_categories.sql >$W/o 2>&1 || { echo "FAILED 07"; tail -3 $W/o; exit 1; }
su base -f $T/tests/fixtures/fixture12.sql >/dev/null 2>$W/e || { cat $W/e; exit 1; }
KEEP0=$(keep base); PLACE0=$(q base "select t12.placement()"); CATS0=$(q base "select t12.categories()")

echo "=== 0. baseline ==="
ck "T0.1 PostgreSQL is 17.11" "$(q postgres 'show server_version')" "17.11*"
ck "T0.2 starting fingerprints are steps 08 to 10" "$(fps base)" "$FP8 $FPC $FPM $FPG"
ck "T0.3 fixture: seven families, attars and sprays" "$(q base "select string_agg(slug, ',' order by slug) from public.categories")" "attar,attars,bakhoor,floral,musky,oud,perfume,sprays,woody"

echo "=== 1. precheck ==="
newdb b1 base
OUT=$(emro b1 $PRE 2>&1); ck "T1.1 precheck runs read-only" "$?" "0"
ck "T1.2 precheck: no false rows" "$(echo "$OUT" | falses)" ""
ck "T1.3 precheck lists the adopted slugs" "$(echo "$OUT" | grep 'will be adopted')" "*attars (Attars), bakhoor (Bakhoor)*"
ck "T1.4 precheck move plan: one musky product" "$(echo "$OUT" | grep 'musky → musk-attars')" "*|1 product(s)"
stops "T1.5 verify before the migration stops with its plain message" b1 $VER "*Migration 12 is not applied, so nothing was verified. No data was changed.*"

echo "=== 2. installation ==="
ck "T2.1 migration as one request" "$(em b1 $M 2>&1; echo rc=$?)" "rc=0"
stops "T2.2 second run stops" b1 $M "*step 12 appears to be applied already*"
ck "T2.3 everything outside placement unchanged" "$(keep b1)" "$KEEP0"
ck "T2.4 payment and checkout fingerprints unchanged" "$(fps b1)" "$FP8 $FPC $FPM $FPG"
OUT=$(emro b1 $VER 2>&1); ck "T2.5 verify runs read-only" "$?" "0"
ck "T2.6 verify: no false rows" "$(echo "$OUT" | falses)" ""
newdb b2 base
ck "T2.7 migration statement by statement" "$(ow b2 -f $M 2>&1; echo rc=$?)" "rc=0"
ck "T2.8 both installs give the same placement" "$(q b2 "select string_agg(slug || '=' || t12.cat(slug), ',' order by slug) from public.products")" "$(q b1 "select string_agg(slug || '=' || t12.cat(slug), ',' order by slug) from public.products")"

echo "=== 3. tree and moves ==="
ck "T3.1 main categories in order" "$(q b1 "select string_agg(slug, ',' order by display_order) from public.categories where parent_id is null and is_active")" "sprays,perfumes,attars,home-fragrance,body-care"
ck "T3.2 subcategories of Attars" "$(q b1 "select string_agg(c.slug, ',' order by c.display_order) from public.categories c join public.categories p on p.id = c.parent_id where p.slug = 'attars'")" "arabic-attars,oud-attars,musk-attars,floral-attars,traditional-attars"
ck "T3.3 subcategory count" "$(q b1 "select count(*) from public.categories where parent_id is not null")" "14"
ck "T3.4 perfume → perfumes" "$(q b1 "select t12.cat('t12-perfume')")" "perfumes"
ck "T3.5 attar and woody → attars" "$(q b1 "select t12.cat('t12-attar') || ',' || t12.cat('t12-woody')")" "attars,attars"
ck "T3.6 musky, oud, floral → their attar subcategories" "$(q b1 "select t12.cat('t12-musky') || ',' || t12.cat('t12-oud') || ',' || t12.cat('t12-floral')")" "musk-attars,oud-attars,floral-attars"
ck "T3.7 bakhoor adopted: same row, same products, now under Home Fragrance" "$(q b1 "select t12.cat('t12-bakhoor') || ',' || p.slug from public.categories c join public.categories p on p.id = c.parent_id where c.slug = 'bakhoor'")" "bakhoor,home-fragrance"
ck "T3.8 existing attars row adopted as the main category" "$(q b1 "select count(*) || ',' || bool_and(id = '00000000-0000-0000-0000-0000000000c1') from public.categories where slug = 'attars'")" "1,true"
ck "T3.9 uncategorised and other products stay where they are" "$(q b1 "select t12.cat('t12-none') || ',' || t12.cat('rose')")" "-,sprays"
ck "T3.10 the six retired families are inactive and empty" "$(q b1 "select count(*) filter (where not is_active) || '/' || count(*) || '/' || (select count(*) from public.products p where p.category_id in (select id from public.categories where slug in ('perfume','attar','woody','musky','oud','floral'))) from public.categories where slug in ('perfume','attar','woody','musky','oud','floral')")" "6/6/0"
ck "T3.11 no category deleted" "$(q b1 "select count(*) from public.categories where slug in ('perfume','attar','woody','musky','oud','floral','bakhoor','sprays')")" "8"
ck "T3.12 log: moves match the products" "$(q b1 "select count(*) from public.category_migration_12_log where action = 'moved'")" "6"

echo "=== 4. guards ==="
ck "T4.1 a category with products cannot be deleted" "$(own b1 "delete from public.categories where slug = 'musk-attars' returning slug")" "ERR P0001 This category has 1 product(s)*"
ck "T4.2 a main category with subcategories cannot be deleted" "$(own b1 "delete from public.categories where slug = 'body-care' returning slug")" "ERR 23503*"
ck "T4.3 a subcategory cannot contain subcategories" "$(own b1 "insert into public.categories (name, slug, parent_id) select 'X', 'x', id from public.categories where slug = 'oud-attars'")" "ERR P0001 A subcategory cannot contain subcategories*"
ck "T4.4 a main category with subcategories cannot become a subcategory" "$(own b1 "update public.categories set parent_id = (select id from public.categories where slug = 'sprays') where slug = 'perfumes'")" "ERR P0001 This category has subcategories*"
ck "T4.5 a category cannot be its own parent" "$(own b1 "update public.categories set parent_id = id where slug = 'sprays'")" "ERR 23514*"
newdb b4 b1
ck "T4.6 an empty subcategory can be deleted" "$(own b4 "delete from public.categories where slug = 'body-cream' returning slug")" "OK body-cream"
ck "T4.7 a new subcategory can be added under a main category" "$(own b4 "insert into public.categories (name, slug, parent_id) select 'Niche', 'niche', id from public.categories where slug = 'perfumes' returning slug")" "OK niche"
ck "T4.8 deleting a product is unaffected" "$(own b4 "delete from public.products where slug = 't12-none' returning slug")" "OK t12-none"

echo "=== 5. visitors ==="
ck "T5.1 visitors read active categories with parent_id" "$(anon b1 "select count(*) filter (where parent_id is not null) || '/' || count(*) from public.categories")" "OK 14/19"
ck "T5.2 visitors do not see the retired families" "$(anon b1 "select count(*) from public.categories where slug in ('perfume','attar','musky')")" "OK 0"
ck "T5.3 visitors cannot read the migration log" "$(anon b1 "select count(*) from public.category_migration_12_log")" "ERR 42501*"
ck "T5.4 visitors cannot add a category" "$(anon b1 "insert into public.categories (name, slug) values ('x', 'x') returning slug")" "ERR 42501*"
ck "T5.5 service_role cannot read the migration log" "$(q b1 "select t.run('service_role', null, 'select count(*) from public.category_migration_12_log')")" "ERR 42501*"

echo "=== 6. rollback ==="
newdb b6 b1
ck "T6.1 rollback as one request" "$(em b6 $RB 2>&1; echo rc=$?)" "rc=0"
ck "T6.2 every product back in its family" "$(q b6 "select t12.placement()")" "$PLACE0"
ck "T6.3 categories exactly as before" "$(q b6 "select t12.categories()")" "$CATS0"
ck "T6.4 everything else unchanged" "$(keep b6)" "$KEEP0"
ck "T6.5 parent_id, guards and log removed" "$(q b6 "select (select count(*) from pg_attribute where attrelid = 'public.categories'::regclass and attname = 'parent_id' and not attisdropped) || ',' || coalesce(to_regclass('public.category_migration_12_log')::text, '-') || ',' || coalesce(to_regprocedure('public.ps_categories_delete_guard()')::text, '-')")" "0,-,-"
stops "T6.6 second rollback stops" b6 $RB "*Step 12 is not applied, or was already rolled back*"
ck "T6.7 reinstall after rollback" "$(em b6 $M 2>&1; echo rc=$?)" "rc=0"
ck "T6.8 reinstall gives the same placement by slug" "$(q b6 "select string_agg(slug || '=' || t12.cat(slug), ',' order by slug) from public.products")" "$(q b1 "select string_agg(slug || '=' || t12.cat(slug), ',' order by slug) from public.products")"
ck "T6.9 verify after reinstall: no false rows" "$(emro b6 $VER 2>&1 | falses)" ""

newdb b7 b1
q b7 "update public.products set category_id = (select id from public.categories where slug = 'luxury-perfumes') where slug = 't12-none'" >/dev/null
stops "T6.10 stops when a product was later put in a new category" b7 $RB "*were placed in a new category after the migration: T12 none*"
ck "T6.11 that stop changed nothing" "$(q b7 "select count(*) from public.categories where parent_id is not null")" "14"
newdb b8 b1
q b8 "insert into public.categories (name, slug, parent_id) select 'Niche', 'niche', id from public.categories where slug = 'perfumes'" >/dev/null
stops "T6.12 stops when a subcategory was made later" b8 $RB "*subcategories were made after the migration: Niche*"
newdb b9 b1
q b9 "update public.products set category_id = (select id from public.categories where slug = 'sprays') where slug = 't12-musky'" >/dev/null
ck "T6.13 rollback with a later move to an older category" "$(em b9 $RB 2>&1; echo rc=$?)" "rc=0"
ck "T6.14 that later choice is kept, the rest restored" "$(q b9 "select t12.cat('t12-musky') || ',' || t12.cat('t12-oud') || ',' || t12.cat('t12-perfume')")" "sprays,oud,perfume"

echo "=== 7. locking ==="
newdb b10 base
psql -U checker -d b10 -q -c "begin; lock table public.categories in access exclusive mode; select pg_sleep(9); commit;" >/dev/null 2>&1 &
HOLD=$!; sleep 1
S=$(date +%s); OUT=$(em b10 $M 2>&1); RC=$?; E=$(( $(date +%s) - S ))
ck "T7.1 a held lock makes the migration give up" "rc=$RC $OUT" "rc=[1-9]*lock timeout*"
ck "T7.2 it gives up within lock_timeout" "$([ $E -le 7 ] && echo ok || echo "${E}s")" "ok"
wait $HOLD
ck "T7.3 nothing changed" "$(q b10 "select t12.placement() || t12.categories()")" "$PLACE0$CATS0"
ck "T7.4 it runs once the lock is gone" "$(em b10 $M 2>&1; echo rc=$?)" "rc=0"

echo "=== 8. end ==="
ck "T8.1 fingerprints at the end" "$(fps b1) $(fps b6) $(fps b9)" "$FP8 $FPC $FPM $FPG $FP8 $FPC $FPM $FPG $FP8 $FPC $FPM $FPG"

echo "=== RESULTS ==="
echo "  pass $PASS, fail $FAIL"
for f in "${FAILS[@]}"; do echo "  FAILED: $f" | cut -c1-300; done
md5sum $R/*.sql $V/*.sql $T10/*.sql $T/*.sql > $W/after.md5
echo "SQL files changed during run: $(diff $W/before.md5 $W/after.md5 | grep -c '^>')"
echo "server log deadlocks: $(grep -ci deadlock /proc/1/fd/2 2>/dev/null || echo 0)"
[ $FAIL -eq 0 ]
