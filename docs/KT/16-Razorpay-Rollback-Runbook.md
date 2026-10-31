# 16 — Razorpay Rollback Runbook

> Status: prepared. **The SQL has run only on a disposable local PostgreSQL, never on Supabase,** and the kill switch has not been deployed or run. Every stage needs written approval.

## 1. Choose the smallest stage that solves the problem

| Stage | Purpose | Changes the database? | Reversible? |
|---|---|---|---|
| 1. Soft stop | Stop new online payments | No | Yes: undo the variables and redeploy |
| 2. Reconciliation | Account for every payment | Only to record a confirmed payment or refund | Records are corrected by hand |
| 3. Database rollback | Remove step 09's checkout functions | Yes; no column or order removed | Yes: run `09_razorpay_payments.sql` again |
| 4. Destructive cleanup | Remove payment columns | Yes | **No, only by restoring a backup** |

Most incidents need only Stage 1. Stage 4 is never part of a routine rollback, and it refuses to run if any payment record exists.

**This runbook never issues a refund.** Every refund is a person's decision, made in the Razorpay dashboard.

## 2. Stage 1 — Soft stop

In Vercel, Production environment:

1. Set `RAZORPAY_NEW_ORDERS_DISABLED` to `true`.
2. Clear `VITE_RAZORPAY_KEY_ID`.
3. **Leave `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `SUPABASE_URL` and `SUPABASE_SECRET_KEY` in place.** Verification and the webhook need them.
4. Redeploy. Changed variables reach the site only through a new deployment.
5. Leave the Razorpay webhook **enabled**.

Check:

- A new visitor sees COD only, and one COD test order works.
- A checkout page loaded before the redeploy gets "Online payment is not available right now" when it presses Pay Now.

## 3. Stage 2 — Reconciliation

The kill switch stops new Razorpay orders, but a payment window that is already open may still complete. Razorpay does not tell us when every window has closed.

1. Wait at least 60 minutes after the redeploy. `09_rollback.sql` enforces this for unpaid orders.
2. Confirm the webhook delivery log in the Razorpay dashboard shows no unresolved failures.
3. Run `09_reconciliation_readonly.sql` and export the CSV. Handle it as customer data: keep it off Git and off shared drives.
4. In the Razorpay dashboard, export or list all payments for the period Razorpay was live. Include every status.
5. Compare the two lists and handle every case below. Record who decided what.

| What you find | Action |
|---|---|
| Captured payment, order `paid` with the same payment ID and amount | Nothing to do |
| Captured payment, order still `pending` or `failed` | Confirm the payment and amount in Razorpay, then record it (below) |
| Captured payment with no matching order | Refund decision. Contact the customer if identifiable |
| Second payment in `duplicate_payment_id` | Refund decision for that payment |
| `paid` order that is `cancelled` | Refund decision |
| Payment authorized but not captured | Check its state in Razorpay. Do not capture it for a cancelled order |
| `paid` order with an e-mail "not sent" | Contact the customer or owner by hand; `09_rollback.sql` removes the sending functions |
| Failed payment or abandoned order | Nothing to do; `09_rollback.sql` cancels open orders |

**Record a confirmed payment.** Run this in the SQL Editor with values copied from Razorpay. It needs step 09, so do it before Stage 3. It does not send e-mails.

```sql
select public.mark_order_paid('<razorpay_order_id>', '<razorpay_payment_id>', <amount_in_paise>);
```

Expect `paid`. For anything else, stop and review.

**Record a refund.** Only after the refund is made in Razorpay, run this in the SQL Editor. The admin panel cannot do this.

```sql
update public.orders set payment_status = 'refunded' where order_number = '<order_number>';
```

Reconciliation is finished when every payment in the Razorpay list is accounted for, and every refund decision is recorded.

## 4. Stage 3 — Database rollback

Gates, all required:

- [ ] Stage 1 is deployed and checked.
- [ ] Stage 2 is finished and the CSV is stored safely.
- [ ] A **database backup is confirmed**: you have seen it in Supabase, with its date after the reconciliation. If the plan offers none, take a `pg_dump` and keep it off Git. Your docs list backups as unverified, so check this before an emergency.
- [ ] Written approval is recorded.

Steps:

1. In Razorpay, **disable the webhook** on `https://psperfumes.com/api/razorpay-webhook`. Do this now, not earlier: until here it has been recording payments.
2. Run `09_rollback_preflight_readonly.sql`. Export the grid. Every `true` row must be true, and every REVIEW row needs a recorded decision. Keep the "record these" counts.
3. Confirm the URL contains `/project/pwacxxrghlglvdtclbig/`, then run the whole of `09_rollback.sql`. It is one transaction: if it stops, nothing changed. Read its message.
4. Run `09_rollback_postcheck_readonly.sql`. No row may be `false`, and the counts must match step 2.
5. Place one COD test order, confirm it in Admin → Orders, then cancel it.
6. Open one existing receipt link.

**Keep these Vercel variables after Stage 3:**

- `SUPABASE_URL` and `SUPABASE_SECRET_KEY`: receipts need them.
- `RAZORPAY_NEW_ORDERS_DISABLED=true`.

The Razorpay key and webhook secret can then be removed, with a redeploy. Regenerate them in Razorpay if there is any doubt about them.

**After Stage 3:**

- For a period you choose, keep checking the Razorpay payments list. Any late payment is on no order, and it will not reach the site now that the webhook is off. Handle it as "captured payment" in Stage 2, without `mark_order_paid`, which no longer exists.
- Customer e-mails are not sent for any later change, and earlier e-mail dates stay on the orders.

### What stays and what stops

| Item | After Stage 3 |
|---|---|
| COD checkout | Works, using the exact `place_order` of step 08 |
| `orders.idempotency_key`, combo checks, stock checks | Unchanged |
| Paid orders, payment IDs, paid dates | Kept |
| Admin → Orders payment details | Kept |
| Paid order dispatch | Works |
| Unpaid orders | Cancelled, and `ps_orders_payment_guard` still refuses to dispatch them |
| Receipt links for paid orders | Keep working through `get_order_receipt` and `/api/receipt` |
| Receipt links for refunded orders | Show "Receipt not found", as they do today |
| E-mail dates | Kept |
| `create-order`, `verify-payment`, webhook | Stop working; the first two return errors and the webhook is off |

## 5. Stage 4 — Destructive cleanup (optional)

`09_rollback_cleanup_optional.sql` removes the guard, `get_order_receipt` and all nine payment columns. It **refuses to run** while any order holds a payment ID, a paid date or a paid or refunded Razorpay status. There is no supported way to delete real payment records.

Use it only where Razorpay orders were never paid, such as after a rehearsal. Before running:

- [ ] Stage 3 is complete.
- [ ] A new backup is confirmed.
- [ ] `09_reconciliation_readonly.sql` was exported after Stage 3.
- [ ] Written approval is recorded, then the `set local` line in the file is enabled.

After it runs, any earlier receipt link stops working permanently.

## 6. Reapplying step 09

| State | Reapply |
|---|---|
| After Stage 3 | Run `09_razorpay_payments.sql`, then `09_verify_readonly.sql`. It keeps the columns, so payment IDs and receipt links survive. Then reverse Stage 1 and enable the webhook, each with approval |
| After Stage 4 | Runs as a first install. Stage 4 only ran because no payment record existed |
| Columns dropped by hand with paid orders | **No safe path.** The preflight refuses. Without it, the guard would block every later update to those orders, including dispatch. Restore from backup first |

**Limits:**

- Reapplying passed on a disposable local PostgreSQL only, with test data. It has not run on Supabase.
- Orders cancelled by the rollback stay cancelled. A customer who returns to an old checkout starts a new order.
- COD orders placed after Stage 3 keep working after reapplying.

## 7. Remaining risks and manual actions

- **Nothing here has run on Supabase.** The SQL files and the reapply path were validated on a disposable local PostgreSQL only.
- **Late payments:** nothing proves every payment window has closed. A payment can arrive after the webhook is disabled, so the Razorpay list must be watched by hand.
- **Refunds are manual,** and so is recording them.
- **Backups are unverified** for this project.
- **The 60-minute wait is a chosen value,** not a Razorpay guarantee. Lengthen `c_quiet` in `09_rollback.sql` if needed, and the matching check in the preflight.
- **`mark_order_paid` run by hand sends no e-mail.**
- **The kill switch needs a redeploy,** so it is not instant.
- **The reconciliation depends on Razorpay's dashboard.** Check its current reports when rehearsing; this runbook does not assume a specific report name.
