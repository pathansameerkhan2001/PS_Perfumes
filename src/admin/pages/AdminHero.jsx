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
} from '../../services/hero';
import { uploadImage } from '../../lib/storage';
import './AdminProductForm.css';

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

  const [form, setForm] = useState({
    desktop_image: '',
    mobile_image: '',
    eyebrow: 'ROYAL OUD ATELIER',
    heading: '',
    description: '',
    cta_text: 'EXPLORE COLLECTION',
    cta_link: '/category/oud',
    display_order: 1,
    is_active: true,
  });

  const loadSlides = async () => {
    setLoading(true);
    try {
      const data = await getHeroSlides(false);
      setSlides(data);
    } catch {
      setErrorMsg('Failed to load hero slides from database.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSlides();
  }, []);

  const handleOpenAdd = () => {
    setEditingId(null);
    setErrorMsg('');
    setSuccessMsg('');
    setForm({
      desktop_image: '',
      mobile_image: '',
      eyebrow: 'ROYAL OUD ATELIER',
      heading: 'Imperial Artisanal Extractions',
      description: 'Centuries-old steam distillation in pure sandalwood and amber bases.',
      cta_text: 'EXPLORE COLLECTION',
      cta_link: '/category/oud',
      display_order: slides.length + 1,
      is_active: true,
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (slide) => {
    setEditingId(slide.id);
    setErrorMsg('');
    setSuccessMsg('');
    setForm({
      desktop_image: slide.desktop_image || slide.image_url || '',
      mobile_image: slide.mobile_image || slide.mobile_image_url || '',
      eyebrow: slide.eyebrow || slide.subtitle || '',
      heading: slide.heading || slide.title || '',
      description: slide.description || '',
      cta_text: slide.cta_text || slide.button_text || 'EXPLORE COLLECTION',
      cta_link: slide.cta_link || slide.button_link || '/category/oud',
      display_order: slide.display_order || 1,
      is_active: slide.is_active !== false,
    });
    setIsModalOpen(true);
  };

  const handleImageUpload = async (field, file) => {
    if (!file) return;
    setErrorMsg('');
    setIsUploading(true);
    setUploadingField(field);

    try {
      const { url, error } = await uploadImage(file, 'hero', `hero-${field}`);
      if (error) {
        setErrorMsg(`Failed to upload ${field}: ${error}`);
      } else if (url) {
        setForm((prev) => ({ ...prev, [field]: url }));
        setSuccessMsg(`${field === 'desktop_image' ? 'Desktop' : 'Mobile'} media uploaded successfully.`);
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
      setErrorMsg('Desktop Media is required. Please provide a URL or upload an image.');
      return;
    }

    setSaving(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      if (editingId) {
        await updateHeroSlide(editingId, form);
        setSuccessMsg('Hero slide updated successfully.');
      } else {
        await createHeroSlide(form);
        setSuccessMsg('Hero slide created successfully.');
      }
      setTimeout(async () => {
        setIsModalOpen(false);
        await loadSlides();
      }, 700);
    } catch (err) {
      console.error('Save hero slide error:', err);
      setErrorMsg(`Failed to save slide: ${err.message || 'Database error'}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this hero showcase slide?')) {
      try {
        await deleteHeroSlide(id);
        setSuccessMsg('Hero slide deleted successfully.');
        setTimeout(() => setSuccessMsg(''), 2500);
        await loadSlides();
      } catch (err) {
        setErrorMsg(`Failed to delete slide: ${err.message}`);
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

    try {
      const currentOrder = currentSlide.display_order;
      const targetOrder = targetSlide.display_order;

      await updateHeroSlide(currentSlide.id, { display_order: targetOrder });
      await updateHeroSlide(targetSlide.id, { display_order: currentOrder });
      await loadSlides();
    } catch (err) {
      setErrorMsg(`Failed to reorder: ${err.message}`);
    }
  };

  if (loading) {
    return <div className="ps-admin-loading" style={{ padding: '60px', textAlign: 'center' }}>Retrieving hero slides...</div>;
  }

  return (
    <div className="ps-admin-combos-page">
      <div className="ps-admin-page-header">
        <div>
          <span className="ps-admin-eyebrow">STOREFRONT BILLBOARDS</span>
          <h1 className="ps-admin-page-title">Hero Cinematic Slides</h1>
        </div>

        <button
          type="button"
          className="ps-btn-gold-primary ps-admin-header-btn"
          onClick={handleOpenAdd}
        >
          <Plus size={16} />
          <span>ADD HERO SLIDE</span>
        </button>
      </div>

      {successMsg && <div className="ps-form-success-banner">{successMsg}</div>}
      {errorMsg && <div className="ps-form-error-banner">{errorMsg}</div>}

      <div className="ps-admin-table-card">
        <div className="ps-admin-table-wrap">
          <table className="ps-admin-table">
            <thead>
              <tr>
                <th>Order</th>
                <th>Desktop Media</th>
                <th>Mobile Media</th>
                <th>Heading & Tag</th>
                <th>CTA Destination</th>
                <th>Status</th>
                <th>Reorder</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {slides.map((s, idx) => (
                <tr key={s.id}>
                  <td>
                    <strong style={{ color: '#c8a45d' }}>#{s.display_order}</strong>
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <img
                        src={s.desktop_image || s.image_url}
                        alt={s.heading || 'Hero'}
                        style={{
                          width: '90px',
                          height: '48px',
                          objectFit: 'cover',
                          borderRadius: '6px',
                          border: '1px solid rgba(255, 255, 255, 0.1)',
                        }}
                      />
                    </div>
                  </td>
                  <td>
                    <img
                      src={s.mobile_image || s.mobile_image_url || s.desktop_image}
                      alt={s.heading || 'Mobile'}
                      style={{
                        width: '36px',
                        height: '48px',
                        objectFit: 'cover',
                        borderRadius: '6px',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                      }}
                    />
                  </td>
                  <td>
                    <div>
                      <strong>{s.heading || s.title || 'Hero Showcase'}</strong>
                      {(s.eyebrow || s.subtitle) && (
                        <span style={{ display: 'block', fontSize: '11px', color: '#8c847a' }}>
                          {s.eyebrow || s.subtitle}
                        </span>
                      )}
                    </div>
                  </td>
                  <td>
                    <span className="ps-cell-muted">{s.cta_link || s.button_link || '/'}</span>
                  </td>
                  <td>
                    <span
                      className={`ps-status-pill ${
                        s.is_active !== false ? 'ps-status-confirmed' : 'ps-status-cancelled'
                      }`}
                    >
                      {s.is_active !== false ? 'Active' : 'Disabled'}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button
                        type="button"
                        className="ps-action-icon-btn"
                        disabled={idx === 0}
                        onClick={() => handleReorder(idx, 'up')}
                        title="Move Up"
                        style={{ opacity: idx === 0 ? 0.3 : 1 }}
                      >
                        <ArrowUp size={14} />
                      </button>
                      <button
                        type="button"
                        className="ps-action-icon-btn"
                        disabled={idx === slides.length - 1}
                        onClick={() => handleReorder(idx, 'down')}
                        title="Move Down"
                        style={{ opacity: idx === slides.length - 1 ? 0.3 : 1 }}
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
                        onClick={() => handleOpenEdit(s)}
                        title="Edit Slide"
                      >
                        <Edit size={16} />
                      </button>
                      <button
                        type="button"
                        className="ps-action-icon-btn"
                        onClick={() => handleToggleActive(s)}
                        title={s.is_active !== false ? 'Disable' : 'Enable'}
                      >
                        {s.is_active !== false ? <Eye size={16} /> : <EyeOff size={16} />}
                      </button>
                      <button
                        type="button"
                        className="ps-action-icon-btn is-delete"
                        onClick={() => handleDelete(s.id)}
                        title="Delete Slide"
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
      </div>

      {/* Modal: Add / Edit Slide */}
      {isModalOpen && (
        <div className="ps-admin-modal-overlay" onClick={() => !saving && setIsModalOpen(false)}>
          <div
            className="ps-admin-modal-card"
            style={{ maxWidth: '640px' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="ps-modal-header">
              <h3>{editingId ? 'Edit Hero Slide' : 'Add Hero Slide'}</h3>
              <button
                type="button"
                className="ps-modal-close"
                onClick={() => setIsModalOpen(false)}
                disabled={saving}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSave}>
              <div className="ps-form-row">
                <div className="ps-form-group">
                  <label>Desktop Media (Image/Video) *</label>
                  <input
                    type="text"
                    value={form.desktop_image}
                    onChange={(e) => setForm({ ...form, desktop_image: e.target.value })}
                    placeholder="/assets/hero-luxury-cinematic.png"
                    required
                  />
                  {form.desktop_image && (
                    <div style={{ marginTop: '8px', height: '60px', borderRadius: '4px', overflow: 'hidden', border: '1px solid #ddd' }}>
                      <img src={form.desktop_image} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    </div>
                  )}
                  <label className="ps-combo-upload-btn" style={{ marginTop: '6px', cursor: isUploading ? 'not-allowed' : 'pointer' }}>
                    {uploadingField === 'desktop_image' ? (
                      <Loader2 size={14} className="ps-spin" style={{ animation: 'spin 1s linear infinite' }} />
                    ) : (
                      <Upload size={14} color="#c8a45d" />
                    )}
                    <span>{uploadingField === 'desktop_image' ? 'Uploading...' : 'Upload Desktop Media'}</span>
                    <input
                      type="file"
                      accept="image/*,video/mp4"
                      onChange={(e) => handleImageUpload('desktop_image', e.target.files?.[0])}
                      disabled={isUploading}
                      style={{ display: 'none' }}
                    />
                  </label>
                </div>

                <div className="ps-form-group">
                  <label>Mobile Media (Optional)</label>
                  <input
                    type="text"
                    value={form.mobile_image}
                    onChange={(e) => setForm({ ...form, mobile_image: e.target.value })}
                    placeholder="/assets/hero-luxury-cinematic-mobile.png"
                  />
                  {form.mobile_image && (
                    <div style={{ marginTop: '8px', height: '60px', width: '50px', borderRadius: '4px', overflow: 'hidden', border: '1px solid #ddd' }}>
                      <img src={form.mobile_image} alt="Mobile preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    </div>
                  )}
                  <label className="ps-combo-upload-btn" style={{ marginTop: '6px', cursor: isUploading ? 'not-allowed' : 'pointer' }}>
                    {uploadingField === 'mobile_image' ? (
                      <Loader2 size={14} className="ps-spin" style={{ animation: 'spin 1s linear infinite' }} />
                    ) : (
                      <Upload size={14} color="#c8a45d" />
                    )}
                    <span>{uploadingField === 'mobile_image' ? 'Uploading...' : 'Upload Mobile Media'}</span>
                    <input
                      type="file"
                      accept="image/*,video/mp4"
                      onChange={(e) => handleImageUpload('mobile_image', e.target.files?.[0])}
                      disabled={isUploading}
                      style={{ display: 'none' }}
                    />
                  </label>
                </div>
              </div>

              <div className="ps-form-row">
                <div className="ps-form-group">
                  <label>Eyebrow Tag</label>
                  <input
                    type="text"
                    value={form.eyebrow}
                    onChange={(e) => setForm({ ...form, eyebrow: e.target.value })}
                    placeholder="ROYAL OUD ATELIER"
                  />
                </div>
                <div className="ps-form-group">
                  <label>Heading</label>
                  <input
                    type="text"
                    value={form.heading}
                    onChange={(e) => setForm({ ...form, heading: e.target.value })}
                    placeholder="Royal Oud & Amber Essence"
                  />
                </div>
              </div>

              <div className="ps-form-group">
                <label>Description (Optional)</label>
                <input
                  type="text"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Pure visual luxury campaign showcasing bespoke flacons."
                />
              </div>

              <div className="ps-form-row">
                <div className="ps-form-group">
                  <label>CTA Button Text</label>
                  <input
                    type="text"
                    value={form.cta_text}
                    onChange={(e) => setForm({ ...form, cta_text: e.target.value })}
                    placeholder="EXPLORE COLLECTION"
                  />
                </div>
                <div className="ps-form-group">
                  <label>CTA Target URL</label>
                  <input
                    type="text"
                    value={form.cta_link}
                    onChange={(e) => setForm({ ...form, cta_link: e.target.value })}
                    placeholder="/category/oud"
                  />
                </div>
              </div>

              <div className="ps-form-row">
                <div className="ps-form-group">
                  <label>Display Order</label>
                  <input
                    type="number"
                    value={form.display_order}
                    onChange={(e) => setForm({ ...form, display_order: parseInt(e.target.value, 10) || 1 })}
                  />
                </div>
                <div className="ps-form-group" style={{ justifyContent: 'center' }}>
                  <label className="ps-checkbox-label" style={{ marginTop: '20px' }}>
                    <input
                      type="checkbox"
                      checked={form.is_active}
                      onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                    />
                    <span>Active on Storefront</span>
                  </label>
                </div>
              </div>

              <div className="ps-modal-actions">
                <button
                  type="button"
                  className="ps-builder-btn-cancel"
                  onClick={() => setIsModalOpen(false)}
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="ps-builder-btn-save"
                  disabled={saving || isUploading}
                >
                  {saving ? 'Saving...' : 'Save Slide'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
