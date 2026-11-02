# Migration 10: durable notification outbox

**Status: proposed and tested locally on PostgreSQL 17.11. Not applied to any remote database.**

Applying this file changes nothing shoppers see, and nothing uses it yet. The application code, worker and schedule are separate work needing separate approval. Pay Online stays disabled.

## Files

| File | Purpose | Writes? |
|---|---|---|
| `10_precheck_readonly.sql` | Run first; save the counts | No |
| `10_outbox.sql` | The migration | Yes |
| `10_verify_readonly.sql` | Run only after the migration has succeeded | No |
| `10_rollback.sql` | Removes the functions and keeps the table | Yes |
| `tests/` | Local test suite and fixtures | Disposable container only |
| `test-results-pg17.txt` | Output of the latest test run | No |

**Never run `10_verify_readonly.sql` before the migration.** It stops with `Migration 10 is not applied, so nothing was verified. No data was changed.`

## Design

`finalize_payment_and_enqueue` calls the existing `mark_order_paid`, then stores the notifications. A database function is one transaction, so if storing fails, the payment change is undone too and the caller must try again. `mark_order_paid` is called, never changed.

| `mark_order_paid` result | Stored |
|---|---|
| `paid`, `already_paid` | `customer_receipt`, `owner_paid` |
| The same, order cancelled | `customer_paid_after_cancel`, `owner_refund_needed` |
| `already_paid`, order refunded | Nothing |
| `duplicate_payment` | `duplicate_payment` |
| `amount_mismatch` | `amount_mismatch`; the order stays unpaid |
| `not_found` | `unknown_order`, with no order link |

A missing amount is refused before `mark_order_paid` runs, because its comparison would pass a null and mark the order paid.

Dedupe keys are permanent:

| Notification | Key |
|---|---|
| Customer notice, either kind | `order/<order id>/customer` |
| Owner notice, either kind | `order/<order id>/owner` |
| Amount mismatch | `payment/<payment id>/amount_mismatch` |
| Unknown order | `payment/<payment id>/unknown_order` |
| Duplicate payment | `payment/<payment id>/duplicate` |

Order keys name the recipient, so each person gets one notice per order. If a paid order is cancelled and the payment event is redelivered before sending, the original `customer_receipt` and `owner_paid` rows stand. The sender reads `orders` when sending, so it sees the cancellation.

Delivery works in three steps:

1. `claim_notifications` leases rows with `FOR UPDATE SKIP LOCKED`.
2. The sender calls Resend, using `dedupe_key` as the idempotency key.
3. It then calls `complete_notification`, only after Resend accepts, or `fail_notification`.

## Rules

- **Access:** RLS on, no policies, and no table privileges for anyone but the owner, including `service_role`. Only the functions reach the table.
- **Payload:** ids and amounts only. Customer details are read from `orders` when sending.
- **Errors:** `last_error` has e-mail addresses, phone numbers, keys, tokens, Basic credentials and `key=value` secrets removed, and is cut to 300 characters.
- **Attempts:** a failed send counts. So does a lease that expired, which means a worker died mid-send.
- **Retry delays:** 1 minute, 5 minutes, 15 minutes, 1 hour, 4 hours, 12 hours, 24 hours. `Retry-After` can only lengthen a delay, up to 24 hours.
- **Final failure:** after the eighth failed attempt a row is `failed` and is never claimed again. The policy lists eight delays, but eight attempts use only seven of them.
- **Missing e-mail settings:** call `fail_notification` with `p_consume_attempt = false`.
- **Permanent errors:** call it with `p_permanent = true`.

## Order of work

1. Confirm a verified backup. The kill switch stays on.
2. Run `10_precheck_readonly.sql`.
3. Run `10_outbox.sql`.
4. Run `10_verify_readonly.sql`.

**Rollback order:** revert the application code and stop the worker, then run `10_rollback.sql`. **If Migration 09 v2 is also being rolled back, this comes first, and that needs its own approval.** `09v2_rollback.sql` isn't blocked by this migration, but it would leave `finalize_payment_and_enqueue` calling a function that no longer exists.

`10_rollback.sql` stops if rows are undelivered. Export them, then enable the marked line in the file. The table and its rows are kept, so reinstalling keeps every dedupe key.

## Running the tests

Docker Desktop must be running, with the `postgres:17.11` image present. From the repository root:

```bash
bash supabase/new-project/proposed-10-outbox/tests/run_tests.sh supabase/new-project/proposed-10-outbox/test-results-pg17.txt
```

The container has no network and no published ports, keeps its data in memory, and is removed afterwards. No Razorpay or Resend service is called, and no credentials are used.
