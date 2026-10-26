import React, { useState, useEffect, useRef } from 'react';
import { Plus, Edit2, Trash2, ArrowUp, ArrowDown, ExternalLink, Play, X, Upload, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { getReels, createReel, updateReel, deleteReel, validateInstagramUrl } from '../../services/reels';
import { uploadImage, cardImageUrl, fullImageFallback } from '../../lib/storage';
import './AdminReels.css';

const DEFAULT_INSTAGRAM_URL = 'https://www.instagram.com/ps_perfumes_kadapa/?hl=en';
// Same limits the shared Storage upload helper applies to images
const THUMB_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const MAX_THUMB_BYTES = 10 * 1024 * 1024;

const formatBytes = (n) => (n >= 1024 * 1024 ? `${(n / (1024 * 1024)).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`);

/** Pixel size of an image file, or null when the browser cannot decode it. */
async function readImageSize(file) {
  try {
    const bmp = await createImageBitmap(file);
    const size = { width: bmp.width, height: bmp.height };
    bmp.close?.();
    return size;
  } catch {
    return null;
  }
}

export default function AdminReels() {
  const [reels, setReels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingReel, setEditingReel] = useState(null);
  const [saving, setSaving] = useState(false);
  // Page-level messages (list actions); the modal has its own so they are never hidden behind it
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const [formData, setFormData] = useState({
    instagram_url: DEFAULT_INSTAGRAM_URL,
    thumbnail_url: '',
    thumbnail_path: '',
    caption: '',
    display_order: 1,
    is_active: true,
  });
  const [formError, setFormError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  // Thumbnail upload: { state: 'idle' | 'uploading' | 'done' | 'error', message, warning }
  const [upload, setUpload] = useState({ state: 'idle', message: '', warning: '' });
  const [localPreview, setLocalPreview] = useState('');
  const [brokenPreview, setBrokenPreview] = useState('');
  const submittingRef = useRef(false);
  // Incremented whenever the modal opens or closes, so a late upload result never lands in another form
  const formSessionRef = useRef(0);

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await getReels(true);
      setReels(data);
    } catch (err) {
      setErrorMsg(`Failed to load reels: ${err.message || 'database error'}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Release the local preview image when it is replaced or the page closes
  useEffect(() => () => {
    if (localPreview) URL.revokeObjectURL(localPreview);
  }, [localPreview]);

  const resetModalState = () => {
    formSessionRef.current += 1;
    setFormError('');
    setFieldErrors({});
    setUpload({ state: 'idle', message: '', warning: '' });
    setLocalPreview('');
  };

  const handleNew = () => {
    resetModalState();
    setEditingReel(null);
    setErrorMsg('');
    setSuccessMsg('');
    const maxOrder = reels.reduce((m, r) => Math.max(m, Number(r.display_order) || 0), 0);
    setFormData({
      instagram_url: DEFAULT_INSTAGRAM_URL,
      thumbnail_url: '',
      thumbnail_path: '',
      caption: '',
      display_order: maxOrder + 1,
      is_active: true,
    });
    setIsFormOpen(true);
  };

  const handleEdit = (reel) => {
    resetModalState();
    setEditingReel(reel);
    setErrorMsg('');
    setSuccessMsg('');
    setFormData({
      instagram_url: reel.instagram_url || '',
      // The stored value is saved back unchanged unless a new thumbnail is uploaded
      thumbnail_url: reel.stored_thumbnail_url || reel.thumbnail_url || '',
      thumbnail_path: reel.thumbnail_path || '',
      caption: reel.caption || reel.title || '',
      display_order: reel.display_order || 1,
      is_active: reel.is_active !== false,
    });
    setIsFormOpen(true);
  };

  const closeForm = () => {
    if (saving) return;
    resetModalState();
    setIsFormOpen(false);
  };

  const handleThumbnailSelect = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setFormError('');
    setFieldErrors((prev) => ({ ...prev, thumbnail: '' }));

    const type = (file.type || '').toLowerCase();
    if (!THUMB_TYPES.includes(type)) {
      setUpload({ state: 'error', message: `"${file.name}" is not a JPEG, PNG or WebP image. Use a 9:16 still from the reel.`, warning: '' });
      return;
    }
    if (file.size > MAX_THUMB_BYTES) {
      setUpload({ state: 'error', message: `"${file.name}" is ${formatBytes(file.size)}; the limit is 10 MB.`, warning: '' });
      return;
    }

    const session = formSessionRef.current;
    // Show the chosen image immediately, before the upload finishes
    setLocalPreview(URL.createObjectURL(file));

    const dims = await readImageSize(file);
    let warning = '';
    if (!dims) {
      warning = 'The image could not be read for a size check; it will still be uploaded.';
    } else {
      const ratio = dims.width / dims.height;
      if (Math.abs(ratio - 9 / 16) > 0.03) {
        warning = `This image is ${dims.width} × ${dims.height}. Thumbnails are shown as vertical 9:16 (for example 1080 × 1920), so it will be cropped.`;
      }
    }
    if (session !== formSessionRef.current) return;

    setUpload({ state: 'uploading', message: `Uploading ${file.name} (${formatBytes(file.size)}) to Storage folder reels/…`, warning });
    try {
      const { url, path, error } = await uploadImage(file, 'reels', 'thumb');
      if (session !== formSessionRef.current) return; // modal was closed or reopened meanwhile
      if (error || !url || !path) {
        setLocalPreview('');
        setUpload({
          state: 'error',
          message: `Thumbnail was not uploaded: ${error || 'Storage did not return the uploaded file.'}${formData.thumbnail_url ? ' The previous thumbnail is kept.' : ''}`,
          warning,
        });
        return;
      }
      setFormData((prev) => ({ ...prev, thumbnail_url: url, thumbnail_path: path }));
      // From now on the preview shows the uploaded file from its public Storage URL
      setLocalPreview('');
      setUpload({ state: 'done', message: `Uploaded to ${path}.`, warning });
    } catch (err) {
      if (session !== formSessionRef.current) return;
      setLocalPreview('');
      setUpload({ state: 'error', message: `Thumbnail was not uploaded: ${err.message || 'Storage error'}`, warning });
    }
  };

  const validateForm = () => {
    const errors = {};
    try {
      validateInstagramUrl(formData.instagram_url);
    } catch (err) {
      errors.instagram_url = err.message;
    }
    if (upload.state === 'uploading') {
      errors.thumbnail = 'Wait for the thumbnail upload to finish.';
    } else if (!formData.thumbnail_url) {
      errors.thumbnail = 'Upload a 9:16 thumbnail image for this reel.';
    }
    const order = Number(formData.display_order);
    if (!Number.isInteger(order) || order < 1) {
      errors.display_order = 'Display order must be a whole number of 1 or more.';
    }
    return errors;
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (submittingRef.current) return;

    const errors = validateForm();
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      setFormError('Please fix the highlighted fields.');
      return;
    }

    submittingRef.current = true;
    setSaving(true);
    setFormError('');

    const payload = {
      instagram_url: formData.instagram_url.trim(),
      thumbnail_url: formData.thumbnail_url,
      thumbnail_path: formData.thumbnail_path || '',
      caption: formData.caption.trim(),
      display_order: Number(formData.display_order),
      is_active: Boolean(formData.is_active),
    };

    try {
      if (editingReel) {
        await updateReel(editingReel.id, payload);
      } else {
        await createReel(payload);
      }
      resetModalState();
      setIsFormOpen(false);
      setSuccessMsg(editingReel ? 'Instagram reel updated.' : 'Instagram reel added.');
      setTimeout(() => setSuccessMsg(''), 3000);
      await loadData();
    } catch (err) {
      console.error('Save reel error:', err);
      setFormError(`Reel was not saved: ${err.message || 'Database error'}`);
    } finally {
      submittingRef.current = false;
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
      // Reels sharing a display order would not move by swapping: use list positions then
      const sameOrder = Number(currentReel.display_order) === Number(targetReel.display_order);
      const currentOrder = sameOrder ? index + 1 : currentReel.display_order;
      const targetOrder = sameOrder ? targetIdx + 1 : targetReel.display_order;

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

  const previewSrc = localPreview || (editingReel && formData.thumbnail_url === (editingReel.stored_thumbnail_url || editingReel.thumbnail_url)
    ? editingReel.thumbnail_url
    : formData.thumbnail_url);
  const isUploading = upload.state === 'uploading';

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

      {successMsg && <div className="ps-form-success-banner" role="status" style={{ margin: '16px 0' }}>{successMsg}</div>}
      {errorMsg && <div className="ps-form-error-banner" role="alert" style={{ margin: '16px 0' }}>{errorMsg}</div>}

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
                      {reel.thumbnail_url ? (
                        <img src={cardImageUrl(reel.thumbnail_url)} loading="lazy" decoding="async" onError={fullImageFallback(reel.thumbnail_url)} alt="Reel thumbnail" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : null}
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
        <div className="ps-admin-modal-overlay" onClick={closeForm}>
          <div
            className="ps-admin-modal-card ps-reel-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ps-reel-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="ps-reel-modal-header">
              <h3 id="ps-reel-modal-title">{editingReel ? 'Edit Instagram Reel' : 'Add Instagram Reel'}</h3>
              <button type="button" className="ps-reel-modal-close" onClick={closeForm} disabled={saving} aria-label="Close">
                <X size={18} />
              </button>
            </div>

            {formError && <div className="ps-reel-alert is-error" role="alert"><AlertCircle size={14} /> <span>{formError}</span></div>}

            <form onSubmit={handleSave} className="ps-reel-modal-form" noValidate>
              <div className="ps-reel-modal-fields">
                <div className="ps-reel-field">
                  <label htmlFor="reel-url">Instagram URL *</label>
                  <input
                    id="reel-url"
                    type="url"
                    placeholder="https://www.instagram.com/reel/..."
                    value={formData.instagram_url}
                    onChange={(e) => {
                      setFormData({ ...formData, instagram_url: e.target.value });
                      if (fieldErrors.instagram_url) setFieldErrors((p) => ({ ...p, instagram_url: '' }));
                    }}
                    aria-invalid={Boolean(fieldErrors.instagram_url)}
                    disabled={saving}
                  />
                  {fieldErrors.instagram_url ? (
                    <small className="ps-reel-field-error">{fieldErrors.instagram_url}</small>
                  ) : (
                    <small className="ps-reel-hint">A reel or post link (…/reel/CODE/) or the profile link.</small>
                  )}
                </div>

                <div className="ps-reel-field">
                  <span className="ps-reel-label">Thumbnail (Storage folder reels/) *</span>
                  <label className={`ps-reel-upload-btn ${isUploading || saving ? 'is-disabled' : ''}`}>
                    {isUploading ? <Loader2 size={14} className="ps-reel-spin" /> : <Upload size={14} />}
                    <span>{isUploading ? 'Uploading…' : formData.thumbnail_url ? 'Replace 9:16 Thumbnail' : 'Upload 9:16 Thumbnail'}</span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={handleThumbnailSelect}
                      disabled={isUploading || saving}
                      hidden
                    />
                  </label>
                  <small className="ps-reel-hint">JPEG, PNG or WebP, up to 10 MB. Vertical 9:16, e.g. 1080 × 1920.</small>
                  {isUploading && (
                    <div className="ps-reel-progress" role="status">
                      <div className="ps-reel-progress-bar" />
                      <small>{upload.message}</small>
                    </div>
                  )}
                  {upload.state === 'done' && (
                    <small className="ps-reel-ok"><CheckCircle size={12} /> {upload.message}</small>
                  )}
                  {upload.state === 'error' && <small className="ps-reel-field-error" role="alert">{upload.message}</small>}
                  {upload.warning && <small className="ps-reel-warn">{upload.warning}</small>}
                  {fieldErrors.thumbnail && upload.state !== 'error' && (
                    <small className="ps-reel-field-error">{fieldErrors.thumbnail}</small>
                  )}
                </div>

                <div className="ps-reel-field">
                  <label htmlFor="reel-caption">Caption / Hook Text</label>
                  <textarea
                    id="reel-caption"
                    rows="3"
                    placeholder="Describe the fragrance or unboxing ritual..."
                    value={formData.caption}
                    onChange={(e) => setFormData({ ...formData, caption: e.target.value })}
                    disabled={saving}
                  />
                </div>

                <div className="ps-reel-row">
                  <div className="ps-reel-field">
                    <label htmlFor="reel-order">Display Order</label>
                    <input
                      id="reel-order"
                      type="number"
                      min="1"
                      step="1"
                      value={formData.display_order}
                      onChange={(e) => {
                        setFormData({ ...formData, display_order: e.target.value });
                        if (fieldErrors.display_order) setFieldErrors((p) => ({ ...p, display_order: '' }));
                      }}
                      aria-invalid={Boolean(fieldErrors.display_order)}
                      disabled={saving}
                    />
                    {fieldErrors.display_order && <small className="ps-reel-field-error">{fieldErrors.display_order}</small>}
                  </div>
                  <label className="ps-reel-checkbox">
                    <input
                      type="checkbox"
                      checked={formData.is_active}
                      onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                      disabled={saving}
                    />
                    <span>Active on Website</span>
                  </label>
                </div>

                <div className="ps-reel-actions">
                  <button type="button" className="ps-reel-btn-cancel" onClick={closeForm} disabled={saving}>
                    Cancel
                  </button>
                  <button type="submit" className="ps-reel-btn-save" disabled={saving || isUploading}>
                    {saving ? 'Saving…' : 'Save Reel'}
                  </button>
                </div>
              </div>

              {/* Live Preview Column */}
              <div className="ps-reel-preview-col">
                <span className="ps-admin-eyebrow">LIVE PREVIEW</span>
                <div className="ps-reel-preview">
                  {previewSrc && brokenPreview === previewSrc ? (
                    <div className="ps-reel-preview-empty is-error">
                      The image could not be loaded from {previewSrc.startsWith('blob:') ? 'this file' : 'its Storage URL'}.
                    </div>
                  ) : previewSrc ? (
                    <img src={previewSrc} alt="Thumbnail preview" onError={() => setBrokenPreview(previewSrc)} />
                  ) : (
                    <div className="ps-reel-preview-empty">No Thumbnail Uploaded</div>
                  )}
                  <div className="ps-reel-preview-vignette" />
                  <div className="ps-reel-preview-play">
                    <Play size={16} fill="#fff" color="#fff" />
                  </div>
                  {isUploading && <div className="ps-reel-preview-status">Uploading…</div>}
                  {formData.caption && <p className="ps-reel-preview-caption">{formData.caption}</p>}
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
