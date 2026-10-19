import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Tag, Check, X } from 'lucide-react';
import { getCoupons, createCoupon, toggleCouponActive, deleteCoupon } from '../../services/coupons';
import { formatINR } from '../../utils/formatCurrency';

export default function AdminCoupons() {
  const [coupons, setCoupons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);

  const EMPTY_COUPON = {
    code: '',
    discount_type: 'percentage',
    discount_value: 10,
    min_order_amount: 0,
    usage_limit: '',
    expires_at: '',
    is_active: true,
  };
  const [form, setForm] = useState(EMPTY_COUPON);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [notice, setNotice] = useState(null); // { type: 'success' | 'error', text }

  const loadData = async () => {
    setLoading(true);
    try {
      setCoupons(await getCoupons());
    } catch (err) {
      setNotice({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.code) return;
    setSaving(true);
    setFormError('');
    try {
      await createCoupon({
        ...form,
        expires_at: form.expires_at ? new Date(`${form.expires_at}T23:59:59`).toISOString() : null,
      });
      setIsFormOpen(false);
      setForm(EMPTY_COUPON);
      setNotice({ type: 'success', text: `Coupon ${form.code} created.` });
      loadData();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (id, current) => {
    setNotice(null);
    try {
      await toggleCouponActive(id, !current);
      setNotice({ type: 'success', text: `Coupon ${current ? 'disabled' : 'activated'}.` });
    } catch (err) {
      setNotice({ type: 'error', text: err.message });
    } finally {
      loadData();
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this coupon code?')) return;
    setNotice(null);
    try {
      await deleteCoupon(id);
      setNotice({ type: 'success', text: 'Coupon deleted.' });
    } catch (err) {
      setNotice({ type: 'error', text: err.message });
    } finally {
      loadData();
    }
  };

  return (
    <div className="ps-admin-coupons-page">
      <div className="ps-admin-page-header">
        <div>
          <span className="ps-admin-eyebrow">PATRON PRIVILEGES</span>
          <h1 className="ps-admin-page-title">Promotional Coupons</h1>
        </div>
        <button
          type="button"
          className="ps-btn-gold-primary ps-admin-header-btn"
          onClick={() => setIsFormOpen(true)}
        >
          <Plus size={16} />
          <span>+ CREATE COUPON</span>
        </button>
      </div>

      <p style={{ fontSize: 12, color: 'var(--color-muted)', margin: '0 0 12px' }}>
        Note: coupons saved here are not yet applied at checkout — the cart currently accepts only its built-in codes.
      </p>

      {notice && (
        <div className={notice.type === 'error' ? 'ps-form-error-banner' : 'ps-form-success-banner'} role="status">
          {notice.text}
        </div>
      )}

      {loading ? (
        <div className="ps-admin-loading">Loading Coupons...</div>
      ) : coupons.length === 0 ? (
        <div className="ps-admin-empty-table">No promotional coupons configured.</div>
      ) : (
        <div className="ps-admin-table-container">
          <table className="ps-admin-products-table">
            <thead>
              <tr>
                <th>Coupon Code</th>
                <th>Discount</th>
                <th>Min Order</th>
                <th>Expires</th>
                <th>Usage Count</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {coupons.map((cp) => (
                <tr key={cp.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Tag size={15} color="#c8a45d" />
                      <strong style={{ fontFamily: 'var(--font-serif)', color: 'var(--color-champagne)' }}>
                        {cp.code}
                      </strong>
                    </div>
                  </td>
                  <td>
                    <span style={{ color: '#22c55e', fontWeight: 600 }}>
                      {cp.discount_type === 'percentage' ? `${cp.discount_value}% OFF` : `₹${cp.discount_value} OFF`}
                    </span>
                  </td>
                  <td>{formatINR(cp.min_order_amount || 0)}</td>
                  <td>{cp.expires_at ? new Date(cp.expires_at).toLocaleDateString() : 'Never'}</td>
                  <td>
                    {cp.used_count || 0} / {cp.usage_limit || '∞'}
                  </td>
                  <td>
                    <button
                      type="button"
                      className={`ps-status-toggle-btn ${cp.is_active ? 'is-active' : 'is-draft'}`}
                      onClick={() => handleToggle(cp.id, cp.is_active)}
                    >
                      {cp.is_active ? 'ACTIVE' : 'DISABLED'}
                    </button>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="ps-action-icon-btn is-delete"
                      onClick={() => handleDelete(cp.id)}
                      title="Delete Coupon"
                    >
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Coupon Modal */}
      {isFormOpen && (
        <div className="ps-admin-modal-overlay">
          <div className="ps-admin-modal-card" style={{ maxWidth: 480, textAlign: 'left' }}>
            <h2 className="ps-card-title" style={{ marginBottom: 16 }}>Create Promo Coupon</h2>
            <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="ps-form-group">
                <label>Coupon Code *</label>
                <input
                  type="text"
                  placeholder="e.g. FESTIVE25"
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                  required
                />
              </div>

              <div className="ps-form-row">
                <div className="ps-form-group">
                  <label>Discount Type</label>
                  <select
                    value={form.discount_type}
                    onChange={(e) => setForm({ ...form, discount_type: e.target.value })}
                  >
                    <option value="percentage">Percentage (%)</option>
                    <option value="fixed">Fixed Amount (₹)</option>
                  </select>
                </div>
                <div className="ps-form-group">
                  <label>Discount Value *</label>
                  <input
                    type="number"
                    value={form.discount_value}
                    onChange={(e) => setForm({ ...form, discount_value: Number(e.target.value) })}
                    required
                  />
                </div>
              </div>

              <div className="ps-form-row">
                <div className="ps-form-group">
                  <label>Min Order (₹)</label>
                  <input
                    type="number"
                    value={form.min_order_amount}
                    onChange={(e) => setForm({ ...form, min_order_amount: Number(e.target.value) })}
                  />
                </div>
                <div className="ps-form-group">
                  <label>Expires On (optional)</label>
                  <input
                    type="date"
                    value={form.expires_at}
                    onChange={(e) => setForm({ ...form, expires_at: e.target.value })}
                  />
                </div>
              </div>

              <div className="ps-form-group">
                <label>Usage Limit (Total redeems allowed)</label>
                <input
                  type="number"
                  min="0"
                  placeholder="Unlimited"
                  value={form.usage_limit}
                  onChange={(e) => setForm({ ...form, usage_limit: e.target.value })}
                />
              </div>

              {formError && <div className="ps-form-error-banner">{formError}</div>}

              <div className="ps-modal-actions" style={{ marginTop: 8 }}>
                <button type="button" className="ps-btn-cancel" onClick={() => { setIsFormOpen(false); setFormError(''); }}>
                  Cancel
                </button>
                <button type="submit" className="ps-btn-gold-primary" style={{ padding: '10px 18px' }} disabled={saving}>
                  {saving ? 'Saving…' : 'Save Coupon'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
