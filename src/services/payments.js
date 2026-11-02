/*
 * Razorpay Standard Checkout, browser side. The secret key never reaches this code: the server
 * creates the order and decides the amount, and only its verification marks an order paid.
 */
const KEY_ID = import.meta.env.VITE_RAZORPAY_KEY_ID;
const CHECKOUT_SCRIPT = 'https://checkout.razorpay.com/v1/checkout.js';
// Longer than the server needs to ask Razorpay twice and save the result
const VERIFY_TIMEOUT_MS = 30000;
const UNCONFIRMED_KEY = 'ps_unconfirmed_payment';

// Online payment is offered only where the public key is configured (see docs/KT/15)
export const onlinePaymentsEnabled = Boolean(KEY_ID);

function pendingError(message) {
  const err = new Error(message);
  err.pending = true;
  return err;
}

/**
 * err.pending means the outcome is unknown: no answer, a timeout, a 5xx, or an answer that is not
 * one of ours (a platform error page). Only a readable 4xx from our API is a definite refusal.
 */
async function postJson(url, body, { timeoutMs = null } = {}) {
  const controller = timeoutMs ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller?.signal,
      });
    } catch {
      // Also a timeout: the abort rejects the request
      throw pendingError('Could not reach the server. Please check your connection and try again.');
    }
    // A timeout while the body is read leaves no data, so it is pending too
    const data = await res.json().catch(() => null);
    const fromApi = data && typeof data === 'object' && (res.ok || typeof data.error === 'string');
    if (!fromApi) throw pendingError('The server gave no clear answer. Please try again.');
    if (!res.ok) {
      const err = new Error(data.error);
      err.pending = Boolean(data.pending) || res.status >= 500;
      err.restart = Boolean(data.restart);
      err.refunded = Boolean(data.refunded);
      throw err;
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

export function createPaymentOrder(request) {
  return postJson('/api/create-order', request);
}

/** Resolves only with a confirmed payment and its receipt; anything less is pending, never paid. */
export async function verifyPayment(response) {
  const data = await postJson('/api/verify-payment', response, { timeoutMs: VERIFY_TIMEOUT_MS });
  if (data.verified !== true || !data.order) throw pendingError('The payment is not confirmed yet.');
  return data;
}

/**
 * A payment that may have succeeded but is not confirmed yet, kept for this tab so a reload still
 * offers Check Payment Status instead of a new order. Pass null to forget it.
 */
export function rememberUnconfirmedPayment(response) {
  try {
    if (response) sessionStorage.setItem(UNCONFIRMED_KEY, JSON.stringify(response));
    else sessionStorage.removeItem(UNCONFIRMED_KEY);
  } catch {}
}

export function getUnconfirmedPayment() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(UNCONFIRMED_KEY) || 'null');
    return saved && /^pay_/.test(saved.razorpay_payment_id) ? saved : null;
  } catch {
    return null;
  }
}

let scriptPromise = null;

// Loaded on the first payment, so the rest of the site never downloads it
function loadCheckoutScript() {
  if (window.Razorpay) return Promise.resolve();
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = CHECKOUT_SCRIPT;
      script.onload = resolve;
      script.onerror = () => {
        scriptPromise = null;
        script.remove();
        reject(new Error('The payment window could not be loaded. Please check your connection and try again.'));
      };
      document.body.appendChild(script);
    });
  }
  return scriptPromise;
}

/**
 * Opens the payment window. Resolves with { status: 'paid', response } or { status: 'dismissed' }.
 * A failed attempt keeps the window open so the shopper can retry there; onFailure reports it.
 */
export async function openCheckout(paymentOrder, onFailure) {
  await loadCheckoutScript();
  return new Promise((resolve) => {
    const checkout = new window.Razorpay({
      key: KEY_ID,
      order_id: paymentOrder.razorpayOrderId,
      amount: paymentOrder.amount,
      currency: paymentOrder.currency,
      name: 'PS PERFUMES',
      description: `Order ${paymentOrder.orderNumber}`,
      prefill: {
        name: paymentOrder.customerName,
        email: paymentOrder.customerEmail,
        contact: paymentOrder.customerPhone,
      },
      theme: { color: '#c8a45d' },
      modal: {
        confirm_close: true,
        ondismiss: () => resolve({ status: 'dismissed' }),
      },
      handler: (response) => resolve({ status: 'paid', response }),
    });
    checkout.on('payment.failed', (res) => onFailure?.(res?.error?.description));
    checkout.open();
  });
}
