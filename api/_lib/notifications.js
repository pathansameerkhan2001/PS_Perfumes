import { callRpc } from './supabaseAdmin.js';
import {
  amountMismatchEmail,
  customerEmail,
  deliveryFailedEmail,
  duplicatePaymentEmail,
  emailEnabled,
  ownerAddress,
  ownerEmail,
  refundNeededEmail,
  sendEmail,
  unknownOrderEmail,
} from './email.js';

const WORKER_BATCH = 20;
const WORKER_LEASE_SECONDS = 120;
const WORKER_PARALLEL = 5;
const ORDER_BATCH = 4;
const ORDER_LEASE_SECONDS = 30;

const CUSTOMER_TYPES = ['customer_receipt', 'customer_paid_after_cancel'];
const OWNER_ORDER_TYPES = ['owner_paid', 'owner_refund_needed'];

// Logs carry ids only, never a customer's details or a provider's response
const logFields = (row) => ({ id: row.id, type: row.notification_type, order: row.razorpay_order_id });

const lookUpOrder = (row) =>
  row.razorpay_order_id ? callRpc('get_payment_order', { p_razorpay_order_id: row.razorpay_order_id }) : null;

/**
 * What to do with a claimed row: { message } to send, { skip } when it no longer applies,
 * { impossible } when it never can be sent, { unconfigured } when a setting is missing.
 */
async function prepare(row) {
  const type = row.notification_type;
  const isCustomer = CUSTOMER_TYPES.includes(type);

  if (!isCustomer && !ownerAddress()) return { unconfigured: 'OWNER_NOTIFICATION_EMAIL is not set' };
  if (type === 'unknown_order') return { message: unknownOrderEmail(row) };

  const order = await lookUpOrder(row);
  if (type === 'duplicate_payment') return { message: duplicatePaymentEmail(row, order) };
  if (type === 'amount_mismatch') return { message: amountMismatchEmail(row, order) };

  if (!order) return { impossible: 'The order no longer exists' };
  if (order.payment_status !== 'paid') return { skip: `Skipped: the order is ${order.payment_status}` };
  if (isCustomer) {
    return order.customer_email ? { message: customerEmail(order) } : { impossible: 'The order has no customer e-mail' };
  }
  const refundNeeded = type === 'owner_refund_needed' || order.order_status === 'cancelled';
  return { message: refundNeeded ? refundNeededEmail(order) : ownerEmail(order) };
}

/**
 * Sent straight to Resend, not through the outbox, so it cannot create another failure to report:
 * one try, then only the log line in failRow remains.
 */
async function alertOwnerOfFailure(row, reason) {
  if (!emailEnabled() || !ownerAddress()) return;
  try {
    await sendEmail({ ...deliveryFailedEmail(row, reason), idempotencyKey: `failed/${row.id}` });
  } catch (err) {
    console.error('notification_failure_alert_failed', { ...logFields(row), reason: err.message });
  }
}

/** When this call itself throws, the lease runs out and the row is recovered later. */
async function failRow(row, error, { retryAfter = null, permanent = false, consumeAttempt = true, alert = true } = {}) {
  let status;
  try {
    status = await callRpc('fail_notification', {
      p_id: row.id,
      p_lease_token: row.lease_token,
      p_error: error,
      p_retry_after_seconds: retryAfter,
      p_permanent: permanent,
      p_consume_attempt: consumeAttempt,
    });
  } catch (err) {
    console.error('notification_not_updated', { ...logFields(row), reason: err.message });
    return 'unconfirmed';
  }
  if (status === null) return 'lease_lost';
  if (status === 'pending') return 'retrying';

  if (!alert) return 'skipped';
  console.error('notification_failed', { ...logFields(row), reason: error });
  await alertOwnerOfFailure(row, error);
  return 'failed';
}

/** Never throws, so one row cannot stop the others. */
async function deliver(row) {
  let plan;
  try {
    plan = await prepare(row);
  } catch (err) {
    console.error('notification_not_prepared', { ...logFields(row), reason: err.message });
    return failRow(row, 'The order could not be read');
  }

  if (plan.unconfigured) {
    console.warn('notification_not_configured', { ...logFields(row), reason: plan.unconfigured });
    return failRow(row, plan.unconfigured, { consumeAttempt: false });
  }
  if (plan.skip) return failRow(row, plan.skip, { permanent: true, alert: false });
  if (plan.impossible) return failRow(row, plan.impossible, { permanent: true });

  let resendId;
  try {
    resendId = await sendEmail({ ...plan.message, idempotencyKey: row.dedupe_key });
  } catch (err) {
    if (err.kind === 'config') console.error('notification_rejected_by_settings', { ...logFields(row), reason: err.message });
    return failRow(row, err.message, {
      retryAfter: err.retryAfter,
      permanent: err.kind === 'permanent',
      consumeAttempt: err.kind !== 'config',
    });
  }

  // Resend has accepted it, so nothing here may report a failed send. If this does not land, the
  // lease runs out and the retry gets the same answer from Resend through dedupe_key.
  try {
    const completed = await callRpc('complete_notification', {
      p_id: row.id,
      p_lease_token: row.lease_token,
      p_resend_id: resendId,
    });
    return completed ? 'sent' : 'lease_lost';
  } catch (err) {
    console.error('notification_not_updated', { ...logFields(row), reason: err.message });
    return 'unconfirmed';
  }
}

/**
 * Sends what is due for one order, straight after a payment. Never throws, because a mail problem
 * must not change a verified payment; whatever is not sent here stays stored for the worker.
 */
export async function deliverOrderNotifications(orderId) {
  if (!emailEnabled()) {
    console.warn('Order e-mails left for later: RESEND_API_KEY or EMAIL_FROM is not set');
    return;
  }
  try {
    const rows = await callRpc('claim_notifications', {
      p_limit: ORDER_BATCH,
      p_lease_seconds: ORDER_LEASE_SECONDS,
      p_order_id: orderId,
    });
    await Promise.all(rows.map(deliver));
  } catch (err) {
    console.error('notifications_not_claimed', { reason: err.message });
  }
}

/** One bounded worker run. Expired leases are recovered by the claim itself. */
export async function processDueNotifications() {
  const rows = await callRpc('claim_notifications', {
    p_limit: WORKER_BATCH,
    p_lease_seconds: WORKER_LEASE_SECONDS,
  });
  const summary = { claimed: rows.length, sent: 0, retrying: 0, failed: 0, skipped: 0, lease_lost: 0, unconfirmed: 0 };
  for (let i = 0; i < rows.length; i += WORKER_PARALLEL) {
    const results = await Promise.all(rows.slice(i, i + WORKER_PARALLEL).map(deliver));
    for (const result of results) summary[result] += 1;
  }
  return summary;
}
