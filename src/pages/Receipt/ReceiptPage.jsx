import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Printer } from 'lucide-react';
import { formatINR } from '../../utils/formatCurrency';
import { useSeo } from '../../utils/useSeo';
import { SITE_CONFIG } from '../../config/siteConfig';
import './ReceiptPage.css';

const money = (amount) => formatINR(amount, { showDecimals: true });

/** Printable receipt, opened from the link in the customer's e-mail or from Admin → Orders. */
export default function ReceiptPage() {
  useSeo({ title: 'Order Receipt', path: '/receipt', noindex: true });
  const { token } = useParams();
  const [order, setOrder] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    fetch(`/api/receipt?token=${encodeURIComponent(token)}`)
      .then(async (res) => {
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.error || 'The receipt could not be loaded.');
        if (mounted) setOrder(data.order);
      })
      .catch((err) => mounted && setError(err.message));
    return () => {
      mounted = false;
    };
  }, [token]);

  if (error) {
    return (
      <div className="ps-receipt-page">
        <div className="ps-receipt-card">
          <p role="alert">{error}</p>
          <Link to="/">Return to PS PERFUMES</Link>
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="ps-receipt-page">
        <div className="ps-receipt-card">Loading receipt...</div>
      </div>
    );
  }

  const address = order.shipping_address || {};

  return (
    <div className="ps-receipt-page">
      <div className="ps-receipt-card">
        <header className="ps-receipt-header">
          <div>
            <h1>{SITE_CONFIG.brandName}</h1>
            <p>{SITE_CONFIG.address}, {SITE_CONFIG.state}</p>
            <p>{SITE_CONFIG.phone}</p>
          </div>
          <div className="ps-receipt-title">
            <strong>Order Receipt</strong>
            <p>Order {order.order_number}</p>
            <p>{new Date(order.paid_at).toLocaleDateString('en-IN', { dateStyle: 'medium' })}</p>
          </div>
        </header>

        <section className="ps-receipt-parties">
          <div>
            <h2>Customer</h2>
            <p>{order.customer_name}</p>
            <p>{order.customer_email}</p>
            <p>{order.customer_phone}</p>
          </div>
          <div>
            <h2>Deliver To</h2>
            <p>{address.address}</p>
            {address.landmark && <p>Near {address.landmark}</p>}
            <p>{address.city}, {address.state} – {address.pincode}</p>
          </div>
        </section>

        <table className="ps-receipt-items">
          <thead>
            <tr>
              <th>Item</th>
              <th>Qty</th>
              <th>Price</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            {order.order_items.map((it, idx) => (
              <tr key={idx}>
                <td>
                  {it.product_name}
                  <small>{[it.bottle_type, it.size_ml].filter(Boolean).join(' · ')}</small>
                </td>
                <td>{it.quantity}</td>
                <td>{money(it.unit_price)}</td>
                <td>{money(it.total_price)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="ps-receipt-totals">
          <div><span>Subtotal</span><span>{money(order.subtotal)}</span></div>
          {Number(order.discount_amount) > 0 && (
            <div><span>Discount</span><span>-{money(order.discount_amount)}</span></div>
          )}
          <div>
            <span>Shipping</span>
            <span>{Number(order.shipping_amount) > 0 ? money(order.shipping_amount) : 'FREE'}</span>
          </div>
          <div className="ps-receipt-grand-total"><span>Total Paid</span><span>{money(order.total_amount)}</span></div>
        </div>

        <p className="ps-receipt-payment">
          Paid online via Razorpay · Payment ID: <strong>{order.razorpay_payment_id}</strong>
        </p>

        <button type="button" className="ps-receipt-print" onClick={() => window.print()}>
          <Printer size={15} />
          <span>Print / Save as PDF</span>
        </button>
      </div>
    </div>
  );
}
