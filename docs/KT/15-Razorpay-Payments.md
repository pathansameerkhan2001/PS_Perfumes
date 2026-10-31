# 15 — Razorpay Payments

> Status: code and SQL written. **Migration 08 is applied and verified on Supabase. Migration 09 is not applied there. Nothing is deployed, and no test payment has been made.** Migration 09 passed validation on a disposable local PostgreSQL only.

## 1. How a payment works

1. `POST /api/create-order` saves the order through `place_order_core` (`RAZORPAY`, `pending`) and opens a Razorpay order for the database total. The browser sends what is being bought, never an amount.
2. The browser opens Razorpay Checkout. Closing it leaves the order unpaid; paying again reuses the same order.
3. `POST /api/verify-payment` checks the signature (HTTP 400 on a mismatch), then asks Razorpay whether the payment is captured and matches the order and amount.
4. `POST /api/razorpay-webhook` does the same from Razorpay's side, which covers a shopper who closes the tab after paying.
5. Both call `mark_order_paid`, which sets the order to `paid` / `confirmed`, counts the coupon, and is safe to repeat. Then the customer and owner e-mails are sent, each once.

Unpaid online orders appear under **Admin → Orders → View: Awaiting payment** and are left out of dashboard figures. The trigger `ps_orders_payment_guard` refuses to process them, whoever tries. Signed-in admins can change only the fulfilment of a Razorpay order, so a refund is recorded in the SQL Editor until a refund flow exists.

`create-order` never reopens a cancelled or refunded order. A payment already in progress when an order is cancelled stays cancelled: `verify-payment` does not capture it, and a captured one is flagged for refund and e-mailed as such.

## 2. Order of work

Each step needs written approval.

1. Run `08_preflight_readonly.sql`, then `08_checkout_hardening.sql`.
2. Run `09_razorpay_payments.sql`, then `09_verify_readonly.sql`.
3. Set the Vercel variables (§3) and deploy a Preview.
4. Configure the webhook (§4) and run the tests (§5).
5. Go live (§6).

## 3. Vercel environment variables

Project → Settings → Environment Variables. Redeploy after any change.

| Variable | Preview | Production before go-live | Sensitive | Value |
|---|---|---|---|---|
| `VITE_RAZORPAY_KEY_ID` | Set | **Leave unset** | No | Test Key ID. Controls whether "Pay Online" appears |
| `RAZORPAY_KEY_ID` | Set | Unset | No | Same Key ID |
| `RAZORPAY_KEY_SECRET` | Set | Unset | **Yes** | Regenerated test Key Secret |
| `RAZORPAY_WEBHOOK_SECRET` | Set | Unset | **Yes** | The secret you type in §4 |
| `SUPABASE_URL` | Set | Unset | No | `https://pwacxxrghlglvdtclbig.supabase.co` |
| `SUPABASE_SECRET_KEY` | Set | Unset | **Yes** | Supabase → Project Settings → API Keys → Secret key |
| `RESEND_API_KEY` | Set | Unset | **Yes** | From your Resend account. Without it payments work and e-mails are skipped |
| `EMAIL_FROM` | Set | Unset | No | A sender on a domain verified in Resend |
| `OWNER_NOTIFICATION_EMAIL` | Required | Required | No | Address for owner order and refund alerts |
| `SITE_URL` | Set to the Preview URL | Optional | No | Base URL for e-mail links. Defaults to `https://psperfumes.com` |
| `RAZORPAY_NEW_ORDERS_DISABLED` | Unset | Unset | No | Kill switch. `true` blocks new Razorpay orders; verification and the webhook keep working |

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
| 17 | Run `09_verify_readonly.sql` and its second query | No `false`; all three counts 0 |
| 18 | Start Pay Online, close the window, cancel that order in Admin, press Pay Now | "This order was cancelled"; the next Pay Now creates a new order |
| 19 | Open the payment window, cancel the order in Admin, then pay | Order stays cancelled; customer and owner e-mails say a refund is needed |
| 20 | Open a receipt link for a paid order; print it | Correct items, total and payment ID |
| 21 | Open the payment window, set `RAZORPAY_NEW_ORDERS_DISABLED=true`, redeploy, then pay in the window already open | The payment still completes |
| 22 | After 21, start a new Pay Online from a page loaded before the redeploy | Refused with HTTP 503; COD still works |

## 6. Go live

1. Complete Razorpay account activation. Razorpay usually expects refund, terms, privacy and shipping policy pages, and the site has none yet.
2. Use regenerated live keys. The live webhook on `https://psperfumes.com/api/razorpay-webhook` already exists; do not add a second one. Its events `order.notification.delivered` and `order.notification.failed` are acknowledged and ignored.
3. Set the §3 variables for Production with live values, then redeploy.
4. Make one small real payment and refund it.

## 7. Stopping online payments

**Soft stop (not a rollback):** clear `VITE_RAZORPAY_KEY_ID`, set `RAZORPAY_NEW_ORDERS_DISABLED=true` in Production, and redeploy. New customers see COD only, and pages opened earlier can no longer start a Razorpay order. Open payments, verification, webhooks, receipts and every database object keep working. Clearing `VITE_RAZORPAY_KEY_ID` alone is not enough: it only hides the button on newly loaded pages.

A soft stop does not change the database. To remove step 09 from the database, follow [16 — Razorpay Rollback Runbook](16-Razorpay-Rollback-Runbook.md).

## 8. Known limits

- COD orders are created directly by the browser, so they send no e-mails. Only paid online orders do.
- Stock is checked when the order is created and not decremented, as with COD. Two shoppers can pay for the last unit; the second needs a refund.
- `/api/create-order` has no rate limit, the same exposure as the public `place_order`.
- The receipt is an order receipt, not a GST tax invoice.
- Refunds are made in the Razorpay dashboard. They do not update `payment_status` yet.
