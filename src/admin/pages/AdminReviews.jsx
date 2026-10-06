import React, { useState, useEffect } from 'react';
import { Star, Check, X, Trash2 } from 'lucide-react';
import { getReviews, updateReviewStatus, deleteReview } from '../../services/reviews';

export default function AdminReviews() {
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchReviews = async () => {
    setLoading(true);
    const data = await getReviews(true);
    setReviews(data);
    setLoading(false);
  };

  useEffect(() => {
    fetchReviews();
  }, []);

  const handleStatus = async (id, status) => {
    await updateReviewStatus(id, status);
    fetchReviews();
  };

  const handleDelete = async (id) => {
    if (window.confirm('Delete this patron review?')) {
      await deleteReview(id);
      fetchReviews();
    }
  };

  return (
    <div className="ps-admin-reviews-page">
      <div className="ps-admin-page-header">
        <div>
          <span className="ps-admin-eyebrow">PATRON TESTIMONIALS</span>
          <h1 className="ps-admin-page-title">Review Moderation</h1>
        </div>
      </div>

      {loading ? (
        <div className="ps-admin-loading">Loading Reviews...</div>
      ) : reviews.length === 0 ? (
        <div className="ps-admin-empty-table">No reviews registered.</div>
      ) : (
        <div className="ps-admin-table-container">
          <table className="ps-admin-products-table">
            <thead>
              <tr>
                <th>Customer & Location</th>
                <th>Product</th>
                <th>Rating</th>
                <th>Title & Comment</th>
                <th>Date</th>
                <th>Status</th>
                <th>Moderation</th>
              </tr>
            </thead>
            <tbody>
              {reviews.map((rev) => (
                <tr key={rev.id}>
                  <td>
                    <strong>{rev.customer_name}</strong>
                    <div style={{ fontSize: 11, color: 'var(--color-muted)' }}>
                      {rev.location || 'India'}
                    </div>
                  </td>
                  <td>
                    <span style={{ fontSize: 12, color: 'var(--color-champagne)' }}>
                      {rev.product_name}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 2 }}>
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
                    <div style={{ maxWidth: 300 }}>
                      <strong style={{ fontSize: 12, color: 'var(--color-ivory)', display: 'block' }}>
                        {rev.title}
                      </strong>
                      <p style={{ margin: '4px 0 0', fontSize: 12, color: '#c9c1b2', lineHeight: 1.4 }}>
                        {rev.comment}
                      </p>
                    </div>
                  </td>
                  <td>{new Date(rev.created_at).toLocaleDateString()}</td>
                  <td>
                    <span
                      className={`ps-status-pill ${
                        rev.status === 'approved'
                          ? 'ps-status-delivered'
                          : rev.status === 'rejected'
                          ? 'ps-status-cancelled'
                          : 'ps-status-pending'
                      }`}
                    >
                      {rev.status.toUpperCase()}
                    </span>
                  </td>
                  <td>
                    <div className="ps-table-actions">
                      {rev.status !== 'approved' && (
                        <button
                          type="button"
                          className="ps-action-icon-btn"
                          onClick={() => handleStatus(rev.id, 'approved')}
                          title="Approve Review"
                          style={{ color: '#4ade80' }}
                        >
                          <Check size={14} />
                        </button>
                      )}
                      {rev.status !== 'rejected' && (
                        <button
                          type="button"
                          className="ps-action-icon-btn"
                          onClick={() => handleStatus(rev.id, 'rejected')}
                          title="Reject Review"
                          style={{ color: '#f87171' }}
                        >
                          <X size={14} />
                        </button>
                      )}
                      <button
                        type="button"
                        className="ps-action-icon-btn is-delete"
                        onClick={() => handleDelete(rev.id)}
                        title="Delete Review"
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
    </div>
  );
}
