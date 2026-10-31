import { callRpc } from './supabaseAdmin.js';

const OWNER_EMAIL = process.env.OWNER_NOTIFICATION_EMAIL;

const siteUrl = () => (process.env.SITE_URL || 'https://psperfumes.com').replace(/\/+$/, '');

const rupees = (amount) => `₹${Number(amount || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

// Names and addresses are typed by shoppers
const esc = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function emailEnabled() {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

async function sendEmail({ to, subject, html }) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: process.env.EMAIL_FROM, to, subject, html }),
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text().catch(() => '')}`);
}

function itemRows(order) {
  return (order.items || [])
    .map(
      (it) => `<tr>
        <td style="padding:8px 0;border-bottom:1px solid #e5e0d8">
          ${esc(it.product_name)}<br>
          <small>${esc([it.bottle_type, it.size_ml].filter(Boolean).join(' · '))} · Qty ${esc(it.quantity)}</small>
        </td>
        <td style="padding:8px 0;border-bottom:1px solid #e5e0d8;text-align:right">${rupees(it.total_price)}</td>
      </tr>`
    )
    .join('');
}

function totalsRows(order) {
  const line = (label, value) =>
    `<tr><td style="padding:4px 0">${label}</td><td style="padding:4px 0;text-align:right">${value}</td></tr>`;
  return [
    line('Subtotal', rupees(order.subtotal)),
    Number(order.discount_amount) > 0 ? line('Discount', `-${rupees(order.discount_amount)}`) : '',
    line('Shipping', Number(order.shipping_amount) > 0 ? rupees(order.shipping_amount) : 'FREE'),
    line('<strong>Total paid</strong>', `<strong>${rupees(order.total_amount)}</strong>`),
  ].join('');
}

function addressLine(order) {
  const a = order.shipping_address || {};
  return [a.address, a.landmark, a.city, a.state, a.pincode].filter(Boolean).map(esc).join(', ');
}

const layout = (body) =>
  `<div style="font-family:Georgia,'Times New Roman',serif;color:#1a1714;max-width:560px;margin:0 auto;padding:24px">
    <h1 style="font-size:20px;letter-spacing:0.08em;margin:0 0 16px">PS PERFUMES</h1>
    ${body}
  </div>`;

function customerEmail(order) {
  if (order.order_status === 'cancelled') {
    return {
      to: order.customer_email,
      subject: `Payment received for cancelled order ${order.order_number}`,
      html: layout(`
        <p>Dear ${esc(order.customer_name)},</p>
        <p>We received your payment for order ${esc(order.order_number)}, but this order had already
        been cancelled, so it will not be dispatched. We will refund your payment and contact you.</p>
        <p><strong>Razorpay payment ID:</strong> ${esc(order.razorpay_payment_id)}</p>
      `),
    };
  }
  return {
    to: order.customer_email,
    subject: `Payment received for order ${order.order_number}`,
    html: layout(`
      <p>Dear ${esc(order.customer_name)},</p>
      <p>Thank you. We have received your payment and your order is confirmed.</p>
      <p>
        <strong>Order:</strong> ${esc(order.order_number)}<br>
        <strong>Razorpay payment ID:</strong> ${esc(order.razorpay_payment_id)}<br>
        <strong>Deliver to:</strong> ${addressLine(order)}
      </p>
      <table style="width:100%;border-collapse:collapse;font-size:14px">${itemRows(order)}</table>
      <table style="width:100%;border-collapse:collapse;font-size:14px;margin-top:8px">${totalsRows(order)}</table>
      <p><a href="${siteUrl()}/receipt/${esc(order.receipt_token)}">View or print your receipt</a></p>
      <p>Keep your order number to follow it on our <a href="${siteUrl()}/track-order">Track Order</a> page.</p>
    `),
  };
}

function ownerEmail(order) {
  return {
    to: OWNER_EMAIL,
    subject:
      order.order_status === 'cancelled'
        ? `Refund needed: payment on cancelled order ${order.order_number}`
        : `New paid order ${order.order_number} (${rupees(order.total_amount)})`,
    html: layout(`
      <p><strong>New paid order: ${esc(order.order_number)}</strong></p>
      <p>
        <strong>Customer:</strong> ${esc(order.customer_name)}<br>
        <strong>Email:</strong> ${esc(order.customer_email)}<br>
        <strong>Phone:</strong> ${esc(order.customer_phone)}<br>
        <strong>Deliver to:</strong> ${addressLine(order)}
      </p>
      <table style="width:100%;border-collapse:collapse;font-size:14px">${itemRows(order)}</table>
      <table style="width:100%;border-collapse:collapse;font-size:14px;margin-top:8px">${totalsRows(order)}</table>
      <p>
        <strong>Payment status:</strong> ${esc(String(order.payment_status).toUpperCase())}<br>
        <strong>Razorpay payment ID:</strong> ${esc(order.razorpay_payment_id)}<br>
        <strong>Razorpay order ID:</strong> ${esc(order.razorpay_order_id)}
      </p>
      ${order.payment_error ? `<p><strong>Needs review:</strong> ${esc(order.payment_error)}</p>` : ''}
      <p><a href="${siteUrl()}/admin/orders">Open Admin → Orders</a></p>
    `),
  };
}

async function sendOnce(order, kind, message) {
  const claimed = await callRpc('claim_order_email', { p_order_id: order.id, p_kind: kind });
  if (!claimed) return;
  try {
    await sendEmail(message);
  } catch (err) {
    console.error(`${kind} e-mail failed for ${order.order_number}:`, err.message);
    await callRpc('release_order_email', { p_order_id: order.id, p_kind: kind });
  }
}

/** Never throws: a mail problem must not turn a successful payment into an error. */
export async function sendPaidOrderEmails(razorpayOrderId) {
  if (!emailEnabled()) {
    console.warn('Order e-mails skipped: RESEND_API_KEY or EMAIL_FROM is not set');
    return;
  }
  try {
    const order = await callRpc('get_payment_order', { p_razorpay_order_id: razorpayOrderId });
    if (!order || order.payment_status !== 'paid') return;
    await Promise.all([
      sendOnce(order, 'customer', customerEmail(order)),
      ...(OWNER_EMAIL ? [sendOnce(order, 'owner', ownerEmail(order))] : []),
    ]);
  } catch (err) {
    console.error('Order e-mails failed:', err.message);
  }
}

/** Alerts the owner to refund a second payment on an order that was already paid. */
export async function sendDuplicatePaymentAlert({ orderNumber, razorpayPaymentId }) {
  if (!emailEnabled() || !OWNER_EMAIL) return;
  try {
    await sendEmail({
      to: OWNER_EMAIL,
      subject: `Refund needed: second payment on order ${orderNumber}`,
      html: layout(`
        <p>Order <strong>${esc(orderNumber)}</strong> was already paid, and a second payment was captured:
        <strong>${esc(razorpayPaymentId)}</strong>.</p>
        <p>The order keeps its first payment. Please refund this one in the Razorpay dashboard.</p>
      `),
    });
  } catch (err) {
    console.error('Duplicate payment alert failed:', err.message);
  }
}
