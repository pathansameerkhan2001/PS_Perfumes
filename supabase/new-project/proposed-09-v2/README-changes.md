# Migration 09 v2: proposed revision

**Status: passed 312 of 312 checks on a disposable PostgreSQL 17.11 container. Not applied to production.** Raw output: `test-results-pg17.txt`. The original `../09_razorpay_payments.sql` is unchanged.

Tested MD5s:

| File | MD5 |
|---|---|
| `09v2_razorpay_payments.sql` | `5d807a61da0fb149f49fdce737dc919f` |
| `09v2_rollback.sql` | `1399cf8b55adcc6be7a5f5e861be6def` |
| `09v2_precheck_readonly.sql` | `2caf6b05512379515b3177aae7abf357` |
| `09v2_verify_readonly.sql` | `daa3ff33cd6410c97009091ee544c029` |

The `NOT TESTED` lines in the SQL headers are out of date. They were left unchanged so these MD5s still match the tested files.

Nothing in this folder enables payments. The API, frontend and `RAZORPAY_NEW_ORDERS_DISABLED` are not affected, and v2 needs no code change or deployment.

## Files

| File | Purpose | Writes? |
|---|---|---|
| `09v2_precheck_readonly.sql` | Run before the migration; save the counts | No |
| `09v2_razorpay_payments.sql` | The migration | Yes |
| `09v2_verify_readonly.sql` | Superseded for production by `../proposed-09-v2-r1/09v2r1_verify_readonly.sql`, which gives the same results. **Never run a verification script before the migration** | No |
| `09v2_rollback.sql` | Stage 3 rollback, after reconciliation | Yes |

These existing files work with v2 unchanged: `09_reconciliation_readonly.sql`, `09_rollback_preflight_readonly.sql`, `09_rollback_postcheck_readonly.sql` and `09_rollback_cleanup_optional.sql`.

## Changes from the original

### 1. `place_order` is no longer replaced (the main change)

The original rewrote the public COD function into a wrapper around a shared `place_order_core`. V2 does not touch `place_order`, so the Migration 08 function stays byte-identical.

- `place_order_core` now accepts Razorpay only. Its name and arguments are the same, so `/api/create-order` needs no change.
- Its COD coupon-counting branch is removed.
- COD stays public and COD-only: `place_order` already rejects every other method.
- **Cost:** pricing logic now exists in two functions. A future pricing change must be made in both.

### 2. No table rewrite

The original added `receipt_token uuid not null default gen_random_uuid()`. A volatile default rewrites every row under an exclusive lock.

V2 adds the column as nullable, then sets the default in a separate step. Only new rows receive a token, so **no existing row is written** and `updated_at` does not move.

- Existing COD orders keep `receipt_token` NULL. Receipts exist only for paid orders, so they lose nothing.
- The column is no longer `NOT NULL`. `09v2_verify_readonly.sql` checks that every Razorpay order has a token.
- `orders_receipt_token_key` is now a partial index that skips NULLs. It keeps the same name.

### 3. Lock handling

| Original | v2 |
|---|---|
| No timeout: could queue checkouts behind a blocked lock | `lock_timeout = 5s`, `statement_timeout = 60s`: fails cleanly and can be rerun |
| Preflight ran before the table was locked | `orders` is locked first, so the preflight result cannot go stale |

### 4. Stricter stops

- **New:** the migration stops if live `place_order` does not match the Migration 08 fingerprint `f58df5ff…`.
- **Broader:** on a first run it stops if any non-COD order exists, except a cancelled unpaid Razorpay order, which is what the optional cleanup leaves behind. The original stopped only on paid or refunded Razorpay orders. Nothing is deleted or edited; the migration simply waits for a review.

### 5. Post-conditions inside the transaction

Before committing, v2 checks that `place_order` is unchanged, visitors can still run it, and all eight server functions are `service_role` only. A failure undoes everything.

### 6. Shorter rollback

`09v2_rollback.sql` is 125 lines instead of 473, because it has no function to restore. It stops if `place_order` differs from Migration 08, which also protects against using it with the original migration. Cancellation, the 60-minute quiet period, kept columns, kept trigger and kept receipts are the same as the original.

### 7. New read-only scripts

- **Pre-check:** Migration 08 state, existing payment records, long-running transactions, and counts to save.
- **Verify:** the fingerprint, row counts and order `updated_at`, plus the data checks that were a separate second query.

## What did not change

The guard and all seven server functions are byte-identical to the tested file (compared by script). All nine columns are still needed, because the API uses each of them, so none were removed.

## Locks

| Step | Lock on `orders` | Duration |
|---|---|---|
| `lock table`, add columns, set default | Access exclusive | Moments; no rewrite |
| Three unique indexes | Covered by the same lock | Short; the indexed columns are all empty |
| Create trigger | Covered by the same lock | Moments |
| Create functions | None | Moments |

Reads and writes on `orders` wait until commit. `CREATE INDEX CONCURRENTLY` cannot run inside a transaction and is not needed at this size.

## Remaining risks

1. **Local test only.** Supabase roles were emulated. PostgREST, the Vercel API, the SQL Editor and Razorpay were not part of the test.
2. **Small test data.** The table had 8 orders, so production timings may differ. No step rewrites the table.
3. **A backup is still required.** This revision reduces risk but does not replace a backup.
4. **Fingerprint stop.** If live `place_order` differs in any byte, the migration stops. That is safe, but it would need a review.
5. **Pricing duplication.** See change 1.
6. **Existing sessions.** `place_order` is not recompiled. A session opened before the migration replayed and placed COD orders correctly afterwards (Y16, Y17).
7. **Attempt keys.** `place_order` has no payment-method check on replay. The storefront uses separate keys per method, so this is not reachable through checkout. A hand-made request would need the key and the same e-mail, and would receive only that shopper's own order.
8. **Rollback relies on people.** SQL cannot prove reconciliation was finished.
9. **Docs.** `docs/KT/15` and `16` still describe the original. Update them if v2 is adopted.

## Backup without installing PostgreSQL

Docker is already on this PC, so PostgreSQL 17 tools can run from a temporary container, which is removed afterwards. Docker Desktop must be running, and the first run downloads the image. You will be prompted for the password; do not put it in the command.

```powershell
$Stamp = Get-Date -Format 'yyyyMMdd-HHmm'
$Out   = "E:\PS_Perfumes_Backups\pre-09-$Stamp"
New-Item -ItemType Directory -Force $Out | Out-Null

docker run --rm -it -e PGSSLMODE=require -v "${Out}:/backup" postgres:17 pg_dump `
  --host=<SESSION_POOLER_HOST> --port=5432 --username=postgres.pwacxxrghlglvdtclbig --dbname=postgres `
  --password --format=custom --file=/backup/ps_perfumes_full_$Stamp.dump
"Exit code: $LASTEXITCODE"

docker run --rm -v "${Out}:/backup" postgres:17 pg_restore --list /backup/ps_perfumes_full_$Stamp.dump
```

If Docker is not an option, use a backup shown under Supabase Dashboard → Database → Backups. Exporting `orders`, `order_items` and `customers` as CSV is a weaker fallback: it protects the data but not the schema, functions or policies.
