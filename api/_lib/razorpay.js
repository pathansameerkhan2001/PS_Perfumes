import crypto from 'node:crypto';

const API_URL = 'https://api.razorpay.com/v1';

// Both come from server-only variables; neither may ever have a VITE_ prefix
function credentials() {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) throw new Error('Razorpay is not configured on the server');
  return { keyId, keySecret };
}

/** Test keys never serve real customers, and live keys never take money on a Preview. */
export function onlinePaymentsAvailable() {
  const keyId = process.env.RAZORPAY_KEY_ID || '';
  if (!keyId || !process.env.RAZORPAY_KEY_SECRET) return false;
  const isProduction = process.env.VERCEL_ENV === 'production';
  return keyId.startsWith(isProduction ? 'rzp_live_' : 'rzp_test_');
}

/**
 * Kill switch: blocks new Razorpay orders only. Verification and the webhook do not read it, so
 * payments already under way still complete while they are reconciled.
 */
export function newOnlineOrdersAllowed() {
  return onlinePaymentsAvailable() && process.env.RAZORPAY_NEW_ORDERS_DISABLED !== 'true';
}

async function razorpayRequest(path, { method = 'GET', body } = {}) {
  const { keyId, keySecret } = credentials();
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(8000),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(`Razorpay ${res.status}: ${data?.error?.description || 'request failed'}`);
  }
  return data;
}

export function createRazorpayOrder({ amountPaise, orderNumber, orderId }) {
  return razorpayRequest('/orders', {
    method: 'POST',
    body: {
      amount: amountPaise,
      currency: 'INR',
      receipt: orderNumber,
      notes: { order_id: orderId, order_number: orderNumber },
    },
  });
}

export function fetchPayment(paymentId) {
  return razorpayRequest(`/payments/${encodeURIComponent(paymentId)}`);
}

export function capturePayment(paymentId, amountPaise) {
  return razorpayRequest(`/payments/${encodeURIComponent(paymentId)}/capture`, {
    method: 'POST',
    body: { amount: amountPaise, currency: 'INR' },
  });
}

function signaturesMatch(expected, received) {
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(String(received || ''), 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function isValidPaymentSignature({ razorpayOrderId, razorpayPaymentId, signature }) {
  const expected = crypto
    .createHmac('sha256', credentials().keySecret)
    .update(`${razorpayOrderId}|${razorpayPaymentId}`)
    .digest('hex');
  return signaturesMatch(expected, signature);
}

/** rawBody must be the exact text Razorpay sent: re-serialised JSON would not match. */
export function isValidWebhookSignature(rawBody, signature) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) throw new Error('RAZORPAY_WEBHOOK_SECRET is not configured');
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  return signaturesMatch(expected, signature);
}
