import React, { useState, useEffect } from 'react';
import { Eye, X } from 'lucide-react';
import { getOrders, updateOrderStatus } from '../../services/orders';
import { formatINR } from '../../utils/formatCurrency';

const ORDER_STATUSES = [
  'pending',
  'confirmed',
  'processing',
  'shipped',
  'out_for_delivery',
  'delivered',
  'cancelled',
];

export default function AdminOrders() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [notice, setNotice] = useState(null); // { type: 'success' | 'error', text }
  const [updatingId, setUpdatingId] = useState(null);

  const fetchOrders = async () => {
    setLoading(true);
    try {
      setOrders(await getOrders());
    } catch (err) {
      setNotice({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  const handleStatusChange = async (orderId, newStatus) => {
    if (updatingId) return;
    setNotice(null);
    setUpdatingId(orderId);
    try {
      await updateOrderStatus(orderId, newStatus);
      if (selectedOrder && selectedOrder.id === orderId) {
        setSelectedOrder((prev) => ({ ...prev, order_status: newStatus }));
      }
      setNotice({ type: 'success', text: `Order status changed to ${newStatus.replace(/_/g, ' ')}.` });
    } catch (err) {
      setNotice({ type: 'error', text: err.message });
    } finally {
      setUpdatingId(null);
      fetchOrders();
    }
  };

  return (
    <div className="ps-admin-orders-page">
      <div className="ps-admin-page-header">
        <div>
          <span className="ps-admin-eyebrow">ORDER FULFILLMENT</span>
          <h1 className="ps-admin-page-title">Patron Dispatches & Orders</h1>
        </div>
      </div>

      {notice && (
        <div className={notice.type === 'error' ? 'ps-form-error-banner' : 'ps-form-success-banner'} role="status">
          {notice.text}
        </div>
      )}

      {loading ? (
        <div className="ps-admin-loading">Loading Orders...</div>
      ) : orders.length === 0 ? (
        <div className="ps-admin-empty-table">No orders registered yet.</div>
      ) : (
        <div className="ps-admin-table-container">
          <table className="ps-admin-products-table">
            <thead>
              <tr>
                <th>Order #</th>
                <th>Customer</th>
                <th>Date</th>
                <th>Items</th>
                <th>Total</th>
                <th>Payment</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((ord) => (
                <tr key={ord.id}>
                  <td>
                    <strong style={{ color: 'var(--color-champagne)' }}>{ord.order_number}</strong>
                  </td>
                  <td>
                    <div>
                      <strong>{ord.customer_name}</strong>
                      <div style={{ fontSize: 11, color: 'var(--color-muted)' }}>
                        {ord.shipping_address?.city}, {ord.shipping_address?.pincode}
                      </div>
                    </div>
                  </td>
                  <td>{new Date(ord.created_at).toLocaleDateString()}</td>
                  <td>
                    {(() => {
                      // Units ordered (sum of line quantities), from the stored order items
                      const units = (ord.items || []).reduce((sum, it) => sum + (Number(it.quantity) || 0), 0);
                      return (
                        <span style={{ fontSize: 12 }} title={`${(ord.items || []).length} line(s)`}>
                          {units > 0 ? `${units} unit${units > 1 ? 's' : ''}` : 'No items recorded'}
                        </span>
                      );
                    })()}
                  </td>
                  <td>
                    <strong style={{ color: 'var(--color-gold-bright)' }}>{formatINR(ord.total)}</strong>
                  </td>
                  <td>
                    <span style={{ fontSize: 11, color: '#c9c1b2' }}>{ord.payment_method}</span>
                    {/* As stored on the order; no payment gateway updates it */}
                    <div style={{ fontSize: 10, color: ord.payment_status === 'paid' ? '#4ade80' : 'var(--color-muted)' }}>
                      {String(ord.payment_status || 'pending').toUpperCase()}
                    </div>
                  </td>
                  <td>
                    <select
                      className="ps-status-select"
                      value={ord.order_status}
                      onChange={(e) => handleStatusChange(ord.id, e.target.value)}
                      disabled={Boolean(updatingId)}
                      aria-label={`Status of order ${ord.order_number}`}
                      style={{
                        background: '#FFFFFF',
                        border: '1px solid #E5E0D8',
                        color: '#1A1714',
                        padding: '6px 8px',
                        fontSize: 12,
                        borderRadius: 6,
                        cursor: 'pointer',
                      }}
                    >
                      {ORDER_STATUSES.map((st) => (
                        <option key={st} value={st}>
                          {st.replace(/_/g, ' ').toUpperCase()}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="ps-action-icon-btn"
                      onClick={() => setSelectedOrder(ord)}
                      title="Inspect Order Details"
                      aria-label={`View order ${ord.order_number}`}
                    >
                      <Eye size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Order Detail Modal */}
      {selectedOrder && (
        <div className="ps-admin-modal-overlay" onClick={(e) => e.target === e.currentTarget && setSelectedOrder(null)}>
          <div
            className="ps-admin-modal-card"
            role="dialog"
            aria-modal="true"
            aria-label={`Order ${selectedOrder.order_number}`}
            style={{ maxWidth: 640, textAlign: 'left', maxHeight: '85vh', overflowY: 'auto' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div>
                <span className="ps-admin-eyebrow">ORDER BREAKDOWN</span>
                <h2 className="ps-modal-title" style={{ margin: 0 }}>
                  Order {selectedOrder.order_number}
                </h2>
              </div>
              <button
                type="button"
                className="ps-action-icon-btn"
                onClick={() => setSelectedOrder(null)}
                aria-label="Close order details"
              >
                <X size={16} />
              </button>
            </div>

            {/* Customer & Shipping Details */}
            <div style={{ background: '#FAF8F5', border: '1px solid var(--color-border)', borderRadius: 8, padding: 18, marginBottom: 20, overflowWrap: 'anywhere' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
                <div><strong>Patron Name:</strong> {selectedOrder.customer_name}</div>
                <div><strong>Email:</strong> {selectedOrder.email}</div>
                <div><strong>Phone:</strong> {selectedOrder.phone}</div>
                <div>
                  <strong>Destination:</strong>{' '}
                  {selectedOrder.shipping_address?.address}, {selectedOrder.shipping_address?.city}, {selectedOrder.shipping_address?.state} – {selectedOrder.shipping_address?.pincode}
                  {selectedOrder.shipping_address?.landmark && ` (Near ${selectedOrder.shipping_address.landmark})`}
                </div>
              </div>
            </div>

            {/* Line Items */}
            <h3 style={{ fontFamily: 'var(--font-serif)', fontSize: 13, color: 'var(--color-gold)', textTransform: 'uppercase', marginBottom: 12 }}>
              Flacons in Dispatch
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
              {(selectedOrder.items || []).map((it, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  {it.product_image && (
                    <img src={it.product_image} alt={it.product_name} style={{ width: 44, height: 44, objectFit: 'contain', background: '#000', borderRadius: 2 }} />
                  )}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{it.product_name}</div>
                    <div style={{ fontSize: 11, color: 'var(--color-muted)' }}>
                      Variant: {it.size || '—'} • Qty: {it.quantity} • {formatINR(it.price)} each
                    </div>
                  </div>
                  <strong style={{ color: 'var(--color-gold-bright)' }}>
                    {formatINR(it.price * it.quantity)}
                  </strong>
                </div>
              ))}
            </div>

            {/* Financial Breakdown */}
            <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Subtotal</span>
                <span>{formatINR(selectedOrder.subtotal)}</span>
              </div>
              {selectedOrder.discount > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#22c55e' }}>
                  <span>Discount</span>
                  <span>-{formatINR(selectedOrder.discount)}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Shipping Fee</span>
                <span>{selectedOrder.shipping_fee === 0 ? 'FREE' : formatINR(selectedOrder.shipping_fee)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Payment</span>
                <span>
                  {selectedOrder.payment_method === 'COD' ? 'Cash on Delivery' : selectedOrder.payment_method} ·{' '}
                  {String(selectedOrder.payment_status || 'pending').toUpperCase()}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, fontWeight: 700, color: 'var(--color-gold-bright)', borderTop: '1px solid #ECE7DF', paddingTop: 8 }}>
                <span>{selectedOrder.payment_status === 'paid' ? 'Total Paid' : 'Total Due'}</span>
                <span>{formatINR(selectedOrder.total)}</span>
              </div>
            </div>

            {/* Result of a status change made here (the page banner is behind this overlay) */}
            {notice && (
              <div
                className={notice.type === 'error' ? 'ps-form-error-banner' : 'ps-form-success-banner'}
                role={notice.type === 'error' ? 'alert' : 'status'}
                style={{ marginTop: 16 }}
              >
                {notice.text}
              </div>
            )}

            {/* Status Control */}
            <div style={{ marginTop: 24, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
              <label htmlFor="order-detail-status" style={{ fontSize: 12, color: 'var(--color-muted)' }}>Update Order Status:</label>
              <select
                id="order-detail-status"
                value={selectedOrder.order_status}
                onChange={(e) => handleStatusChange(selectedOrder.id, e.target.value)}
                disabled={Boolean(updatingId)}
                style={{
                  background: 'var(--color-secondary)',
                  border: '1px solid var(--color-gold)',
                  color: 'var(--color-gold-bright)',
                  padding: '8px 14px',
                  borderRadius: 2,
                  fontWeight: 600,
                  fontSize: 12,
                }}
              >
                {ORDER_STATUSES.map((st) => (
                  <option key={st} value={st}>{st.replace(/_/g, ' ').toUpperCase()}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
