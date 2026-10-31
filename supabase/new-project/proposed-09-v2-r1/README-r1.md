# Migration 09 v2: incident review r1

**Status: proposed for review. Nothing here has run on production.**

## Finding

`ERROR: 42703: column "receipt_token" does not exist` at `LINE 113` comes from `09v2_verify_readonly.sql`, not from the migration. The verify script ran on a database where the migration had not been applied.

`09v2_razorpay_payments.sql` is not faulty and is **unchanged**: MD5 `5d807a61da0fb149f49fdce737dc919f`.

## Files

| File | Purpose |
|---|---|
| `09v2r1_verify_readonly.sql` | The v2 verify query plus a read-only check at the top. Run before the migration, it stops with a plain message instead of error 42703. Its result rows are identical to the v2 file's |
| `test-results-r1-incident.txt` | Reproduction, one-request (SQL Editor style) runs and regression tests |
| `test-results-r1-full-suite.txt` | The full suite, using the candidate verify file |

The precheck, migration and rollback remain the files in `../proposed-09-v2/`.

**Never run the verification script before the migration.** `09v2r1_verify_readonly.sql` is for use only after `../proposed-09-v2/09v2_razorpay_payments.sql` has succeeded.

`test-results-r1-guard.txt` holds the direct guard tests: the exact message, 26 rows made up of 19 checks and 7 information rows, and missing-object cases. Its 15 checks all passed.
