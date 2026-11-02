# 15 — Razorpay Payments

> Status at 2026-11-02: **Production runs commit `044d9ca`, and its database has Migrations 08 and 09 v2 only. Online payment is off and cannot work until Migration 10 is applied. No test payment has been made.**
>
> - **The deployed payment code needs Migration 10, which is not applied.** `044d9ca` deployed the outbox code (§1, §9): `verify-payment` and the webhook call `finalize_payment_and_enqueue`, which does not exist in Production yet, and `/api/process-notifications` is deployed but has nothing to work on. No payment can start meanwhile (next two points), so shoppers are not affected. A `payment.captured` event reaching the live webhook would get HTTP 500, and Razorpay disables a webhook after 24 hours of failures: check its delivery log before §2 Part B.
> - The kill switch is on: an empty `POST /api/create-order` returned HTTP 503 on 2026-11-02. That response does not say whether the switch or the server keys refused it, so confirm `RAZORPAY_NEW_ORDERS_DISABLED=true` in Vercel.
> - `VITE_RAZORPAY_KEY_ID` was set to the text `absent` in Production, which showed a Pay Online option that failed with HTTP 503. The owner has removed it, and the live checkout no longer shows the option. The storefront now offers Pay Online only for a real `rzp_live_` / `rzp_test_` Key ID (local change, not yet deployed).
> - **Recovery path:** apply Migration 10 (§2 Part B), set up the notification worker's schedule, then test in Razorpay Test Mode (§2 Part C). Reverting the API code to `c75510a` instead would lose the payment fixes (no second capture, refunded orders, strict kill switch, pending verification) and is not recommended.
> - Migration 10 is in `supabase/new-project/proposed-10-outbox/`: 169 of 169 SQL checks pass, and the API suite passes against a database in the exact target state (08 + 09 v2 + 10, no 11).
> - Migration 11 (shipping by PIN code) is separate, also not applied, and must come **after** Migration 10. Its storefront code is deployed and falls back to the standard ₹99 / free-over-₹1,500 rule while it is absent; the browser console shows one 404 for `get_shipping_quote` per page load, which the code handles.
> - Migration 09 v2 passed 312 of 312 checks on a disposable PostgreSQL 17.11 container before it was applied. A first production attempt on 2026-10-31 stopped with `column "receipt_token" does not exist`; that came from the verification script running before the migration, and production was unchanged.
>
> **Use `supabase/new-project/proposed-09-v2/09v2_razorpay_payments.sql`.** The original `09_razorpay_payments.sql` is superseded and must not be run.

## 1. How a payment works

1. `POST /api/create-order` saves the order through `place_order_core` (`RAZORPAY`, `pending`) and opens a Razorpay order for the database total. The browser sends what is being bought, never an amount. `place_order_core` handles Razorpay orders only; COD orders stay with `place_order` from Migration 08.
2. The browser opens Razorpay Checkout. Closing it leaves the order unpaid; paying again reuses the same order.
3. `POST /api/verify-payment` checks the signature (HTTP 400 on a mismatch), then asks Razorpay whether the payment is captured and matches the order and amount.
4. `POST /api/razorpay-webhook` does the same from Razorpay's side, which covers a shopper who closes the tab after paying.
5. Both call `finalize_payment_and_enqueue`, which runs `mark_order_paid` and stores the notifications in one transaction, and is safe to repeat. `mark_order_paid` sets the order to `paid` / `confirmed` and counts the coupon.
6. `verify-payment` then tries to send the stored notifications at once. The webhook sends nothing, so it answers Razorpay quickly. `/api/process-notifications` sends whatever is left and handles retries. See §9.

Unpaid online orders appear under **Admin → Orders → View: Awaiting payment** and are left out of dashboard figures. The trigger `ps_orders_payment_guard` refuses to process them, whoever tries. Signed-in admins can change only the fulfilment of a Razorpay order, so a refund is recorded in the SQL Editor until a refund flow exists.

`create-order` never reopens a cancelled or refunded order. A payment already in progress when an order is cancelled stays cancelled: `verify-payment` does not capture it, and a captured one is flagged for refund and e-mailed as such.

## 2. Order of work

Each step needs written approval. **Applying the migration and enabling Pay Online are separate decisions.** The migration only prepares the database: shoppers still see COD only, and the kill switch stays on.

**Part A: apply Migration 09 v2 (does not enable Pay Online)**

Files are in `supabase/new-project/proposed-09-v2/`, except the verification script, which is `supabase/new-project/proposed-09-v2-r1/09v2r1_verify_readonly.sql`.

**Never run the verification script before the migration.** It checks objects that only the migration creates, so it needs a successful step 5 first. Use a separate query tab for each file, and confirm which file is open before pressing Run.

1. Migration 08 is already applied. Do not edit it or run it again.
2. Confirm `RAZORPAY_NEW_ORDERS_DISABLED=true` in Production and that `VITE_RAZORPAY_KEY_ID` is not set there. The migration removes the last database barrier to new online orders, so the kill switch must be on first.
3. Take a backup and verify it: the dump files are not empty, `pg_restore --list` succeeds, and the checksums are recorded. See `README-changes.md` in the same folder. If orders arrive after the backup, take it again.
4. Run `09v2_precheck_readonly.sql`. Continue only with no `false` row, and save its counts.
5. Run the whole of `09v2_razorpay_payments.sql`.
6. Only after step 5 succeeds, run `09v2r1_verify_readonly.sql`. Expect 26 rows: 19 checks and 7 information rows. No row may be `false`, and the counts must match step 4, allowing for new orders. If it stops with `Migration 09 v2 is not applied, so nothing was verified. No data was changed.`, the migration has not been applied: stop and review before running anything else. The older `09v2_verify_readonly.sql` reports the same situation as `column "receipt_token" does not exist`.
7. COD test order: this needs its own written approval, because it creates a real row in the live database. Once approved, place one order and confirm it in Admin → Orders. It must then be cancelled.

**What v2 leaves alone**

- `place_order`, the public COD function, is **not replaced** and stays byte-identical to Migration 08. The migration, the precheck and the rollback all check its fingerprint, `f58df5ff55e84e958d1e27336cd82f6e`.
- `08_checkout_hardening.sql` must remain unchanged, because its `place_order` is what that fingerprint describes.
- No existing order is written. Existing orders keep an empty `receipt_token`; only new orders receive one.

**Part B: apply Migration 10 and start the notification worker (does not enable Pay Online)**

The deployed payment code needs this before any payment can complete. Files are in `supabase/new-project/proposed-10-outbox/`. Keep the kill switch on throughout.

1. Check the live Razorpay webhook's delivery log. A recent failed `payment.captured` delivery hit the code before Migration 10: reconcile it by hand ([16](16-Razorpay-Rollback-Runbook.md) §3).
2. Take a backup and verify it, as in Part A step 3.
3. Run `10_precheck_readonly.sql`. Continue only with no `false` row (fingerprints of steps 08 and 09 v2 unchanged, step 10 not started, no transaction open for over a minute), and save its counts.
4. Run the whole of `10_outbox.sql`, then `10_verify_readonly.sql`. Never run the verify script first: it stops with `Migration 10 is not applied`.
5. Confirm the §3 e-mail and worker variables exist in Production (names only): `RESEND_API_KEY`, `EMAIL_FROM` on a domain verified in Resend, `OWNER_NOTIFICATION_EMAIL`, `NOTIFICATION_WORKER_SECRET`, and `SUPABASE_URL` / `SUPABASE_SECRET_KEY`.
6. Create the worker's schedule (§9 *Scheduler*), a separate approval. Check: a call without the secret gets 401; the scheduler's calls get 200 with `"claimed"` counts in the Vercel logs.
7. Optional, with its own approval: one COD test order, confirmed in Admin → Orders and then cancelled. Migration 10 changes no COD object.

Rollback: stop the schedule, then follow `proposed-10-outbox/README.md`. Code from `044d9ca` onwards needs Migration 10, so rolling it back also means redeploying the API code of `c75510a`.

**Part C: enable Pay Online (a separate approval)**

1. Set the Preview variables (§3) and deploy a Preview.
2. Configure the webhook (§4) and run the tests (§5).
3. Go live (§6).

## 3. Vercel environment variables

Project → Settings → Environment Variables. Redeploy after any change.

| Variable | Preview | Production before go-live | Sensitive | Value |
|---|---|---|---|---|
| `VITE_RAZORPAY_KEY_ID` | Set | **Leave unset** (not a placeholder such as `absent`) | No | Test Key ID. Controls whether "Pay Online" appears; only an `rzp_live_` / `rzp_test_` value shows it |
| `RAZORPAY_KEY_ID` | Set | Not needed yet; see below | No | Same Key ID |
| `RAZORPAY_KEY_SECRET` | Set | Not needed yet; see below | **Yes** | Regenerated test Key Secret |
| `RAZORPAY_WEBHOOK_SECRET` | Set | Must match the live webhook before go-live | **Yes** | The secret you type in §4 |
| `SUPABASE_URL` | Set | **Required** (receipts, verification, webhook) | No | `https://pwacxxrghlglvdtclbig.supabase.co` |
| `SUPABASE_SECRET_KEY` | Set | **Required** (receipts, verification, webhook) | **Yes** | Supabase → Project Settings → API Keys → Secret key |
| `RESEND_API_KEY` | Set | Required from §2 Part B | **Yes** | From your Resend account. Without it payments work and e-mails wait in the outbox, using no attempts |
| `EMAIL_FROM` | Set | Required from §2 Part B | No | A sender on a domain verified in Resend |
| `OWNER_NOTIFICATION_EMAIL` | Required | Required | No | Address for owner order and refund alerts |
| `NOTIFICATION_WORKER_SECRET` | Set | Required from §2 Part B | **Yes** | A long random value. The scheduler sends it to `/api/process-notifications`. Without it the worker refuses every call |
| `SITE_URL` | Set to the Preview URL | Optional | No | Base URL for e-mail links. Defaults to `https://psperfumes.com` |
| `RAZORPAY_NEW_ORDERS_DISABLED` | Unset | **`true`** | No | Kill switch. `true` blocks new Razorpay orders; verification and the webhook keep working. It fails closed: any value except empty, `false`, `0`, `no` or `off` blocks, ignoring case and spaces. Removed only in §6 |

Before go-live, `RAZORPAY_NEW_ORDERS_DISABLED=true` is what must hold in Production. The status of the "not needed yet" variables is unconfirmed, and an API response cannot establish it. Inspect the actual Production environment variables in Vercel to confirm which exist, and do not assume they are either set or absent.

Never give a secret a `VITE_` prefix, and never put one in `.env` or `.env.example`: both are tracked by Git, and the repository is public. As a second safeguard, Production refuses to start a payment unless the key is `rzp_live_`, and every other environment refuses unless it is `rzp_test_`.

## 4. Webhook (Test Mode)

Razorpay Dashboard → switch to **Test Mode** → Account & Settings → Webhooks → Add New Webhook.

1. **URL:** `https://<preview-host>/api/razorpay-webhook`. A branch Preview URL stays stable across redeploys.
2. If Vercel Deployment Protection is on, Razorpay is blocked with a 401. Create a bypass secret in Vercel (Settings → Deployment Protection → Protection Bypass for Automation) and append `?x-vercel-protection-bypass=<bypass-secret>` to the URL.
3. **Secret:** a long random value, different from the Key Secret. Use the same value for `RAZORPAY_WEBHOOK_SECRET`.
4. **Active events:** `payment.captured`, `payment.failed`, `order.paid`.
5. Account & Settings → Payment Capture: set capture to **automatic**. The webhook marks an order paid only for a captured payment, so a shopper who closes the tab would otherwise depend on manual capture.

## 5. Preview test script

There is no staging database, so these tests create **real rows in the live database**. Use your own e-mail, then cancel each test order in Admin → Orders. Use the test card, UPI and net banking details from Razorpay's current Test Mode documentation. No real money moves.

| # | Steps | Expected |
|---|---|---|
| 1 | Preview checkout page | COD and Pay Online both shown. Production still shows COD only |
| 2 | COD order | Works as before; order number shown; one order in Admin |
| 3 | Pay Online, successful test payment | Success page shows order number, payment ID, items, total. Admin: `PAID`, `CONFIRMED`, payment IDs, date, receipt link |
| 4 | After test 3 | Exactly one customer e-mail and one owner e-mail at the `OWNER_NOTIFICATION_EMAIL` address; receipt link opens |
| 5 | Razorpay → Webhooks → delivery log | The events for test 3 show 200 |
| 6 | If the Razorpay dashboard offers re-delivery, resend a `payment.captured` event from the log | Still 200; no second e-mail; coupon count unchanged |
| 7 | Pay Online with a failing test payment, then close the window | Failure message on the page; order under Awaiting payment as `FAILED` after the webhook |
| 8 | Pay Online, close the window without paying | "Payment cancelled"; cart kept; order under Awaiting payment |
| 9 | After 8, press Pay Now again and pay | Same order number; only one order; `PAID` |
| 10 | After 8, change the address, press Pay Now | New order with the new address |
| 11 | Open an unpaid order in Admin | Only PENDING and CANCELLED offered, plus "Do not dispatch" |
| 12 | Use a coupon, abandon payment | `used_count` unchanged. Pay on a new attempt: `used_count` +1 |
| 13 | Pay, then close the tab before the success page (or block `/api/verify-payment` in DevTools) | Order becomes `PAID` from the webhook; e-mails arrive |
| 14 | `POST /api/verify-payment` with a wrong `razorpay_signature` | HTTP 400; order unchanged |
| 15 | Double-click Pay Now | One order, one window |
| 16 | Edit a price in the browser's saved bag, then Pay Now | The window shows the database total, after a notice on the page |
| 17 | Run `09v2r1_verify_readonly.sql` | No `false` rows. `no second payment awaiting a refund decision` must be `true`, because no test in this script makes a second payment. If it is `false`, a second payment was captured: the test has not passed, so stop and make the refund decision in [16 — Razorpay Rollback Runbook](16-Razorpay-Rollback-Runbook.md) §3 |
| 18 | Start Pay Online, close the window, cancel that order in Admin, press Pay Now | "This order was cancelled"; the next Pay Now creates a new order |
| 19 | Open the payment window, cancel the order in Admin, then pay | Order stays cancelled; customer and owner e-mails say a refund is needed |
| 20 | Open a receipt link for a paid order; print it | Correct items, total and payment ID |
| 21 | Open the payment window, set `RAZORPAY_NEW_ORDERS_DISABLED=true`, redeploy, then pay in the window already open | The payment still completes |
| 22 | After 21, start a new Pay Online from a page loaded before the redeploy | Refused with HTTP 503; COD still works |

## 6. Go live

This is Part C of §2. Do not start it until all of these hold:

- Migrations 09 v2 and 10 are applied and verified, and the worker's schedule runs (§2 Part B).
- §5 has passed in Test Mode, including UPI, Visa, Mastercard, RuPay and net banking.
- The site has refund, terms, privacy and shipping policy pages. It has none yet, and Razorpay usually expects them.
- In Razorpay **Live Mode**: automatic capture is on, and the existing live webhook is active, has `payment.captured`, `payment.failed` and `order.paid`, and uses the secret in `RAZORPAY_WEBHOOK_SECRET`.

1. Complete Razorpay account activation.
2. Use regenerated live keys. The live webhook on `https://psperfumes.com/api/razorpay-webhook` already exists; do not add a second one. Its events `order.notification.delivered` and `order.notification.failed` are acknowledged and ignored.
3. Set the §3 variables for Production with live values, including `VITE_RAZORPAY_KEY_ID`, and remove `RAZORPAY_NEW_ORDERS_DISABLED`. Then redeploy. Pay Online appears only after this redeploy, and it needs both changes: the variable alone shows a button that fails with HTTP 503.
4. Make one small real payment and refund it.

## 7. Stopping online payments

**Soft stop (not a rollback):** clear `VITE_RAZORPAY_KEY_ID`, set `RAZORPAY_NEW_ORDERS_DISABLED=true` in Production, and redeploy. New customers see COD only, and pages opened earlier can no longer start a Razorpay order. Open payments, verification, webhooks, receipts and every database object keep working. Clearing `VITE_RAZORPAY_KEY_ID` alone is not enough: it only hides the button on newly loaded pages.

A soft stop does not change the database. To remove Migration 09 v2 from the database, follow [16 — Razorpay Rollback Runbook](16-Razorpay-Rollback-Runbook.md).

## 8. Known limits

- The §9 code is deployed but Migration 10 is not applied, so verification and the webhook cannot complete a payment until it is (§2 Part B).
- The browser creates COD orders through `place_order`, with no server step, so they send no e-mails. Only paid online orders do.
- `place_order` and `place_order_core` each hold their own copy of the pricing logic. Any future pricing change must be made in both.
- Stock is checked when the order is created and not decremented, as with COD. Two shoppers can pay for the last unit; the second needs a refund.
- `/api/create-order` has no rate limit, the same exposure as the public `place_order`.
- The receipt is an order receipt, not a GST tax invoice.
- Refunds are made in the Razorpay dashboard. They do not update `payment_status` yet.

## 9. Notifications (Migration 10)

The code is deployed (commit `044d9ca`); Migration 10 is not applied yet (§2 Part B). The table, keys and retry rules are in `supabase/new-project/proposed-10-outbox/README.md`.

**Scheduler.** Something must call `POST https://psperfumes.com/api/process-notifications` with the header `Authorization: Bearer <NOTIFICATION_WORKER_SECRET>` every 1 to 5 minutes. Each call handles at most 20 due rows. Without it, payments confirmed in the browser are still e-mailed at once, but payments confirmed only by the webhook, and every retry, wait in the outbox.

- Vercel Cron does not fit as the code stands: it calls with GET, which this endpoint refuses (HTTP 405), and the Hobby plan runs crons once a day. Using it needs a GET handler that checks `CRON_SECRET`, and a paid plan.
- An external HTTP scheduler that can send POST with a custom header works without code changes.
- Supabase `pg_cron` with `pg_net` also works, but stores the worker secret in the database: a database change needing its own approval.

Choosing one is an owner decision. Check it afterwards in the Vercel logs: calls answer 200 with counts; 401 means the secret differs; 503 means `RESEND_API_KEY` or `EMAIL_FROM` is missing.

| Sender | Sends? | Claims |
|---|---|---|
| `api/razorpay-webhook.js` | Never | Nothing |
| `api/verify-payment.js` | At once, inside the request | Up to 4 rows for that order, 30-second lease |
| `api/process-notifications.js` | On a schedule | Up to 20 due rows, 120-second lease |

A notification is `sent` only after Resend accepts it and returns a message id. `dedupe_key` is the `Idempotency-Key`, so a retry after a lost answer sends nothing twice for 24 hours. `claim_order_email` and `release_order_email` stay in the database, but no API code calls them. `customer_email_sent_at` and `owner_email_sent_at` now mean Resend accepted the message.

**Webhook answers**

| Event | Answer | What is stored |
|---|---|---|
| Any of the five payment results | 200 | As Migration 10 maps it |
| Captured, not INR | 200 | `amount_mismatch` alert, no amounts |
| Captured, amount not a positive whole number | 200 | `amount_mismatch` alert, no amounts |
| Database refuses the payment (`P0001`) | 200 | `amount_mismatch` alert |
| Unusable payment id | 200 | Log line only: the outbox needs that id |
| Database or network failure, including while storing an alert | 500 | Nothing; Razorpay delivers again |

Razorpay disables a webhook after 24 hours of failures, so refused data is never answered with an error. Migration 10 has one alert type for every kind of mismatch, so its e-mail says the payment does not match the order.

**Resend answers**

| Answer | Action | Uses an attempt |
|---|---|---|
| Accepted with a message id | `complete_notification` | Yes, the successful one |
| Accepted with no message id | Retry | Yes |
| Timeout, network error, 5xx, 429, other 409 | Retry, honouring `Retry-After` | Yes |
| 409 `invalid_idempotent_request`, 422, other 4xx | Permanent failure | Yes |
| 401, 403 | Retry later; our settings are wrong | **No** |
| `RESEND_API_KEY` or `EMAIL_FROM` missing | Nothing is claimed | **No** |
| `OWNER_NOTIFICATION_EMAIL` missing | Owner rows retry; customer mail still goes | **No** |

The e-mail body follows the order's current status, so an order cancelled between two attempts changes the body. Resend then answers `invalid_idempotent_request`, the notification fails, and the owner is told.

A refunded order sends nothing: its rows are closed as `failed` with `Skipped:` in `last_error`, and no alert goes out. A deleted order cannot be e-mailed to anyone, so its receipts fail and the owner is told; alerts still go out, without an order number.

**Permanent failures.** The owner gets one direct e-mail, tried once, sent outside the outbox so it cannot create another failure. Its failure is only logged as `notification_failure_alert_failed`.

**Not covered without a new migration.** A worker crash during the final attempt turns the row `failed` inside `claim_notifications`, which returns nothing, so no alert goes out. No function lists failed rows. Until a later migration adds one, check `10_verify_readonly.sql` for failed rows. 401 and 403 answers retry without limit, so watch the logs for `notification_rejected_by_settings`.

**Tests.** With Docker running, from the repository root:

```bash
bash tests/api/run_api_tests.sh tests/api/test-results.txt
```

They run on an internal Docker network with real PostgreSQL and PostgREST and stubbed Razorpay and Resend. Credentials are fake, `.env` is not mounted, and everything is removed afterwards. Keep tests outside `api/`: Vercel deploys every file there as a function.

Three disposable databases are built from the real migration files:

| Database | Migrations | Used for |
|---|---|---|
| `apitest` | 08, 09 v2, 10, 11 | First pass: the whole suite |
| `apitesttarget` | 08, 09 v2, 10 | Second pass: the whole suite except the Migration 11 tests. This is the state §2 Part B creates |
| `apitestprod` | 08, 09 v2 | Production today: the missing shipping quote and COD on the step 08 `place_order` |

`migration files unchanged` checks the SQL files against their recorded fingerprints, and `database function fingerprints as expected` checks that the target state holds exactly the step 08 and 09 v2 checkout functions.
