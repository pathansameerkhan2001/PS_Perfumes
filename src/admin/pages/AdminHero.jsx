import React, { useState, useEffect } from 'react';
import {
  Plus,
  Trash2,
  Edit,
  Eye,
  EyeOff,
  Upload,
  X,
  ArrowUp,
  ArrowDown,
  Loader2,
} from 'lucide-react';
import {
  getHeroSlides,
  createHeroSlide,
  updateHeroSlide,
  deleteHeroSlide,
  pickHeroFilm,
  isMp4Reference,
  isImageReference,
} from '../../services/hero';
import { uploadImage } from '../../lib/storage';
import './AdminProductForm.css';

/*
 * Admin → Hero Sections manages the homepage's video-only hero (no text or buttons on the site).
 * The homepage plays the ACTIVE record with the LOWEST display order that has an MP4 film;
 * with none, the built-in film is used. Existing hero_slides columns are reused:
 *   film   → image_url / image_path        poster → mobile_image_url / mobile_image_path
 *   label  → title (admin only)            heading/eyebrow/button columns are left untouched.
 */

const POSTER_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const EMPTY_FORM = {
  desktop_image: '',
  desktop_image_path: '',
  mobile_image: '',
  mobile_image_path: '',
  heading: '',
  display_order: 1,
  is_active: true,
};

export default function AdminHero() {
  const [slides, setSlides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadingField, setUploadingField] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [form, setForm] = useState(EMPTY_FORM);

  const loadSlides = async () => {
    setLoading(true);
    try {
      const data = await getHeroSlides(false);
      setSlides(data);
    } catch (err) {
      setErrorMsg(`Could not load hero records: ${err.message || 'database error'}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSlides();
  }, []);

  // The record the homepage currently plays (same rule as the storefront)
  const liveFilm = pickHeroFilm(slides);

  const handleOpenAdd = () => {
    setEditingId(null);
    setErrorMsg('');
    setSuccessMsg('');
    setForm({ ...EMPTY_FORM, display_order: slides.length + 1 });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (slide) => {
    setEditingId(slide.id);
    setErrorMsg('');
    setSuccessMsg('');
    // Only the film, poster, label, order and status are edited; other columns stay as they are
    setForm({
      desktop_image: slide.desktop_image || slide.image_url || '',
      desktop_image_path: slide.desktop_image_path || slide.image_path || '',
      mobile_image: slide.mobile_image || slide.mobile_image_url || '',
      mobile_image_path: slide.mobile_image_path || '',
      heading: slide.heading || slide.title || '',
      display_order: slide.display_order || 1,
      is_active: slide.is_active !== false,
    });
    setIsModalOpen(true);
  };

  const handleUpload = async (field, file) => {
    if (!file) return;
    setErrorMsg('');
    const isFilm = field === 'desktop_image';
    const type = (file.type || '').toLowerCase();
    if (isFilm && type !== 'video/mp4') {
      setErrorMsg(`"${file.name}" is not an MP4 video. The hero film must be an MP4 file.`);
      return;
    }
    if (!isFilm && !POSTER_TYPES.includes(type === 'image/jpg' ? 'image/jpeg' : type)) {
      setErrorMsg(`"${file.name}" is not a JPEG, PNG or WebP image. The poster must be an image.`);
      return;
    }

    setIsUploading(true);
    setUploadingField(field);
    try {
      const { url, path, error } = await uploadImage(file, 'hero', isFilm ? 'hero-film' : 'hero-poster');
      if (error || !url) {
        setErrorMsg(`Upload failed: ${error || 'Storage did not return the uploaded file.'}`);
      } else {
        setForm((prev) => ({ ...prev, [field]: url, [`${field}_path`]: path }));
        setSuccessMsg(isFilm ? 'Hero film uploaded.' : 'Poster image uploaded.');
        setTimeout(() => setSuccessMsg(''), 3000);
      }
    } catch (err) {
      setErrorMsg(`Upload error: ${err.message || 'Storage error'}`);
    } finally {
      setIsUploading(false);
      setUploadingField(null);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.desktop_image) {
      setErrorMsg('A hero film (MP4) is required. Upload one or paste its public URL.');
      return;
    }
    if (!isMp4Reference(form.desktop_image_path || form.desktop_image)) {
      setErrorMsg('The hero film must be an MP4 file (its URL or path must end in .mp4).');
      return;
    }
    if (form.mobile_image && !isImageReference(form.mobile_image_path || form.mobile_image)) {
      setErrorMsg('The poster must be a JPEG, PNG or WebP image.');
      return;
    }

    setSaving(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      if (editingId) {
        await updateHeroSlide(editingId, form);
        setSuccessMsg('Hero film updated.');
      } else {
        await createHeroSlide(form);
        setSuccessMsg('Hero film added.');
      }
      setIsModalOpen(false);
      await loadSlides();
    } catch (err) {
      console.error('Save hero film error:', err);
      setErrorMsg(`Failed to save: ${err.message || 'Database error'}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    // Deletes the database record only; the uploaded files stay in Storage
    if (window.confirm('Delete this hero record? The uploaded film and poster files are kept in Storage.')) {
      try {
        await deleteHeroSlide(id);
        setSuccessMsg('Hero record deleted.');
        setTimeout(() => setSuccessMsg(''), 2500);
        await loadSlides();
      } catch (err) {
        setErrorMsg(`Failed to delete: ${err.message}`);
      }
    }
  };

  const handleToggleActive = async (slide) => {
    try {
      await updateHeroSlide(slide.id, { is_active: !slide.is_active });
      await loadSlides();
    } catch (err) {
      setErrorMsg(`Failed to update status: ${err.message}`);
    }
  };

  const handleReorder = async (index, direction) => {
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= slides.length) return;
    const currentSlide = slides[index];
    const targetSlide = slides[targetIdx];
    // Records sharing a display order would not move by swapping: use list positions then
    const sameOrder = Number(currentSlide.display_order) === Number(targetSlide.display_order);
    const currentOrder = sameOrder ? index + 1 : currentSlide.display_order;
    const targetOrder = sameOrder ? targetIdx + 1 : targetSlide.display_order;
    try {
      await updateHeroSlide(currentSlide.id, { display_order: targetOrder });
      await updateHeroSlide(targetSlide.id, { display_order: currentOrder });
      await loadSlides();
    } catch (err) {
      setErrorMsg(`Failed to reorder: ${err.message}`);
    }
  };

  if (loading) {
    return <div className="ps-admin-loading" style={{ padding: '60px', textAlign: 'center' }}>Retrieving hero films...</div>;
  }

  const mediaBox = {
    width: '96px',
    height: '54px',
    objectFit: 'cover',
    borderRadius: '6px',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    background: '#0D0D0D',
    display: 'block',
  };

  return (
    <div className="ps-admin-combos-page">
      <div className="ps-admin-page-header">
        <div>
          <span className="ps-admin-eyebrow">HOMEPAGE HERO</span>
          <h1 className="ps-admin-page-title">Hero Film</h1>
          <p className="ps-admin-page-subtitle" style={{ maxWidth: 680 }}>
            The homepage plays the <strong>active</strong> record with the <strong>lowest display order</strong> that
            has an MP4 film — muted, looping and without any text or buttons. With no such record, the built-in film is
            shown. The poster appears while the film loads, for visitors who prefer reduced motion, and if playback fails.
          </p>
        </div>

        <button type="button" className="ps-btn-gold-primary ps-admin-header-btn" onClick={handleOpenAdd}>
          <Plus size={16} />
          <span>ADD HERO FILM</span>
        </button>
      </div>

      {successMsg && <div className="ps-form-success-banner">{successMsg}</div>}
      {errorMsg && <div className="ps-form-error-banner" role="alert">{errorMsg}</div>}

      {!liveFilm && (
        <div className="ps-form-success-banner" role="status">
          No active hero film is configured, so the homepage shows the built-in film
          (hero/ps-perfumes-hero-desktop.mp4).
        </div>
      )}

      <div className="ps-admin-table-card">
        <div className="ps-admin-table-wrap">
          <table className="ps-admin-table">
            <thead>
              <tr>
                <th>Order</th>
                <th>Film</th>
                <th>Poster</th>
                <th>Label</th>
                <th>Status</th>
                <th>Reorder</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {slides.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '28px' }}>
                    No hero records yet. Add a hero film to replace the built-in one.
                  </td>
                </tr>
              )}
              {slides.map((s, idx) => {
                const filmRef = s.desktop_image || s.image_url;
                const hasFilm = isMp4Reference(s.image_path || filmRef);
                const posterRef = s.mobile_image || s.mobile_image_url;
                const isLive = liveFilm?.id === s.id;
                return (
                  <tr key={s.id}>
                    <td>
                      <strong style={{ color: '#c8a45d' }}>#{s.display_order}</strong>
                    </td>
                    <td>
                      {hasFilm ? (
                        <video src={filmRef} muted playsInline preload="metadata" style={mediaBox} aria-label="Hero film preview" />
                      ) : (
                        <span className="ps-cell-muted">No MP4</span>
                      )}
                    </td>
                    <td>
                      {posterRef && isImageReference(s.mobile_image_path || posterRef) ? (
                        <img src={posterRef} alt="Poster" style={mediaBox} />
                      ) : (
                        <span className="ps-cell-muted">Built-in poster</span>
                      )}
                    </td>
                    <td>
                      <strong>{s.heading || s.title || 'Untitled'}</strong>
                    </td>
                    <td>
                      <span className={`ps-status-pill ${s.is_active !== false ? 'ps-status-confirmed' : 'ps-status-cancelled'}`}>
                        {s.is_active !== false ? 'Active' : 'Disabled'}
                      </span>
                      {isLive && (
                        <span className="ps-status-pill ps-status-confirmed" style={{ display: 'block', marginTop: 4 }}>
                          Shown on homepage
                        </span>
                      )}
                      {!hasFilm && (
                        <span
                          className="ps-status-pill ps-status-cancelled"
                          style={{ display: 'block', marginTop: 4 }}
                          title="Records without an MP4 film (e.g. older image slides) are ignored by the homepage"
                        >
                          Not used: no MP4 film
                        </span>
                      )}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button
                          type="button"
                          className="ps-action-icon-btn"
                          disabled={idx === 0}
                          onClick={() => handleReorder(idx, 'up')}
                          title="Move up"
                          aria-label="Move up"
                          style={{ opacity: idx === 0 ? 0.3 : 1 }}
                        >
                          <ArrowUp size={14} />
                        </button>
                        <button
                          type="button"
                          className="ps-action-icon-btn"
                          disabled={idx === slides.length - 1}
                          onClick={() => handleReorder(idx, 'down')}
                          title="Move down"
                          aria-label="Move down"
                          style={{ opacity: idx === slides.length - 1 ? 0.3 : 1 }}
                        >
                          <ArrowDown size={14} />
                        </button>
                      </div>
                    </td>
                    <td>
                      <div className="ps-table-actions">
                        <button type="button" className="ps-action-icon-btn" onClick={() => handleOpenEdit(s)} title="Edit" aria-label="Edit">
                          <Edit size={16} />
                        </button>
                        <button
                          type="button"
                          className="ps-action-icon-btn"
                          onClick={() => handleToggleActive(s)}
                          title={s.is_active !== false ? 'Disable' : 'Enable'}
                          aria-label={s.is_active !== false ? 'Disable' : 'Enable'}
                        >
                          {s.is_active !== false ? <Eye size={16} /> : <EyeOff size={16} />}
                        </button>
                        <button
                          type="button"
                          className="ps-action-icon-btn is-delete"
                          onClick={() => handleDelete(s.id)}
                          title="Delete"
                          aria-label="Delete"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Add / Edit hero film */}
      {isModalOpen && (
        <div className="ps-admin-modal-overlay" onClick={() => !saving && setIsModalOpen(false)}>
          <div className="ps-admin-modal-card" style={{ maxWidth: '640px' }} onClick={(e) => e.stopPropagation()}>
            <div className="ps-modal-header">
              <h3>{editingId ? 'Edit Hero Film' : 'Add Hero Film'}</h3>
              <button type="button" className="ps-modal-close" onClick={() => setIsModalOpen(false)} disabled={saving} aria-label="Close">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSave}>
              <div className="ps-form-row">
                <div className="ps-form-group">
                  <label htmlFor="hero-film">Hero film (MP4) *</label>
                  <input
                    id="hero-film"
                    type="text"
                    value={form.desktop_image}
                    onChange={(e) => setForm({ ...form, desktop_image: e.target.value, desktop_image_path: '' })}
                    placeholder="Upload an MP4, or paste its public URL"
                    required
                  />
                  {form.desktop_image && isMp4Reference(form.desktop_image_path || form.desktop_image) && (
                    <video
                      src={form.desktop_image}
                      muted
                      playsInline
                      controls
                      preload="metadata"
                      style={{ marginTop: '8px', width: '100%', maxHeight: '140px', borderRadius: '4px', background: '#000' }}
                    />
                  )}
                  <label className="ps-combo-upload-btn" style={{ marginTop: '6px', cursor: isUploading ? 'not-allowed' : 'pointer' }}>
                    {uploadingField === 'desktop_image' ? (
                      <Loader2 size={14} className="ps-spin" style={{ animation: 'spin 1s linear infinite' }} />
                    ) : (
                      <Upload size={14} color="#c8a45d" />
                    )}
                    <span>{uploadingField === 'desktop_image' ? 'Uploading...' : 'Upload MP4 film'}</span>
                    <input
                      type="file"
                      accept="video/mp4"
                      onChange={(e) => handleUpload('desktop_image', e.target.files?.[0])}
                      disabled={isUploading}
                      style={{ display: 'none' }}
                    />
                  </label>
                  <span className="ps-form-hint">Saved to Storage folder hero/. Max 50 MB (bucket limit).</span>
                </div>

                <div className="ps-form-group">
                  <label htmlFor="hero-poster">Poster image (optional)</label>
                  <input
                    id="hero-poster"
                    type="text"
                    value={form.mobile_image}
                    onChange={(e) => setForm({ ...form, mobile_image: e.target.value, mobile_image_path: '' })}
                    placeholder="Upload an image, or leave empty for the built-in poster"
                  />
                  {form.mobile_image && (
                    <div style={{ marginTop: '8px', height: '80px', borderRadius: '4px', overflow: 'hidden', border: '1px solid #ddd' }}>
                      <img src={form.mobile_image} alt="Poster preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    </div>
                  )}
                  <label className="ps-combo-upload-btn" style={{ marginTop: '6px', cursor: isUploading ? 'not-allowed' : 'pointer' }}>
                    {uploadingField === 'mobile_image' ? (
                      <Loader2 size={14} className="ps-spin" style={{ animation: 'spin 1s linear infinite' }} />
                    ) : (
                      <Upload size={14} color="#c8a45d" />
                    )}
                    <span>{uploadingField === 'mobile_image' ? 'Uploading...' : 'Upload poster'}</span>
                    <input
                      type="file"
                      accept={POSTER_TYPES.join(',')}
                      onChange={(e) => handleUpload('mobile_image', e.target.files?.[0])}
                      disabled={isUploading}
                      style={{ display: 'none' }}
                    />
                  </label>
                  <span className="ps-form-hint">JPEG, PNG or WebP, ideally a still from the film.</span>
                </div>
              </div>

              <div className="ps-form-row">
                <div className="ps-form-group">
                  <label htmlFor="hero-label">Admin label (not shown on the site)</label>
                  <input
                    id="hero-label"
                    type="text"
                    value={form.heading}
                    onChange={(e) => setForm({ ...form, heading: e.target.value })}
                    placeholder="e.g. Festive film 2026"
                  />
                </div>
                <div className="ps-form-group">
                  <label htmlFor="hero-order">Display order</label>
                  <input
                    id="hero-order"
                    type="number"
                    min="1"
                    value={form.display_order}
                    onChange={(e) => setForm({ ...form, display_order: parseInt(e.target.value, 10) || 1 })}
                  />
                </div>
              </div>

              <div className="ps-form-group">
                <label className="ps-checkbox-label">
                  <input
                    type="checkbox"
                    checked={form.is_active}
                    onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                  />
                  <span>Active (eligible to be shown on the homepage)</span>
                </label>
              </div>

              <div className="ps-modal-actions">
                <button type="button" className="ps-builder-btn-cancel" onClick={() => setIsModalOpen(false)} disabled={saving}>
                  Cancel
                </button>
                <button type="submit" className="ps-builder-btn-save" disabled={saving || isUploading}>
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
