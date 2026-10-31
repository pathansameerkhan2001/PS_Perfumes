import { callRpc } from './supabaseAdmin.js';
import { sendDuplicatePaymentAlert, sendPaidOrderEmails } from './email.js';

/**
 * Shared by /api/verify-payment and /api/razorpay-webhook, whichever arrives first. Call it only
 * with a payment Razorpay reports as captured. mark_order_paid decides the outcome under a row
 * lock and each e-mail is claimed once, so repeating this for one payment changes nothing.
 */
export async function finalizePayment({ razorpayOrderId, razorpayPaymentId, amountPaise }) {
  const outcome = await callRpc('mark_order_paid', {
    p_razorpay_order_id: razorpayOrderId,
    p_razorpay_payment_id: razorpayPaymentId,
    p_amount_paise: amountPaise,
  });

  if (outcome.result === 'paid' || outcome.result === 'already_paid') {
    await sendPaidOrderEmails(razorpayOrderId);
  } else if (outcome.result === 'duplicate_payment' && outcome.new_flag) {
    await sendDuplicatePaymentAlert({ orderNumber: outcome.order_number, razorpayPaymentId });
  } else if (outcome.result === 'amount_mismatch') {
    console.error(`Amount mismatch on Razorpay order ${razorpayOrderId}, payment ${razorpayPaymentId}`);
  }
  return outcome.result;
}
