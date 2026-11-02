import { callRpc } from './supabaseAdmin.js';

const ORDER_ID = /^order_[A-Za-z0-9]{1,58}$/;
const PAYMENT_ID = /^pay_[A-Za-z0-9]{1,60}$/;

const isAmount = (value) => Number.isSafeInteger(value) && value > 0;

export function isValidPaymentInput({ razorpayOrderId, razorpayPaymentId, amountPaise }) {
  return ORDER_ID.test(String(razorpayOrderId)) && PAYMENT_ID.test(String(razorpayPaymentId)) && isAmount(amountPaise);
}

/**
 * Shared by /api/verify-payment and /api/razorpay-webhook, whichever arrives first. Call it only
 * with a payment Razorpay reports as captured, and with the amount Razorpay reports. The payment
 * result and its notifications are saved in one transaction, so repeating this for one payment
 * changes nothing. Returns the outcome: result, notifications_queued and, usually, order_id.
 */
export async function finalizePayment({ razorpayOrderId, razorpayPaymentId, amountPaise }) {
  // mark_order_paid would pass a null amount, so nothing unchecked reaches the database
  if (!isValidPaymentInput({ razorpayOrderId, razorpayPaymentId, amountPaise })) {
    const err = new Error('Invalid payment data');
    err.code = 'INVALID_PAYMENT_DATA';
    throw err;
  }
  return callRpc('finalize_payment_and_enqueue', {
    p_razorpay_order_id: razorpayOrderId,
    p_razorpay_payment_id: razorpayPaymentId,
    p_amount_paise: amountPaise,
  });
}

/**
 * A payment that cannot be finalized: stored as an owner alert, or only logged when its payment id
 * is unusable, because the outbox needs that id. Temporary database failures throw, so the caller
 * can have the event delivered again; refused data does not, because retrying cannot help.
 * amount_mismatch is the closest alert type Migration 10 has, for every kind of mismatch.
 * Returns true when the alert is stored, including one stored by an earlier delivery.
 */
export async function recordPaymentIncident({ reason, razorpayOrderId, razorpayPaymentId, orderId = null, amountPaise, expectedPaise }) {
  const orderIdOk = ORDER_ID.test(String(razorpayOrderId));
  const paymentIdOk = PAYMENT_ID.test(String(razorpayPaymentId));
  console.error('payment_incident', {
    reason,
    razorpayOrderId: orderIdOk ? razorpayOrderId : '[invalid]',
    razorpayPaymentId: paymentIdOk ? razorpayPaymentId : '[invalid]',
  });
  if (!paymentIdOk) return false;

  try {
    await callRpc('enqueue_payment_alert', {
      p_notification_type: 'amount_mismatch',
      p_razorpay_payment_id: razorpayPaymentId,
      p_razorpay_order_id: orderIdOk ? razorpayOrderId : null,
      p_order_id: orderId,
      p_amount_paise: isAmount(amountPaise) ? amountPaise : null,
      p_expected_paise: isAmount(expectedPaise) ? expectedPaise : null,
    });
    return true;
  } catch (err) {
    if (err.code !== 'P0001') throw err;
    console.error('payment_incident_not_stored', { reason, code: err.code });
    return false;
  }
}
