import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, ArrowUp, ArrowDown, ExternalLink, Play, X, Upload, Loader2 } from 'lucide-react';
import { getReels, createReel, updateReel, deleteReel } from '../../services/reels';
import { uploadImage } from '../../lib/storage';

export default function AdminReels() {
  const [reels, setReels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingReel, setEditingReel] = useState(null);
  const [saving, setSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const [formData, setFormData] = useState({
    instagram_url: 'https://www.instagram.com/ps_perfumes_kadapa/?hl=en',
    thumbnail_url: '',
    caption: '',
    display_order: 1,
    is_active: true,
  });

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await getReels(true);
      setReels(data);
    } catch {
      setErrorMsg('Failed to load reels.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleNew = () => {
    setEditingReel(null);
    setErrorMsg('');
    setSuccessMsg('');
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
    setErrorMsg('');
    setSuccessMsg('');
    setFormData({
      instagram_url: reel.instagram_url || '',
      thumbnail_url: reel.thumbnail_url || '',
      caption: reel.caption || reel.title || '',
      display_order: reel.display_order || 1,
      is_active: reel.is_active !== false,
    });
    setIsFormOpen(true);
  };

  const handleThumbnailUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    e.target.value = '';
    setErrorMsg('');
    setIsUploading(true);

    try {
      const { url, error } = await uploadImage(file, 'reels', 'thumb');
      if (error) {
        setErrorMsg(`Failed to upload thumbnail: ${error}`);
      } else if (url) {
        setFormData((prev) => ({ ...prev, thumbnail_url: url }));
        setSuccessMsg('Thumbnail uploaded to Supabase Storage.');
        setTimeout(() => setSuccessMsg(''), 2500);
      }
    } catch (err) {
      setErrorMsg(`Upload error: ${err.message || 'Storage error'}`);
    } finally {
      setIsUploading(false);
    }
  };

  const validateInstagramUrl = (url) => {
    if (!url || typeof url !== 'string') return false;
    const clean = url.trim();
    return clean.includes('instagram.com') || clean.includes('instagr.am');
  };

  const handleSave = async (e) => {
    e.preventDefault();

    if (!validateInstagramUrl(formData.instagram_url)) {
      setErrorMsg('Please enter a valid Instagram URL (e.g. https://www.instagram.com/reel/...).');
      return;
    }

    if (!formData.thumbnail_url) {
      setErrorMsg('Please upload a 9:16 thumbnail image for this Instagram reel.');
      return;
    }

    if (formData.thumbnail_url.startsWith('blob:')) {
      setErrorMsg('Please wait for the thumbnail image upload to complete.');
      return;
    }

    setSaving(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      if (editingReel) {
        await updateReel(editingReel.id, formData);
        setSuccessMsg('Instagram Reel updated successfully.');
      } else {
        await createReel(formData);
        setSuccessMsg('Instagram Reel registered successfully.');
      }
      setTimeout(async () => {
        setIsFormOpen(false);
        await loadData();
      }, 700);
    } catch (err) {
      console.error('Save reel error:', err);
      setErrorMsg(`Failed to save reel: ${err.message || 'Database error'}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this Instagram Reel?')) {
      try {
        await deleteReel(id);
        setSuccessMsg('Reel deleted.');
        setTimeout(() => setSuccessMsg(''), 2500);
        await loadData();
      } catch (err) {
        setErrorMsg(`Failed to delete reel: ${err.message}`);
      }
    }
  };

  const handleMove = async (index, direction) => {
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= reels.length) return;

    const currentReel = reels[index];
    const targetReel = reels[targetIdx];

    try {
      const currentOrder = currentReel.display_order;
      const targetOrder = targetReel.display_order;

      await updateReel(currentReel.id, { display_order: targetOrder });
      await updateReel(targetReel.id, { display_order: currentOrder });
      await loadData();
    } catch (err) {
      setErrorMsg(`Failed to reorder reels: ${err.message}`);
    }
  };

  const handleToggleActive = async (reel) => {
    try {
      await updateReel(reel.id, { is_active: !reel.is_active });
      await loadData();
    } catch (err) {
      setErrorMsg(`Failed to toggle status: ${err.message}`);
    }
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

      {successMsg && <div className="ps-form-success-banner" style={{ margin: '16px 0' }}>{successMsg}</div>}
      {errorMsg && <div className="ps-form-error-banner" style={{ margin: '16px 0' }}>{errorMsg}</div>}

      {loading ? (
        <div className="ps-admin-loading" style={{ padding: '60px', textAlign: 'center' }}>Loading Reels...</div>
      ) : reels.length === 0 ? (
        <div className="ps-admin-empty-table" style={{ padding: '40px', textAlign: 'center', background: '#fff', borderRadius: '8px' }}>
          No Instagram reels registered yet. Click &quot;+ ADD INSTAGRAM REEL&quot; to register your first shoppable video.
        </div>
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
                    <div style={{ width: 50, height: 88, borderRadius: 4, overflow: 'hidden', background: '#000', border: '1px solid #ddd', position: 'relative' }}>
                      <img src={reel.thumbnail_url} alt="Reel thumbnail" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', background: 'rgba(0,0,0,0.6)', borderRadius: '50%', padding: 4 }}>
                        <Play size={10} fill="#fff" color="#fff" />
                      </div>
                    </div>
                  </td>
                  <td>
                    <div style={{ maxWidth: 280 }}>
                      <p style={{ margin: 0, fontSize: 13, color: '#1A1714', lineHeight: 1.4 }}>
                        {reel.caption || reel.title || 'No caption provided'}
                      </p>
                    </div>
                  </td>
                  <td>
                    <a
                      href={reel.instagram_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#C9A96E', fontSize: 12, textDecoration: 'underline' }}
                    >
                      <span>View on Instagram</span>
                      <ExternalLink size={12} />
                    </a>
                  </td>
                  <td>
                    <strong style={{ color: '#C9A96E' }}>#{reel.display_order}</strong>
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
                        className="ps-reorder-btn"
                        onClick={() => handleMove(idx, 'up')}
                        disabled={idx === 0}
                        title="Move Up"
                        style={{ opacity: idx === 0 ? 0.3 : 1 }}
                      >
                        <ArrowUp size={14} />
                      </button>
                      <button
                        type="button"
                        className="ps-reorder-btn"
                        onClick={() => handleMove(idx, 'down')}
                        disabled={idx === reels.length - 1}
                        title="Move Down"
                        style={{ opacity: idx === reels.length - 1 ? 0.3 : 1 }}
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
                        <Edit2 size={16} />
                      </button>
                      <button
                        type="button"
                        className="ps-action-icon-btn is-delete"
                        onClick={() => handleDelete(reel.id)}
                        title="Delete Reel"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal: Add / Edit Reel */}
      {isFormOpen && (
        <div className="ps-admin-modal-overlay" onClick={() => !saving && setIsFormOpen(false)}>
          <div className="ps-admin-modal-card" style={{ maxWidth: 600 }} onClick={(e) => e.stopPropagation()}>
            <div className="ps-modal-header">
              <h3>{editingReel ? 'Edit Instagram Reel' : 'Add Instagram Reel'}</h3>
              <button
                type="button"
                className="ps-modal-close"
                onClick={() => setIsFormOpen(false)}
                disabled={saving}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSave} style={{ display: 'grid', gridTemplateColumns: '1fr 180px', gap: 20 }}>
              <div>
                <div className="ps-form-group">
                  <label>Instagram URL *</label>
                  <input
                    type="url"
                    placeholder="https://www.instagram.com/reel/..."
                    value={formData.instagram_url}
                    onChange={(e) => setFormData({ ...formData, instagram_url: e.target.value })}
                    required
                  />
                </div>

                <div className="ps-form-group">
                  <label>Thumbnail Media (Supabase Storage: ps-perfumes/reels) *</label>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <label className="ps-combo-upload-btn" style={{ cursor: isUploading ? 'not-allowed' : 'pointer' }}>
                      {isUploading ? (
                        <Loader2 size={14} className="ps-spin" style={{ animation: 'spin 1s linear infinite' }} />
                      ) : (
                        <Upload size={14} color="#c8a45d" />
                      )}
                      <span>{isUploading ? 'Uploading...' : 'Upload 9:16 Thumbnail'}</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleThumbnailUpload}
                        disabled={isUploading}
                        style={{ display: 'none' }}
                      />
                    </label>
                  </div>
                  <small style={{ color: '#888', fontSize: 11, marginTop: 4, display: 'block' }}>
                    Recommended aspect ratio: 9:16 vertical cover image.
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
                    <label className="ps-checkbox-label" style={{ marginTop: 20 }}>
                      <input
                        type="checkbox"
                        checked={formData.is_active}
                        onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                      />
                      <span>Active on Website</span>
                    </label>
                  </div>
                </div>

                <div className="ps-modal-actions" style={{ marginTop: 16 }}>
                  <button type="button" className="ps-builder-btn-cancel" onClick={() => setIsFormOpen(false)} disabled={saving}>
                    Cancel
                  </button>
                  <button type="submit" className="ps-builder-btn-save" disabled={saving || isUploading}>
                    {saving ? 'Saving...' : 'Save Reel'}
                  </button>
                </div>
              </div>

              {/* Live Preview Column */}
              <div>
                <span className="ps-admin-eyebrow" style={{ marginBottom: 8, display: 'block' }}>LIVE PREVIEW</span>
                <div style={{ width: 180, height: 320, borderRadius: 6, overflow: 'hidden', background: '#000', border: '1px solid #ddd', position: 'relative' }}>
                  {formData.thumbnail_url ? (
                    <img src={formData.thumbnail_url} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888', fontSize: 11, padding: 12, textAlign: 'center' }}>
                      No Thumbnail Uploaded
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
