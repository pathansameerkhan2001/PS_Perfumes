#!/bin/bash
# Runs inside the disposable Postgres container: builds the schema from the real migration files.
set -e
R=/sql; F=/sql/proposed-10-outbox/tests/fixtures
export PGHOST=/var/run/postgresql
su(){ psql -X -q -U checker -d apitest -v ON_ERROR_STOP=1 "$@" >/dev/null; }
ow(){ psql -X -q -U postgres -d apitest -v ON_ERROR_STOP=1 "$@" >/dev/null; }

psql -X -q -U checker -d postgres -c 'create database apitest'
su -f $F/prelude.sql
ow -f $R/01_schema.sql
ow -f $R/02_auth_functions_rls.sql
ow -f $R/08_checkout_hardening.sql
su -f $F/harness.sql
su -f $F/seed.sql
ow -f $R/proposed-09-v2/09v2_razorpay_payments.sql
# Production today: Migrations 08 and 09 v2 only, served by a second PostgREST
psql -X -q -U checker -d postgres -c 'create database apitestprod template apitest'
ow -f $R/proposed-10-outbox/10_outbox.sql
su -f /fx/api_harness.sql
# The recovery target: 08 + 09 v2 + 10, no 11, served by a third PostgREST
psql -X -q -U checker -d postgres -c 'create database apitesttarget template apitest'
ow -f $R/proposed-11-shipping/11_shipping.sql
su -f /fx/api_harness_11.sql
echo "database ready"
