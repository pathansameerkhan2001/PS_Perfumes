import React, { useState, useEffect } from 'react';
import { Star, Check, X, Trash2, Plus, Edit2, Award } from 'lucide-react';
import {
  getReviews,
  updateReviewStatus,
  deleteReview,
  adminCreateReview,
  adminUpdateReview,
} from '../../services/reviews';
import { getProducts } from '../../services/products';
import './AdminProductForm.css';

/*
 * Admin → Reviews (table: reviews). Approved reviews appear on the website (homepage "Loved by
 * Fragrance Enthusiasts", featured first, and on their product page). Hidden/pending reviews
 * are never shown. Reviews can be added here when a customer sends one by WhatsApp or e-mail;
 * the database policies allow only administrators to add, edit or delete reviews.
 * There is no "verified purchase" field in the schema, so none is offered.
 */

const EMPTY_FORM = {
  customer_name: '',
  rating: 5,
  title: '',
  comment: '',
  product_id: '',
  is_approved: false,
  is_featured: false,
};

export default function AdminReviews() {
  const [reviews, setReviews] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [notice, setNotice] = useState(null); // { type: 'success' | 'error', text }
  const [filter, setFilter] = useState('all');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchReviews = async () => {
    setLoading(true);
    try {
      const data = await getReviews(true);
      setReviews(data);
    } catch (err) {
      setNotice({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReviews();
    // Product list for the optional "product" field (a failure only empties the list)
    getProducts({ allStatuses: true, throwOnError: true })
      .then((list) => setProducts(Array.isArray(list) ? list : []))
      .catch(() => setProducts([]));
  }, []);

  const run = async (id, action, successText) => {
    setBusyId(id);
    setNotice(null);
    try {
      await action();
      setNotice({ type: 'success', text: successText });
    } catch (err) {
      setNotice({ type: 'error', text: err.message });
    } finally {
      setBusyId(null);
      fetchReviews();
    }
  };

  const handleStatus = (id, status) =>
    run(
      id,
      () => updateReviewStatus(id, status),
      status === 'approved' ? 'Review approved and visible on the website.' : 'Review hidden from the website.'
    );

  const handleFeatured = (rev) =>
    run(
      rev.id,
      () => adminUpdateReview(rev.id, { is_featured: !rev.featured }),
      rev.featured ? 'Review is no longer featured.' : 'Review featured: it is shown first on the homepage (once approved).'
    );

  const handleDelete = (id) => {
    if (!window.confirm('Delete this review permanently?')) return;
    run(id, () => deleteReview(id), 'Review deleted.');
  };

  const openNew = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError('');
    setIsFormOpen(true);
  };

  const openEdit = (rev) => {
    setEditingId(rev.id);
    setForm({
      customer_name: rev.customer_name || '',
      rating: Number(rev.rating) || 5,
      title: rev.title || '',
      comment: rev.comment || '',
      product_id: rev.product_id || '',
      is_approved: rev.status === 'approved',
      is_featured: Boolean(rev.featured),
    });
    setFormError('');
    setIsFormOpen(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.customer_name.trim()) {
      setFormError('Enter the customer name or the initials they agreed to publish.');
      return;
    }
    if (!form.comment.trim()) {
      setFormError('Enter the review text.');
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      if (editingId) {
        await adminUpdateReview(editingId, form);
        setNotice({ type: 'success', text: 'Review updated.' });
      } else {
        await adminCreateReview(form);
        setNotice({
          type: 'success',
          text: form.is_approved ? 'Review added and visible on the website.' : 'Review added (hidden until approved).',
        });
      }
      setIsFormOpen(false);
      fetchReviews();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const filtered = reviews.filter((r) => {
    if (filter === 'approved') return r.status === 'approved';
    if (filter === 'pending') return r.status !== 'approved';
    if (filter === 'featured') return r.featured;
    return true;
  });

  return (
    <div className="ps-admin-reviews-page">
      <div className="ps-admin-page-header">
        <div>
          <span className="ps-admin-eyebrow">PATRON TESTIMONIALS</span>
          <h1 className="ps-admin-page-title">Review Moderation</h1>
          <p className="ps-admin-page-subtitle" style={{ maxWidth: 640 }}>
            Only <strong>approved</strong> reviews appear on the website. <strong>Featured</strong> reviews are shown first
            on the homepage.
          </p>
        </div>
        <button type="button" className="ps-btn-gold-primary ps-admin-header-btn" onClick={openNew}>
          <Plus size={16} />
          <span>ADD REVIEW</span>
        </button>
      </div>

      {notice && (
        <div className={notice.type === 'error' ? 'ps-form-error-banner' : 'ps-form-success-banner'} role="status">
          {notice.text}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '0 0 14px' }}>
        {[
          ['all', `All (${reviews.length})`],
          ['approved', `Approved (${reviews.filter((r) => r.status === 'approved').length})`],
          ['pending', `Hidden / pending (${reviews.filter((r) => r.status !== 'approved').length})`],
          ['featured', `Featured (${reviews.filter((r) => r.featured).length})`],
        ].map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={`ps-toolbar-pill ${filter === key ? 'is-active' : ''}`}
            onClick={() => setFilter(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="ps-admin-loading">Loading Reviews...</div>
      ) : filtered.length === 0 ? (
        <div className="ps-admin-empty-table">
          {reviews.length === 0 ? 'No reviews yet. Use “Add review” to add one a customer has shared.' : 'No reviews match this filter.'}
        </div>
      ) : (
        <div className="ps-admin-table-container">
          <table className="ps-admin-products-table">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Product</th>
                <th>Rating</th>
                <th>Title & Comment</th>
                <th>Date</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((rev) => (
                <tr key={rev.id}>
                  <td>
                    <strong>{rev.customer_name}</strong>
                    {rev.featured && (
                      <div style={{ fontSize: 11, color: 'var(--color-gold-bright)', marginTop: 2 }}>Featured</div>
                    )}
                  </td>
                  <td>
                    <span style={{ fontSize: 12, color: 'var(--color-champagne)' }}>{rev.product_name || '—'}</span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 2 }} aria-label={`${rev.rating} out of 5`}>
                      {[...Array(5)].map((_, i) => (
                        <Star
                          key={i}
                          size={12}
                          fill={i < rev.rating ? '#f59e0b' : '#333'}
                          color={i < rev.rating ? '#f59e0b' : '#333'}
                        />
                      ))}
                    </div>
                  </td>
                  <td>
                    <div style={{ maxWidth: 320 }}>
                      {rev.title && (
                        <strong style={{ fontSize: 12, color: 'var(--color-ivory)', display: 'block' }}>{rev.title}</strong>
                      )}
                      <p style={{ margin: '4px 0 0', fontSize: 12, color: '#c9c1b2', lineHeight: 1.4 }}>{rev.comment}</p>
                    </div>
                  </td>
                  <td>{new Date(rev.created_at).toLocaleDateString()}</td>
                  <td>
                    <span className={`ps-status-pill ${rev.status === 'approved' ? 'ps-status-delivered' : 'ps-status-pending'}`}>
                      {rev.status === 'approved' ? 'APPROVED' : 'HIDDEN'}
                    </span>
                  </td>
                  <td>
                    <div className="ps-table-actions">
                      {rev.status !== 'approved' ? (
                        <button
                          type="button"
                          className="ps-action-icon-btn"
                          onClick={() => handleStatus(rev.id, 'approved')}
                          disabled={busyId === rev.id}
                          title="Approve (show on website)"
                          aria-label="Approve review"
                          style={{ color: '#4ade80' }}
                        >
                          <Check size={14} />
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="ps-action-icon-btn"
                          onClick={() => handleStatus(rev.id, 'pending')}
                          disabled={busyId === rev.id}
                          title="Hide from website"
                          aria-label="Hide review"
                          style={{ color: '#f87171' }}
                        >
                          <X size={14} />
                        </button>
                      )}
                      <button
                        type="button"
                        className="ps-action-icon-btn"
                        onClick={() => handleFeatured(rev)}
                        disabled={busyId === rev.id}
                        title={rev.featured ? 'Remove from featured' : 'Feature on homepage'}
                        aria-label={rev.featured ? 'Remove from featured' : 'Feature review'}
                        style={{ color: rev.featured ? '#E5C77A' : undefined }}
                      >
                        <Award size={14} />
                      </button>
                      <button
                        type="button"
                        className="ps-action-icon-btn"
                        onClick={() => openEdit(rev)}
                        title="Edit review"
                        aria-label="Edit review"
                      >
                        <Edit2 size={14} />
                      </button>
                      <button
                        type="button"
                        className="ps-action-icon-btn is-delete"
                        onClick={() => handleDelete(rev.id)}
                        disabled={busyId === rev.id}
                        title="Delete review"
                        aria-label="Delete review"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {isFormOpen && (
        <div className="ps-admin-modal-overlay" onClick={() => !saving && setIsFormOpen(false)}>
          <div className="ps-admin-modal-card" style={{ maxWidth: 620 }} onClick={(e) => e.stopPropagation()}>
            <div className="ps-modal-header">
              <h3>{editingId ? 'Edit Review' : 'Add Review'}</h3>
              <button type="button" className="ps-modal-close" onClick={() => setIsFormOpen(false)} disabled={saving} aria-label="Close">
                <X size={18} />
              </button>
            </div>

            {formError && <div className="ps-form-error-banner" role="alert">{formError}</div>}

            <form onSubmit={handleSave}>
              <div className="ps-form-row">
                <div className="ps-form-group">
                  <label htmlFor="rev-name">Customer name or initials *</label>
                  <input
                    id="rev-name"
                    type="text"
                    maxLength={80}
                    value={form.customer_name}
                    onChange={(e) => setForm({ ...form, customer_name: e.target.value })}
                    placeholder="As the customer agreed to be shown"
                  />
                </div>
                <div className="ps-form-group">
                  <label htmlFor="rev-rating">Rating *</label>
                  <select
                    id="rev-rating"
                    value={form.rating}
                    onChange={(e) => setForm({ ...form, rating: Number(e.target.value) })}
                  >
                    {[5, 4, 3, 2, 1].map((n) => (
                      <option key={n} value={n}>
                        {n} star{n > 1 ? 's' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="ps-form-group">
                <label htmlFor="rev-title">Title (optional)</label>
                <input
                  id="rev-title"
                  type="text"
                  maxLength={120}
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                />
              </div>

              <div className="ps-form-group">
                <label htmlFor="rev-text">Review text *</label>
                <textarea
                  id="rev-text"
                  rows={5}
                  maxLength={2000}
                  value={form.comment}
                  onChange={(e) => setForm({ ...form, comment: e.target.value })}
                  placeholder="The customer's words, unchanged"
                />
              </div>

              <div className="ps-form-group">
                <label htmlFor="rev-product">Product (optional)</label>
                <select
                  id="rev-product"
                  value={form.product_id}
                  onChange={(e) => setForm({ ...form, product_id: e.target.value })}
                >
                  <option value="">— Not about a specific product —</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                      {p.is_active === false ? ' (inactive)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="ps-form-group" style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                <label className="ps-checkbox-label">
                  <input
                    type="checkbox"
                    checked={form.is_approved}
                    onChange={(e) => setForm({ ...form, is_approved: e.target.checked })}
                  />
                  <span>Approved (shown on the website)</span>
                </label>
                <label className="ps-checkbox-label">
                  <input
                    type="checkbox"
                    checked={form.is_featured}
                    onChange={(e) => setForm({ ...form, is_featured: e.target.checked })}
                  />
                  <span>Featured (shown first on the homepage)</span>
                </label>
              </div>

              <div className="ps-modal-actions">
                <button type="button" className="ps-builder-btn-cancel" onClick={() => setIsFormOpen(false)} disabled={saving}>
                  Cancel
                </button>
                <button type="submit" className="ps-builder-btn-save" disabled={saving}>
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
