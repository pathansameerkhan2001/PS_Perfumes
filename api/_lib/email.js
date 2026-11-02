export const ownerAddress = () => process.env.OWNER_NOTIFICATION_EMAIL;

const siteUrl = () => (process.env.SITE_URL || 'https://psperfumes.com').replace(/\/+$/, '');

const rupees = (amount) => `₹${Number(amount || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

// Names and addresses are typed by shoppers
const esc = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const paise = (amount) => rupees(Number(amount) / 100);

export function emailEnabled() {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

/** kind: retry (try later), permanent (never), config (our settings, so it costs no attempt). */
export class EmailError extends Error {
  constructor(message, kind, retryAfter = null) {
    super(message);
    this.kind = kind;
    this.retryAfter = retryAfter;
  }
}

function failureKind(status, name) {
  if (status === 401 || status === 403) return 'config';
  if (status === 429 || status >= 500) return 'retry';
  if (status === 409) return name === 'invalid_idempotent_request' ? 'permanent' : 'retry';
  return 'permanent';
}

/** Returns Resend's message id. The message says nothing about the recipient or the mail. */
export async function sendEmail({ to, subject, html, idempotencyKey }) {
  let res;
  try {
    res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify({ from: process.env.EMAIL_FROM, to, subject, html }),
      signal: AbortSignal.timeout(5000),
    });
  } catch (err) {
    throw new EmailError(err.name === 'TimeoutError' ? 'Resend timed out' : 'Resend could not be reached', 'retry');
  }

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const name = /^[a-z_]{1,64}$/.test(data?.name) ? data.name : 'error';
    const retryAfter = Number.parseInt(res.headers.get('retry-after'), 10);
    throw new EmailError(`Resend ${res.status} ${name}`, failureKind(res.status, name), Number.isNaN(retryAfter) ? null : retryAfter);
  }
  if (!data?.id) throw new EmailError('Resend gave no message id', 'retry');
  return data.id;
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

export function customerEmail(order) {
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

export function ownerEmail(order) {
  return {
    to: ownerAddress(),
    subject: `New paid order ${order.order_number} (${rupees(order.total_amount)})`,
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

export function refundNeededEmail(order) {
  return {
    to: ownerAddress(),
    subject: `Refund needed: payment on cancelled order ${order.order_number}`,
    html: layout(`
      <p><strong>Order ${esc(order.order_number)} was paid but is cancelled.</strong> It will not be
      dispatched, so please refund this payment in the Razorpay dashboard.</p>
      <p>
        <strong>Amount:</strong> ${rupees(order.total_amount)}<br>
        <strong>Razorpay payment ID:</strong> ${esc(order.razorpay_payment_id)}<br>
        <strong>Razorpay order ID:</strong> ${esc(order.razorpay_order_id)}
      </p>
      <p><a href="${siteUrl()}/admin/orders">Open Admin → Orders</a></p>
    `),
  };
}

const orderLabel = (order) => (order ? `order ${order.order_number}` : 'an order that no longer exists');

/** Second payment on an order that was already paid. The order may have been deleted since. */
export function duplicatePaymentEmail(row, order) {
  const label = orderLabel(order);
  return {
    to: ownerAddress(),
    subject: `Refund needed: second payment on ${label}`,
    html: layout(`
      <p>A second payment was captured on ${esc(label)}: <strong>${esc(row.razorpay_payment_id)}</strong>.</p>
      <p>The order keeps its first payment. Please refund this one in the Razorpay dashboard.</p>
    `),
  };
}

/** Amounts are missing when Razorpay sent none, or when the payment was not in rupees. */
export function amountMismatchEmail(row, order) {
  const { amount_paise: received, expected_paise: expected } = row.payload || {};
  return {
    to: ownerAddress(),
    subject: `Check payment: it does not match ${orderLabel(order)}`,
    html: layout(`
      <p>Razorpay reported a payment that does not match ${esc(orderLabel(order))}, so the order was not
      marked paid by it. Please review it in the Razorpay dashboard.</p>
      <p>
        <strong>Razorpay payment ID:</strong> ${esc(row.razorpay_payment_id)}<br>
        <strong>Razorpay order ID:</strong> ${esc(row.razorpay_order_id || 'Unknown')}<br>
        <strong>Received:</strong> ${received == null ? 'Not available' : paise(received)}<br>
        <strong>Expected:</strong> ${expected == null ? 'Not available' : paise(expected)}
      </p>
    `),
  };
}

/** No order matches this payment, so only what Razorpay reported is available. */
export function unknownOrderEmail(row) {
  const { amount_paise: received } = row.payload || {};
  return {
    to: ownerAddress(),
    subject: `Check payment: no order matches ${row.razorpay_payment_id}`,
    html: layout(`
      <p>Razorpay reported a captured payment that matches no order. Please review it in the Razorpay
      dashboard and refund it if needed.</p>
      <p>
        <strong>Razorpay payment ID:</strong> ${esc(row.razorpay_payment_id)}<br>
        <strong>Razorpay order ID:</strong> ${esc(row.razorpay_order_id || 'Unknown')}<br>
        <strong>Amount:</strong> ${received == null ? 'Not available' : paise(received)}
      </p>
    `),
  };
}

export function deliveryFailedEmail(row, reason) {
  return {
    to: ownerAddress(),
    subject: `Notification not delivered: ${row.notification_type}`,
    html: layout(`
      <p>A payment notification has permanently failed and will not be retried. Please follow it up by hand.</p>
      <p>
        <strong>Notification:</strong> ${esc(row.notification_type)}<br>
        <strong>Razorpay payment ID:</strong> ${esc(row.razorpay_payment_id || 'Unknown')}<br>
        <strong>Razorpay order ID:</strong> ${esc(row.razorpay_order_id || 'Unknown')}<br>
        <strong>Reason:</strong> ${esc(reason)}
      </p>
    `),
  };
}
