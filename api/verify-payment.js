import { callRpc } from './_lib/supabaseAdmin.js';
import { capturePayment, fetchPayment, isValidPaymentSignature } from './_lib/razorpay.js';
import { finalizePayment } from './_lib/finalizePayment.js';
import { json, readJson, toPaise } from './_lib/http.js';

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
      return json({ error: 'The payment could not be verified.' }, 400);
    }

    if (payment.status === 'authorized') {
      // Left uncaptured, Razorpay returns the money to the customer
      if (order.order_status === 'cancelled') {
        return json({ error: 'This order was cancelled, so the payment was not taken.' }, 409);
      }
      payment = await capturePayment(razorpayPaymentId, amountPaise);
    }
    if (payment.status !== 'captured') {
      return json({ error: 'The payment is not complete yet.', pending: true }, 409);
    }

    const result = await finalizePayment({ razorpayOrderId, razorpayPaymentId, amountPaise });
    if (result !== 'paid' && result !== 'already_paid') {
      console.error(`verify-payment: ${result} for order ${order.order_number}`);
      return json({ error: 'The payment needs a manual check. Please contact us and do not pay again.', pending: true }, 409);
    }

    const receipt = await callRpc('get_order_receipt', { p_token: order.receipt_token });
    return json({ verified: true, order: receipt });
  } catch (err) {
    // Temporary failure: the browser may retry, and the webhook completes the order regardless
    console.error('verify-payment:', err.message);
    return json({ error: 'We could not confirm the payment yet.', pending: true }, 502);
  }
}
