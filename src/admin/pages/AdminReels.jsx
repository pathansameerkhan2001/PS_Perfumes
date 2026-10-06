import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, ArrowUp, ArrowDown, ExternalLink, Play, X } from 'lucide-react';
import { getReels, createReel, updateReel, deleteReel } from '../../services/reels';
import { uploadImage } from '../../lib/storage';

export default function AdminReels() {
  const [reels, setReels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingReel, setEditingReel] = useState(null);

  const [formData, setFormData] = useState({
    instagram_url: 'https://www.instagram.com/ps_perfumes_kadapa/?hl=en',
    thumbnail_url: '',
    caption: '',
    display_order: 1,
    is_active: true,
  });

  const loadData = async () => {
    setLoading(true);
    const data = await getReels(true);
    setReels(data);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleNew = () => {
    setEditingReel(null);
    setFormData({
      instagram_url: 'https://www.instagram.com/ps_perfumes_kadapa/?hl=en',
      thumbnail_url: '',
      caption: '',
      display_order: reels.length + 1,
      is_active: true,
    });
    setIsFormOpen(true);
  };

  const handleEdit = (reel) => {
    setEditingReel(reel);
    setFormData({
      instagram_url: reel.instagram_url,
      thumbnail_url: reel.thumbnail_url,
      caption: reel.caption || '',
      display_order: reel.display_order || 1,
      is_active: reel.is_active,
    });
    setIsFormOpen(true);
  };

  const handleThumbnailUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const { url } = await uploadImage(file, 'reels', 'thumb');
    if (url) {
      setFormData((prev) => ({ ...prev, thumbnail_url: url }));
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!formData.thumbnail_url) {
      alert('Please upload or provide a real thumbnail URL for this Instagram reel.');
      return;
    }

    if (editingReel) {
      await updateReel(editingReel.id, formData);
    } else {
      await createReel(formData);
    }
    setIsFormOpen(false);
    loadData();
  };

  const handleDelete = async (id) => {
    if (window.confirm('Delete this Instagram Reel?')) {
      await deleteReel(id);
      loadData();
    }
  };

  const handleMove = async (index, direction) => {
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= reels.length) return;

    const currentReel = reels[index];
    const targetReel = reels[targetIdx];

    const tempOrder = currentReel.display_order;
    await updateReel(currentReel.id, { display_order: targetReel.display_order });
    await updateReel(targetReel.id, { display_order: tempOrder });

    loadData();
  };

  const handleToggleActive = async (reel) => {
    await updateReel(reel.id, { is_active: !reel.is_active });
    loadData();
  };

  return (
    <div className="ps-admin-reels-page">
      <div className="ps-admin-page-header">
        <div>
          <span className="ps-admin-eyebrow">BROADCAST & MEDIA</span>
          <h1 className="ps-admin-page-title">Instagram Reels Manager</h1>
        </div>
        <button
          type="button"
          className="ps-btn-gold-primary ps-admin-header-btn"
          onClick={handleNew}
        >
          <Plus size={16} />
          <span>+ ADD INSTAGRAM REEL</span>
        </button>
      </div>

      {loading ? (
        <div className="ps-admin-loading">Loading Reels...</div>
      ) : reels.length === 0 ? (
        <div className="ps-admin-empty-table">No Instagram reels registered yet.</div>
      ) : (
        <div className="ps-admin-table-container">
          <table className="ps-admin-products-table">
            <thead>
              <tr>
                <th>Thumbnail (9:16)</th>
                <th>Caption & Media</th>
                <th>Instagram URL</th>
                <th>Order</th>
                <th>Status</th>
                <th>Reorder</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {reels.map((reel, idx) => (
                <tr key={reel.id}>
                  <td>
                    <div style={{ width: 50, height: 88, borderRadius: 4, overflow: 'hidden', background: '#000', border: '1px solid var(--color-border)', position: 'relative' }}>
                      <img src={reel.thumbnail_url} alt="Reel thumbnail" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', background: 'rgba(0,0,0,0.6)', borderRadius: '50%', padding: 4 }}>
                        <Play size={10} fill="#fff" color="#fff" />
                      </div>
                    </div>
                  </td>
                  <td>
                    <div style={{ maxWidth: 280 }}>
                      <p style={{ margin: 0, fontSize: 13, color: 'var(--color-ivory)', lineHeight: 1.4 }}>
                        {reel.caption || 'No caption provided'}
                      </p>
                    </div>
                  </td>
                  <td>
                    <a
                      href={reel.instagram_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--color-gold-bright)', fontSize: 12, textDecoration: 'underline' }}
                    >
                      <span>View on Instagram</span>
                      <ExternalLink size={12} />
                    </a>
                  </td>
                  <td>
                    <strong>#{reel.display_order}</strong>
                  </td>
                  <td>
                    <button
                      type="button"
                      className={`ps-status-toggle-btn ${reel.is_active ? 'is-active' : 'is-draft'}`}
                      onClick={() => handleToggleActive(reel)}
                    >
                      {reel.is_active ? 'ACTIVE' : 'DISABLED'}
                    </button>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button
                        type="button"
                        className="ps-action-icon-btn"
                        onClick={() => handleMove(idx, 'up')}
                        disabled={idx === 0}
                        title="Move Up"
                      >
                        <ArrowUp size={14} />
                      </button>
                      <button
                        type="button"
                        className="ps-action-icon-btn"
                        onClick={() => handleMove(idx, 'down')}
                        disabled={idx === reels.length - 1}
                        title="Move Down"
                      >
                        <ArrowDown size={14} />
                      </button>
                    </div>
                  </td>
                  <td>
                    <div className="ps-table-actions">
                      <button
                        type="button"
                        className="ps-action-icon-btn"
                        onClick={() => handleEdit(reel)}
                        title="Edit Reel"
                      >
                        <Edit2 size={15} />
                      </button>
                      <button
                        type="button"
                        className="ps-action-icon-btn is-delete"
                        onClick={() => handleDelete(reel.id)}
                        title="Delete Reel"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Reel Form Modal with Live Preview */}
      {isFormOpen && (
        <div className="ps-admin-modal-overlay">
          <div className="ps-admin-modal-card" style={{ maxWidth: 680, textAlign: 'left' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 className="ps-card-title" style={{ margin: 0 }}>
                {editingReel ? 'Edit Instagram Reel' : 'Add Instagram Reel'}
              </h2>
              <button type="button" className="ps-action-icon-btn" onClick={() => setIsFormOpen(false)}>
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSave} style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 24 }}>
              {/* Form Inputs */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div className="ps-form-group">
                  <label>Instagram Reel Direct URL *</label>
                  <input
                    type="url"
                    placeholder="https://www.instagram.com/reel/..."
                    value={formData.instagram_url}
                    onChange={(e) => setFormData({ ...formData, instagram_url: e.target.value })}
                    required
                  />
                </div>

                <div className="ps-form-group">
                  <label>Upload Reel Thumbnail (ps-perfumes/reels/...) *</label>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input type="file" accept="image/*" onChange={handleThumbnailUpload} />
                  </div>
                  <small style={{ color: 'var(--color-muted)', fontSize: 11, marginTop: 4 }}>
                    Use the real cover image from the Instagram Reel.
                  </small>
                </div>

                <div className="ps-form-group">
                  <label>Caption / Hook Text</label>
                  <textarea
                    rows="3"
                    placeholder="Describe the fragrance or unboxing ritual..."
                    value={formData.caption}
                    onChange={(e) => setFormData({ ...formData, caption: e.target.value })}
                  />
                </div>

                <div className="ps-form-row">
                  <div className="ps-form-group">
                    <label>Display Order</label>
                    <input
                      type="number"
                      value={formData.display_order}
                      onChange={(e) => setFormData({ ...formData, display_order: Number(e.target.value) })}
                    />
                  </div>
                  <div className="ps-form-group" style={{ justifyContent: 'center' }}>
                    <label className="ps-checkbox-label">
                      <input
                        type="checkbox"
                        checked={formData.is_active}
                        onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                      />
                      <span>Active on Website</span>
                    </label>
                  </div>
                </div>

                <div className="ps-modal-actions" style={{ marginTop: 8 }}>
                  <button type="button" className="ps-btn-cancel" onClick={() => setIsFormOpen(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="ps-btn-gold-primary" style={{ padding: '10px 18px' }}>
                    Save Reel
                  </button>
                </div>
              </div>

              {/* Live Preview Column */}
              <div>
                <span className="ps-admin-eyebrow" style={{ marginBottom: 8 }}>LIVE REEL PREVIEW</span>
                <div style={{ width: 180, height: 320, borderRadius: 6, overflow: 'hidden', background: '#000', border: '1px solid var(--color-border)', position: 'relative' }}>
                  {formData.thumbnail_url ? (
                    <img src={formData.thumbnail_url} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#555', fontSize: 11 }}>
                      No Thumbnail
                    </div>
                  )}
                  <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, transparent 50%, rgba(0,0,0,0.85) 100%)' }} />
                  <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', background: 'rgba(0,0,0,0.6)', borderRadius: '50%', padding: 10 }}>
                    <Play size={16} fill="#fff" color="#fff" />
                  </div>
                  {formData.caption && (
                    <p style={{ position: 'absolute', bottom: 8, left: 8, right: 8, margin: 0, fontSize: 10, color: '#fff', lineHeight: 1.3 }}>
                      {formData.caption}
                    </p>
                  )}
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
