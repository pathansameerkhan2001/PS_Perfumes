import { callRpc } from './_lib/supabaseAdmin.js';
import { isValidWebhookSignature } from './_lib/razorpay.js';
import { finalizePayment, isValidPaymentInput, recordPaymentIncident } from './_lib/finalizePayment.js';
import { json } from './_lib/http.js';

/** Throws on a temporary failure only: refused data is recorded for the owner and acknowledged. */
async function handleCaptured(payment) {
  const details = { razorpayOrderId: payment.order_id, razorpayPaymentId: payment.id };

  if (payment.currency !== 'INR') {
    await recordPaymentIncident({ ...details, reason: 'not_inr' });
    return;
  }
  const input = { ...details, amountPaise: payment.amount };
  if (!isValidPaymentInput(input)) {
    await recordPaymentIncident({ ...input, reason: 'invalid_payment_data' });
    return;
  }

  try {
    const outcome = await finalizePayment(input);
    if (outcome.result === 'not_found') console.warn(`Webhook for unknown order ${payment.order_id}`);
  } catch (err) {
    if (err.code !== 'P0001') throw err;
    await recordPaymentIncident({ ...input, reason: 'refused_by_database' });
  }
}

/**
 * Razorpay delivers each event at least once, sometimes out of order. Handling is safe to repeat:
 * finalize_payment_and_enqueue and record_payment_failure are idempotent, so no event log is kept.
 * A non-2xx answer makes Razorpay deliver again and 24 hours of them disable the webhook, so only
 * temporary failures return one. Razorpay allows 5 seconds: this saves notifications and sends none.
 */
export async function POST(request) {
  const rawBody = await request.text();

  let validSignature = false;
  try {
    validSignature = isValidWebhookSignature(rawBody, request.headers.get('x-razorpay-signature'));
  } catch (err) {
    console.error('razorpay-webhook:', err.message);
    return json({ error: 'Webhook is not configured' }, 500);
  }
  if (!validSignature) return json({ error: 'Invalid signature' }, 400);

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return json({ error: 'Invalid body' }, 400);
  }

  const payment = event?.payload?.payment?.entity;
  // Events without an order (payment links, dashboard test events) are not ours to handle
  if (!payment?.order_id) return json({ received: true });

  try {
    if (event.event === 'payment.captured' || event.event === 'order.paid') {
      if (payment.status === 'captured') await handleCaptured(payment);
    } else if (event.event === 'payment.failed') {
      await callRpc('record_payment_failure', {
        p_razorpay_order_id: payment.order_id,
        p_reason: payment.error_description || payment.error_reason || 'Payment failed',
      });
    }
    return json({ received: true });
  } catch (err) {
    console.error('razorpay-webhook:', err.message);
    return json({ error: 'Temporary failure' }, 500);
  }
}
