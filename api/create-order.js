import { callRpc } from './_lib/supabaseAdmin.js';
import { createRazorpayOrder, newOnlineOrdersAllowed } from './_lib/razorpay.js';
import { json, readJson, toPaise } from './_lib/http.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MIN_AMOUNT_PAISE = 100;

/**
 * Saves the order unpaid and opens a Razorpay order for it. Checkout is guest-only, so there is no
 * sign-in to check; the amount comes from place_order_core and nothing the browser says about
 * money is read. The attempt key makes a retry return the same order and Razorpay order.
 */
export async function POST(request) {
  if (!newOnlineOrdersAllowed()) {
    return json({ error: 'Online payment is not available right now. Please choose Cash on Delivery.' }, 503);
  }

  const body = await readJson(request);
  const { customer, items, couponCode, attemptKey } = body || {};
  if (!customer || typeof customer !== 'object' || !Array.isArray(items) || items.length === 0) {
    return json({ error: 'Your order details are incomplete. Please reload the page and try again.' }, 400);
  }
  if (!UUID.test(String(attemptKey || ''))) {
    return json({ error: 'This checkout has expired. Please reload the page and try again.' }, 400);
  }

  let order;
  try {
    order = await callRpc('place_order_core', {
      p_customer: customer,
      p_items: items,
      p_coupon_code: String(couponCode || '').trim().toUpperCase() || null,
      p_payment_method: 'RAZORPAY',
      p_idempotency_key: attemptKey,
    });
  } catch (err) {
    // P0001: refused by place_order_core, and those messages are written for shoppers
    if (err.code === 'P0001') return json({ error: err.dbMessage }, 400);
    console.error('create-order:', err.message);
    return json({ error: 'Your order could not be saved. Please try again.' }, 500);
  }

  // This attempt was already paid (lost response, or the webhook finished it): never charge again
  if (order.payment_status === 'paid') {
    const receipt = await callRpc('get_order_receipt', { p_token: order.receipt_token }).catch(() => null);
    return json({ alreadyPaid: true, orderNumber: order.order_number, order: receipt });
  }

  // A cancelled or refunded order is never reopened; the browser starts a new attempt instead
  if (order.order_status === 'cancelled' || order.payment_status === 'refunded') {
    return json({ error: 'This order was cancelled. Press Pay Now again to start a new order.', restart: true }, 409);
  }

  const amountPaise = toPaise(order.total_amount);
  if (!Number.isInteger(amountPaise) || amountPaise < MIN_AMOUNT_PAISE) {
    return json({ error: 'Online payment needs a total of at least ₹1. Please choose Cash on Delivery.' }, 400);
  }

  try {
    let razorpayOrderId = order.razorpay_order_id;
    if (!razorpayOrderId) {
      const created = await createRazorpayOrder({
        amountPaise,
        orderNumber: order.order_number,
        orderId: order.order_id,
      });
      // If a concurrent retry attached first, its Razorpay order is the one to use
      razorpayOrderId = await callRpc('attach_razorpay_order', {
        p_order_id: order.order_id,
        p_razorpay_order_id: created.id,
      });
    }
    return json({
      razorpayOrderId,
      amount: amountPaise,
      currency: 'INR',
      orderNumber: order.order_number,
      customerName: order.customer_name,
      customerEmail: order.customer_email,
      customerPhone: order.customer_phone,
    });
  } catch (err) {
    console.error('create-order:', err.message);
    return json({ error: 'The payment could not be started. Please try again.' }, 502);
  }
}
