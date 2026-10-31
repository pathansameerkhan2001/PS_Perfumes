import { supabase } from '../lib/supabase';
import { isValidUUID } from './products';
import { dbError, assertRows } from './dbErrors';
import { redeemCoupon } from './coupons';
import { getComboById, getComboAvailability } from './combos';

/*
 * Live schema (verified 2026-10-19):
 *   orders      (id, order_number, customer_id, customer_name, customer_email, customer_phone,
 *                shipping_address, subtotal, shipping_amount, discount_amount, total_amount,
 *                payment_method, payment_status, order_status, notes, created_at, updated_at)
 *   order_items (id, order_id, product_id, variant_id, product_name, bottle_type, size_ml,
 *                quantity, unit_price, total_price)
 *
 * Orders are created by the place_order() database function (migration 20261022), which
 * prices them from the database. Until it is installed, the legacy direct insert is used:
 * anonymous shoppers can INSERT orders but cannot read them back (RLS), so the order id is
 * generated in the browser and the insert does not request the row back. A copy of the
 * shopper's own order is kept in their browser so /track-order can show it on that device.
 */

const LOCAL_ORDERS_KEY = 'ps_my_orders';

function getLocalOrders() {
  try {
    const parsed = JSON.parse(localStorage.getItem(LOCAL_ORDERS_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveLocalOrder(order) {
  try {
    const list = getLocalOrders().filter((o) => o.id !== order.id);
    localStorage.setItem(LOCAL_ORDERS_KEY, JSON.stringify([order, ...list].slice(0, 20)));
  } catch {}
}

function formatOrder(ord) {
  return {
    ...ord,
    total: Number(ord.total_amount ?? ord.total) || 0,
    subtotal: Number(ord.subtotal) || 0,
    shipping_fee: Number(ord.shipping_amount ?? ord.shipping_fee) || 0,
    discount: Number(ord.discount_amount ?? ord.discount) || 0,
    email: ord.customer_email || ord.shipping_address?.email || ord.email || '',
    phone: ord.customer_phone || ord.shipping_address?.phone || ord.phone || '',
    items: (ord.order_items || ord.items || []).map((it) => ({
      ...it,
      price: Number(it.unit_price ?? it.price) || 0,
      total: Number(it.total_price ?? it.total) || 0,
      size: [it.bottle_type, it.size_ml || it.size].filter(Boolean).join(' · '),
    })),
  };
}

/** Admin: all orders from the database (no demo data). */
export async function getOrders() {
  const { data, error } = await supabase
    .from('orders')
    .select('*, order_items(*)')
    .order('created_at', { ascending: false });
  if (error) throw dbError('Could not load orders', error);
  return (data || []).map(formatOrder);
}

/**
 * Track order. Admins can read any order; anonymous shoppers cannot read orders under RLS,
 * so for them only orders placed from this browser are found.
 */
export async function getOrderByNumber(orderNumber) {
  if (!orderNumber) return null;
  const clean = orderNumber.trim();
  const cleanUpper = clean.toUpperCase();

  const { data, error } = await supabase
    .from('orders')
    .select('*, order_items(*)')
    .eq('order_number', cleanUpper)
    .maybeSingle();
  if (!error && data) return formatOrder(data);

  const local = getLocalOrders().find(
    (o) => o.order_number?.toUpperCase() === cleanUpper || o.email?.toLowerCase() === clean.toLowerCase()
  );
  return local ? formatOrder(local) : null;
}

function newOrderNumber() {
  const bytes = new Uint32Array(1);
  crypto.getRandomValues(bytes);
  return `PS-${String(100000 + (bytes[0] % 900000))}`;
}

function isComboItem(it) {
  return it.product?.category === 'Combo Pack' || String(it.variant_id || '').startsWith('combo-');
}

/*
 * Checkout attempt key (idempotency). One random key per checkout attempt, kept in
 * sessionStorage while the bag and coupon stay the same, so a retry after a lost response
 * (or a page reload) sends the same key and place_order returns the order already saved
 * instead of creating a second one (migration 08). A different bag, coupon or payment method
 * starts a new attempt; the key is cleared once an order is confirmed. An online attempt also
 * ends when the delivery details change: a shopper may cancel the payment and correct the
 * address, and the replay must not return the order with the old one.
 */
const ATTEMPT_KEY = 'ps_checkout_attempt';

function attemptSignature(items, couponCode, paymentMethod, customer) {
  return JSON.stringify({
    lines: items
      .map((it) => [isComboItem(it) ? `c:${it.product_id || it.product?.id}` : `v:${it.variant_id}`, Number(it.quantity)])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    coupon: String(couponCode || '').trim().toUpperCase(),
    method: paymentMethod || 'COD',
    customer: paymentMethod === 'RAZORPAY' ? customer : null,
  });
}

/**
 * Returns { key, isRetry }: the saved key when this bag + coupon was already sent to the
 * server (isRetry), otherwise a new key that is saved only when it is sent (rememberAttempt).
 */
function getAttemptKey(signature) {
  try {
    const saved = JSON.parse(sessionStorage.getItem(ATTEMPT_KEY) || 'null');
    if (saved && saved.signature === signature && isValidUUID(saved.key)) return { key: saved.key, isRetry: true };
  } catch {}
  return { key: crypto.randomUUID(), isRetry: false };
}

function rememberAttempt(key, signature) {
  try {
    sessionStorage.setItem(ATTEMPT_KEY, JSON.stringify({ key, signature }));
  } catch {}
}

function clearAttemptKey() {
  try {
    sessionStorage.removeItem(ATTEMPT_KEY);
  } catch {}
}

function toOrderLines(items) {
  return items.map((it) =>
    isComboItem(it)
      ? { type: 'combo', combo_id: it.product_id || it.product?.id, quantity: Number(it.quantity) }
      : { type: 'variant', variant_id: it.variant_id, quantity: Number(it.quantity) }
  );
}

function toCustomer(orderPayload) {
  return {
    first_name: orderPayload.firstName,
    last_name: orderPayload.lastName,
    email: orderPayload.email,
    phone: orderPayload.phone,
    address: orderPayload.address,
    city: orderPayload.city,
    state: orderPayload.state,
    pincode: orderPayload.pincode,
    landmark: orderPayload.landmark || '',
  };
}

/**
 * Preferred path: place_order() (migration 20261022) prices every line, the shipping fee and
 * the coupon from the database in one transaction. Returns null when the function is not
 * installed yet, so the caller can use the direct insert below.
 */
async function placeOrderOnServer(orderPayload, items, attemptKey) {
  const params = {
    p_customer: toCustomer(orderPayload),
    p_items: toOrderLines(items),
    p_coupon_code: String(orderPayload.couponCode || '').trim().toUpperCase() || null,
    p_payment_method: orderPayload.paymentMethod || 'COD',
  };

  // With migration 08 the attempt key makes retries safe. Before 08 the function has no
  // p_idempotency_key parameter (PGRST202), so the call is repeated without it.
  let { data, error } = await supabase.rpc('place_order', { ...params, p_idempotency_key: attemptKey });
  if (error?.code === 'PGRST202') {
    ({ data, error } = await supabase.rpc('place_order', params));
  }

  if (error) {
    if (error.code === 'PGRST202') return null;
    console.error('place_order failed:', error);
    // P0001 = place_order refused the order (its transaction saved nothing): a new attempt may start
    if (error.code === 'P0001') clearAttemptKey();
    // Validation messages raised by place_order are written for shoppers
    throw new Error(error.code === 'P0001' ? error.message : `Your order could not be placed (${error.message}). Please try again or contact us on WhatsApp.`);
  }
  if (!data?.order_number) {
    throw new Error('The order was not confirmed by the server. Please try again or contact us on WhatsApp.');
  }

  const order = formatOrder({
    id: data.order_id,
    order_number: data.order_number,
    customer_name: data.customer_name,
    customer_email: data.customer_email,
    customer_phone: data.customer_phone,
    // Migration 08 returns the stored address (on a retry it may differ from the form)
    shipping_address: data.shipping_address || {
      address: orderPayload.address,
      city: orderPayload.city,
      state: orderPayload.state,
      pincode: orderPayload.pincode,
      landmark: orderPayload.landmark || '',
      email: data.customer_email,
      phone: data.customer_phone,
    },
    subtotal: data.subtotal,
    shipping_amount: data.shipping_amount,
    discount_amount: data.discount_amount,
    total_amount: data.total_amount,
    payment_method: data.payment_method,
    payment_status: data.payment_status,
    order_status: data.order_status,
    created_at: data.created_at || new Date().toISOString(),
    order_items: data.items || [],
  });
  saveLocalOrder(order);
  return { order, error: null };
}

/**
 * Re-checks combo lines against the database just before ordering: the combo must still be
 * purchasable (active, priced, all products available) and have stock for the quantity.
 * This catches changes made after the combo was added to the bag. place_order enforces the same
 * rules on the server once supabase/new-project/08_checkout_hardening.sql is applied.
 */
async function revalidateComboLines(items) {
  const comboLines = items.filter(isComboItem);
  for (const line of comboLines) {
    const comboId = line.product_id || line.product?.id;
    const name = line.name || line.product?.name || 'A combo';
    let combo = null;
    try {
      combo = isValidUUID(comboId) ? await getComboById(comboId) : null;
    } catch (err) {
      throw new Error(`Could not check the availability of "${name}" (${err.message}). Please try again.`);
    }
    if (!combo) {
      throw new Error(`"${name}" is no longer available. Please remove it from your bag.`);
    }
    const availability = getComboAvailability(combo);
    if (!availability.purchasable) {
      throw new Error(`"${name}" is no longer available (${availability.message}) Please remove it from your bag.`);
    }
    if (Number(line.quantity) > Number(combo.stock_quantity)) {
      throw new Error(`Only ${combo.stock_quantity} of "${name}" available. Please reduce the quantity in your bag.`);
    }
  }
}

export async function createOrder(orderPayload) {
  const items = (orderPayload.items || []).filter((it) => Number(it.quantity) > 0);
  if (items.length === 0) throw new Error('Your cart is empty.');

  const signature = attemptSignature(items, orderPayload.couponCode, 'COD');
  const { key: attemptKey, isRetry } = getAttemptKey(signature);

  // On a retry of the same attempt the server decides (it may return the order already saved)
  if (!isRetry) await revalidateComboLines(items);
  // From here on the attempt may reach the database: keep its key for a retry
  rememberAttempt(attemptKey, signature);

  const serverResult = await placeOrderOnServer(orderPayload, items, attemptKey);
  if (serverResult) {
    clearAttemptKey();
    return serverResult;
  }

  // Legacy path, used only until place_order is installed: prices come from the cart.
  // The attempt key is the order id, so a retry of the same attempt cannot insert a second order.
  // Nothing on the server checks combos on this path, so the app check always runs here.
  if (isRetry) await revalidateComboLines(items);
  const orderId = attemptKey;
  const orderNumber = newOrderNumber();
  const customerName = `${orderPayload.firstName || ''} ${orderPayload.lastName || ''}`.trim();

  // Each line uses the price of the variant the shopper actually selected
  const itemRows = items.map((it) => {
    const unitPrice = Number(it.price ?? it.product?.price) || 0;
    const quantity = Math.max(1, Number(it.quantity) || 1);
    const isCombo = isComboItem(it);
    return {
      order_id: orderId,
      product_id: !isCombo && isValidUUID(it.product_id || it.product?.id) ? (it.product_id || it.product?.id) : null,
      variant_id: !isCombo && isValidUUID(it.variant_id) ? it.variant_id : null,
      product_name: it.name || it.product?.name || 'Product',
      bottle_type: it.bottle_type || null,
      size_ml: it.size_ml || it.size || null,
      quantity,
      unit_price: unitPrice,
      total_price: unitPrice * quantity,
    };
  });

  const subtotal = itemRows.reduce((sum, r) => sum + r.total_price, 0);
  const shipping = Number(orderPayload.shipping) || 0;
  const couponCode = String(orderPayload.couponCode || '').trim().toUpperCase();
  // A discount is only recorded together with the coupon that produced it, and never exceeds the subtotal
  const discount = couponCode ? Math.min(subtotal, Math.max(0, Number(orderPayload.discountAmount) || 0)) : 0;
  const total = Math.max(0, subtotal - discount + shipping);

  const shippingAddress = {
    address: orderPayload.address,
    city: orderPayload.city,
    state: orderPayload.state,
    pincode: orderPayload.pincode,
    landmark: orderPayload.landmark || '',
    email: orderPayload.email,
    phone: orderPayload.phone,
  };

  const orderRow = {
    id: orderId,
    order_number: orderNumber,
    customer_name: customerName,
    customer_email: orderPayload.email,
    customer_phone: orderPayload.phone,
    shipping_address: shippingAddress,
    subtotal,
    shipping_amount: shipping,
    discount_amount: discount,
    total_amount: total,
    payment_method: orderPayload.paymentMethod || 'COD',
    // Every order starts unpaid; only a verified Razorpay payment changes this on the server
    payment_status: 'pending',
    order_status: 'pending',
    notes: couponCode ? `Coupon: ${couponCode}` : null,
  };

  const { error: orderErr } = await supabase.from('orders').insert([orderRow]);
  if (orderErr?.code === '23505' && /orders_pkey/.test(`${orderErr.message} ${orderErr.details || ''}`)) {
    // This attempt's order was already saved (the earlier response was lost)
    clearAttemptKey();
    throw new Error(
      'This order was already received. Please do not place it again — check your e-mail or contact us on WhatsApp with your details.'
    );
  }
  if (orderErr) {
    console.error('Order insert failed:', orderErr);
    throw new Error(`Your order could not be placed (${orderErr.message}). Please try again or contact us on WhatsApp.`);
  }

  const { error: itemsErr } = await supabase.from('order_items').insert(itemRows);
  if (itemsErr) {
    console.error('Order items insert failed:', itemsErr);
    throw new Error(
      `Order ${orderNumber} was received but its item list could not be saved (${itemsErr.message}). Please contact us with this order number.`
    );
  }

  if (couponCode && discount > 0) {
    // Counts one use of the coupon; a failure here does not affect the stored order
    await redeemCoupon(couponCode, orderId);
  }

  const order = formatOrder({
    ...orderRow,
    created_at: new Date().toISOString(),
    order_items: itemRows,
  });
  saveLocalOrder(order);
  clearAttemptKey();
  return { order, error: null };
}

/**
 * The request body for /api/create-order: what is being bought, never what it costs. The key
 * stays saved after a cancelled or failed payment, so paying again reuses the same order.
 */
export async function prepareOnlineOrder(orderPayload) {
  const items = (orderPayload.items || []).filter((it) => Number(it.quantity) > 0);
  if (items.length === 0) throw new Error('Your cart is empty.');

  const customer = toCustomer(orderPayload);
  const signature = attemptSignature(items, orderPayload.couponCode, 'RAZORPAY', customer);
  const { key: attemptKey, isRetry } = getAttemptKey(signature);
  if (!isRetry) await revalidateComboLines(items);
  rememberAttempt(attemptKey, signature);

  return {
    customer,
    items: toOrderLines(items),
    couponCode: String(orderPayload.couponCode || '').trim().toUpperCase(),
    attemptKey,
  };
}

/** The saved order of this attempt was cancelled: the next Pay Now starts a new order. */
export function resetOnlineAttempt() {
  clearAttemptKey();
}

/** A paid order, as returned by the server: ends the attempt and keeps it for /track-order. */
export function completeOnlineOrder(receipt) {
  clearAttemptKey();
  const order = formatOrder(receipt);
  saveLocalOrder({ ...order, id: receipt.order_number });
  return order;
}

/** An unpaid Razorpay order is a checkout in progress, not an order to fulfil. */
export function isAwaitingPayment(order) {
  return order?.payment_method === 'RAZORPAY' && ['pending', 'failed'].includes(order?.payment_status);
}

export async function updateOrderStatus(orderId, status) {
  const { data, error } = await supabase
    .from('orders')
    .update({ order_status: status, updated_at: new Date().toISOString() })
    .eq('id', orderId)
    .select('id');
  if (error) throw dbError('Order status was not updated', error);
  assertRows(data, 'Order status was not updated');
  return { success: true };
}
