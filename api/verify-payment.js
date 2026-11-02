import { callRpc } from './_lib/supabaseAdmin.js';
import { capturePayment, fetchPayment, isValidPaymentSignature } from './_lib/razorpay.js';
import { finalizePayment, recordPaymentIncident } from './_lib/finalizePayment.js';
import { deliverOrderNotifications } from './_lib/notifications.js';
import { json, readJson, toPaise } from './_lib/http.js';

// Not a payment to confirm or wait for: the browser shows this and starts nothing new
const refundedAnswer = () =>
  json({ error: 'This payment has been refunded, so the order is closed. Please contact us if you have any questions.', refunded: true }, 409);

export async function POST(request) {
  const body = await readJson(request);
  const razorpayOrderId = String(body?.razorpay_order_id || '');
  const razorpayPaymentId = String(body?.razorpay_payment_id || '');
  const signature = String(body?.razorpay_signature || '');

  if (!/^order_[A-Za-z0-9]+$/.test(razorpayOrderId) || !/^pay_[A-Za-z0-9]+$/.test(razorpayPaymentId) || !signature) {
    return json({ error: 'Invalid payment details.' }, 400);
  }

  try {
    if (!isValidPaymentSignature({ razorpayOrderId, razorpayPaymentId, signature })) {
      return json({ error: 'The payment could not be verified.' }, 400);
    }

    const order = await callRpc('get_payment_order', { p_razorpay_order_id: razorpayOrderId });
    if (!order) return json({ error: 'The payment could not be verified.' }, 400);

    // A valid signature proves who sent this, not that the money moved: ask Razorpay directly
    const amountPaise = toPaise(order.total_amount);
    let payment = await fetchPayment(razorpayPaymentId);
    if (payment.order_id !== razorpayOrderId || payment.amount !== amountPaise || payment.currency !== 'INR') {
      console.error(`Payment ${razorpayPaymentId} does not match order ${order.order_number}`);
      // The alert must not change this answer. A captured payment also reaches the webhook.
      await recordPaymentIncident({
        reason: 'payment_does_not_match_order',
        razorpayOrderId,
        razorpayPaymentId,
        orderId: order.id,
        amountPaise: payment.currency === 'INR' ? payment.amount : null,
        expectedPaise: amountPaise,
      }).catch((err) => console.error('verify-payment:', err.message));
      return json({ error: 'The payment could not be verified.' }, 400);
    }

    if (payment.status === 'authorized') {
      // Left uncaptured, Razorpay returns the money to the customer
      if (order.order_status === 'cancelled') {
        return json({ error: 'This order was cancelled, so the payment was not taken.' }, 409);
      }
      // Another payment already settled this order: capturing this one would only need a refund.
      // If Razorpay captures it anyway, the webhook raises the usual duplicate-payment alert.
      if (['paid', 'refunded'].includes(order.payment_status) && order.razorpay_payment_id !== razorpayPaymentId) {
        console.warn(`verify-payment: second payment ${razorpayPaymentId} on order ${order.order_number} left uncaptured`);
        return json({ error: 'This order is already paid, so this payment was not taken. Any amount held by your bank is released automatically.', alreadyPaid: true }, 409);
      }
      payment = await capturePayment(razorpayPaymentId, amountPaise);
    }
    if (payment.status === 'refunded') return refundedAnswer();
    if (payment.status !== 'captured') {
      return json({ error: 'The payment is not complete yet.', pending: true }, 409);
    }

    const outcome = await finalizePayment({ razorpayOrderId, razorpayPaymentId, amountPaise: payment.amount });
    const { result } = outcome;
    if (outcome.order_id) await deliverOrderNotifications(outcome.order_id);
    if (result !== 'paid' && result !== 'already_paid') {
      console.error(`verify-payment: ${result} for order ${order.order_number}`);
      return json({ error: 'The payment needs a manual check. Please contact us and do not pay again.', pending: true }, 409);
    }

    // Receipts exist for paid orders only, and a success is never answered without one
    const receipt = await callRpc('get_order_receipt', { p_token: order.receipt_token });
    if (receipt) return json({ verified: true, order: receipt });
    const current = await callRpc('get_payment_order', { p_razorpay_order_id: razorpayOrderId });
    if (current?.payment_status === 'refunded') return refundedAnswer();
    console.error(`verify-payment: no receipt for paid order ${order.order_number}`);
    return json({ error: 'We could not confirm the payment yet.', pending: true }, 502);
  } catch (err) {
    // Temporary failure: the browser may retry, and the webhook completes the order regardless
    console.error('verify-payment:', err.message);
    return json({ error: 'We could not confirm the payment yet.', pending: true }, 502);
  }
}
