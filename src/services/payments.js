/*
 * Razorpay Standard Checkout, browser side. The secret key never reaches this code: the server
 * creates the order and decides the amount, and only its verification marks an order paid.
 */
const KEY_ID = import.meta.env.VITE_RAZORPAY_KEY_ID;
const CHECKOUT_SCRIPT = 'https://checkout.razorpay.com/v1/checkout.js';

// Online payment is offered only where the public key is configured (see docs/KT/15)
export const onlinePaymentsEnabled = Boolean(KEY_ID);

async function postJson(url, body) {
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    const err = new Error('Could not reach the server. Please check your connection and try again.');
    err.pending = true;
    throw err;
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const err = new Error(data?.error || 'Something went wrong. Please try again.');
    err.pending = Boolean(data?.pending);
    err.restart = Boolean(data?.restart);
    throw err;
  }
  return data;
}

export function createPaymentOrder(request) {
  return postJson('/api/create-order', request);
}

export function verifyPayment(response) {
  return postJson('/api/verify-payment', response);
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
