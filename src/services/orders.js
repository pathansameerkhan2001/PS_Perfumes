import { supabase } from '../lib/supabase';
import { isValidUUID } from './products';
import { dbError, assertRows } from './dbErrors';
import { redeemCoupon } from './coupons';

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

/**
 * Preferred path: place_order() (migration 20261022) prices every line, the shipping fee and
 * the coupon from the database in one transaction. Returns null when the function is not
 * installed yet, so the caller can use the direct insert below.
 */
async function placeOrderOnServer(orderPayload, items) {
  const lines = items.map((it) =>
    isComboItem(it)
      ? { type: 'combo', combo_id: it.product_id || it.product?.id, quantity: Number(it.quantity) }
      : { type: 'variant', variant_id: it.variant_id, quantity: Number(it.quantity) }
  );

  const { data, error } = await supabase.rpc('place_order', {
    p_customer: {
      first_name: orderPayload.firstName,
      last_name: orderPayload.lastName,
      email: orderPayload.email,
      phone: orderPayload.phone,
      address: orderPayload.address,
      city: orderPayload.city,
      state: orderPayload.state,
      pincode: orderPayload.pincode,
      landmark: orderPayload.landmark || '',
    },
    p_items: lines,
    p_coupon_code: String(orderPayload.couponCode || '').trim().toUpperCase() || null,
    p_payment_method: orderPayload.paymentMethod || 'COD',
  });

  if (error) {
    if (error.code === 'PGRST202') return null;
    console.error('place_order failed:', error);
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
    shipping_address: {
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
    created_at: new Date().toISOString(),
    order_items: data.items || [],
  });
  saveLocalOrder(order);
  return { order, error: null };
}

export async function createOrder(orderPayload) {
  const items = (orderPayload.items || []).filter((it) => Number(it.quantity) > 0);
  if (items.length === 0) throw new Error('Your cart is empty.');

  const serverResult = await placeOrderOnServer(orderPayload, items);
  if (serverResult) return serverResult;

  // Legacy path, used only until place_order is installed: prices come from the cart
  const orderId = crypto.randomUUID();
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
    // No payment gateway is integrated: every order starts unpaid until confirmed by the store
    payment_status: 'pending',
    order_status: 'pending',
    notes: couponCode ? `Coupon: ${couponCode}` : null,
  };

  const { error: orderErr } = await supabase.from('orders').insert([orderRow]);
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
  return { order, error: null };
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
