-- ============================================================================
-- PS PERFUMES — RAZORPAY ORDER EXPORT FOR RECONCILIATION (READ-ONLY)
-- Target: ps-perfumes-production (project ref pwacxxrghlglvdtclbig)
-- Status: validated on a disposable local database only. One SELECT; it changes nothing. Requires step 09.
--
-- Run the whole file and export the grid as CSV. This is the defined export of Razorpay orders
-- required by docs/KT/16-Razorpay-Rollback-Runbook.md.
-- The CSV holds customer names, contact details and private receipt tokens: keep it off Git and
-- off shared drives, and delete it when it is no longer needed.
-- ============================================================================

select
  o.order_number,
  o.created_at,
  o.payment_status,
  o.order_status,
  o.total_amount,
  round(o.total_amount * 100)::bigint as amount_paise,
  o.razorpay_order_id,
  o.razorpay_payment_id,
  o.paid_at,
  o.duplicate_payment_id,
  o.payment_error,
  o.coupon_code,
  o.customer_email_sent_at,
  o.owner_email_sent_at,
  o.receipt_token,
  o.customer_name,
  o.customer_email,
  o.customer_phone,
  case
    when o.duplicate_payment_id is not null then 'REVIEW: second payment, refund decision needed'
    when o.payment_status = 'paid' and o.order_status = 'cancelled' then 'REVIEW: paid after cancel, refund decision needed'
    when o.payment_status = 'paid' and (o.customer_email_sent_at is null or o.owner_email_sent_at is null) then 'REVIEW: paid, e-mail not sent'
    when o.payment_status = 'paid' then 'Match against a captured Razorpay payment'
    when o.payment_status in ('pending', 'failed') and o.razorpay_order_id is not null then 'Check Razorpay for a captured payment on this order'
    when o.payment_status in ('pending', 'failed') then 'No Razorpay order was attached'
    else 'Refunded: confirm in Razorpay'
  end as reconciliation_action
from public.orders o
where o.payment_method = 'RAZORPAY'
order by o.created_at;
