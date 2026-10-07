import React, { useState, useEffect } from 'react';
import {
  Plus,
  Trash2,
  Edit,
  Eye,
  EyeOff,
  Upload,
  X,
  Image as ImageIcon,
  Check,
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
      console.error('Failed to load hero slides');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSlides();
  }, []);

  const handleOpenAdd = () => {
    setEditingId(null);
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
    setForm({
      desktop_image: slide.desktop_image || '',
      mobile_image: slide.mobile_image || '',
      eyebrow: slide.eyebrow || '',
      heading: slide.heading || '',
      description: slide.description || '',
      cta_text: slide.cta_text || '',
      cta_link: slide.cta_link || '',
      display_order: slide.display_order || 1,
      is_active: slide.is_active !== false,
    });
    setIsModalOpen(true);
  };

  const handleImageUpload = async (field, file) => {
    if (!file) return;
    try {
      const { url } = await uploadImage(file, 'hero', `slide-${Date.now()}`);
      if (url) {
        setForm((prev) => ({ ...prev, [field]: url }));
      }
    } catch {
      setErrorMsg('Failed to upload image to Supabase Storage');
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
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
      }, 900);
    } catch {
      setErrorMsg('Failed to save slide.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Delete this hero showcase slide?')) {
      await deleteHeroSlide(id);
      await loadSlides();
    }
  };

  const handleToggleActive = async (slide) => {
    await updateHeroSlide(slide.id, { is_active: !slide.is_active });
    await loadSlides();
  };

  if (loading) {
    return <div className="ps-admin-loading">Retrieving hero slides...</div>;
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
                <th>Desktop Image</th>
                <th>Mobile Image</th>
                <th>Heading</th>
                <th>CTA Link</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {slides.map((s) => (
                <tr key={s.id}>
                  <td>
                    <strong style={{ color: '#c8a45d' }}>#{s.display_order}</strong>
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <img
                        src={s.desktop_image}
                        alt={s.heading}
                        style={{
                          width: '80px',
                          height: '42px',
                          objectFit: 'cover',
                          borderRadius: '4px',
                          border: '1px solid rgba(255, 255, 255, 0.1)',
                        }}
                      />
                    </div>
                  </td>
                  <td>
                    <img
                      src={s.mobile_image || s.desktop_image}
                      alt={s.heading}
                      style={{
                        width: '32px',
                        height: '42px',
                        objectFit: 'cover',
                        borderRadius: '4px',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                      }}
                    />
                  </td>
                  <td>
                    <div>
                      <strong>{s.heading || 'Hero Showcase'}</strong>
                      {s.eyebrow && (
                        <span style={{ display: 'block', fontSize: '11px', color: '#8c847a' }}>
                          {s.eyebrow}
                        </span>
                      )}
                    </div>
                  </td>
                  <td>
                    <span className="ps-cell-muted">{s.cta_link || '/'}</span>
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
        <div className="ps-admin-modal-overlay" onClick={() => setIsModalOpen(false)}>
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
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSave}>
              <div className="ps-form-row">
                <div className="ps-form-group">
                  <label>Desktop Image *</label>
                  <input
                    type="text"
                    value={form.desktop_image}
                    onChange={(e) => setForm({ ...form, desktop_image: e.target.value })}
                    placeholder="/assets/hero-luxury-cinematic.png"
                    required
                  />
                  <label className="ps-combo-upload-btn" style={{ marginTop: '6px' }}>
                    <Upload size={14} color="#c8a45d" />
                    <span>Upload Desktop Image</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleImageUpload('desktop_image', e.target.files?.[0])}
                      style={{ display: 'none' }}
                    />
                  </label>
                </div>

                <div className="ps-form-group">
                  <label>Mobile Image (Optional)</label>
                  <input
                    type="text"
                    value={form.mobile_image}
                    onChange={(e) => setForm({ ...form, mobile_image: e.target.value })}
                    placeholder="/assets/hero-luxury-cinematic-mobile.png"
                  />
                  <label className="ps-combo-upload-btn" style={{ marginTop: '6px' }}>
                    <Upload size={14} color="#c8a45d" />
                    <span>Upload Mobile Image</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleImageUpload('mobile_image', e.target.files?.[0])}
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
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="ps-builder-btn-save"
                  disabled={saving}
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
