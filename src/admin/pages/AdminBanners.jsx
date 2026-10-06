import React, { useState, useEffect } from 'react';
import { getHomepageSections, updateHomepageSection } from '../../services/homepage';
import { uploadImage } from '../../lib/storage';
import { Image as ImageIcon, Upload, Save, CheckCircle, AlertCircle, RefreshCw } from 'lucide-react';
import './AdminProductForm.css';

export default function AdminBanners() {
  const [sections, setSections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [uploadingField, setUploadingField] = useState(null);
  const [statusMessage, setStatusMessage] = useState({ type: '', text: '' });

  useEffect(() => {
    async function fetchBanners() {
      setLoading(true);
      try {
        const data = await getHomepageSections();
        setSections(data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    fetchBanners();
  }, []);

  const handleFieldChange = (sectionId, field, value) => {
    setSections((prev) =>
      prev.map((sec) => (sec.id === sectionId ? { ...sec, [field]: value } : sec))
    );
  };

  const handleImageUpload = async (sectionId, field, file) => {
    if (!file) return;
    setUploadingField(`${sectionId}-${field}`);
    setStatusMessage({ type: '', text: '' });

    try {
      const res = await uploadImage(file, 'banners');
      if (res.error) throw new Error(res.error);
      handleFieldChange(sectionId, field, res.url);
      setStatusMessage({ type: 'success', text: 'Banner image uploaded to Supabase Storage.' });
    } catch (err) {
      setStatusMessage({ type: 'error', text: err.message || 'Upload failed.' });
    } finally {
      setUploadingField(null);
    }
  };

  const handleSaveSection = async (section) => {
    setSavingId(section.id);
    setStatusMessage({ type: '', text: '' });

    try {
      await updateHomepageSection(section.id, section);
      setStatusMessage({ type: 'success', text: `Section "${section.title}" updated successfully.` });
    } catch (err) {
      setStatusMessage({ type: 'error', text: 'Failed to update section. ' + err.message });
    } finally {
      setSavingId(null);
    }
  };

  if (loading) {
    return (
      <div className="ps-admin-loading-view">
        <div className="ps-admin-spinner" />
        <p>Loading banners...</p>
      </div>
    );
  }

  const heroSection = sections.find((s) => s.section_key === 'hero') || sections[0];
  const editorialSection = sections.find((s) => s.section_key === 'editorial_feature');

  return (
    <div className="ps-admin-form-page">
      <div className="ps-admin-form-header">
        <div>
          <h1 className="ps-admin-page-title">Hero & Promotional Banners</h1>
          <p className="ps-admin-page-subtitle">Manage high-impact visual banners, imagery, headlines, and call-to-actions</p>
        </div>
      </div>

      {statusMessage.text && (
        <div className={`ps-admin-alert ${statusMessage.type === 'error' ? 'ps-alert-danger' : 'ps-alert-success'}`}>
          {statusMessage.type === 'error' ? <AlertCircle size={18} /> : <CheckCircle size={18} />}
          <span>{statusMessage.text}</span>
        </div>
      )}

      {heroSection && (
        <div className="ps-admin-form-card" style={{ marginBottom: '2rem' }}>
          <div className="ps-admin-card-header">
            <ImageIcon size={20} className="ps-admin-gold-icon" />
            <h2 className="ps-admin-card-title">Main Hero Banner (Cinematic Presentation)</h2>
          </div>

          <div className="ps-admin-row-2">
            <div>
              <div className="ps-admin-input-group">
                <label>Headline</label>
                <input
                  type="text"
                  value={heroSection.title || ''}
                  onChange={(e) => handleFieldChange(heroSection.id, 'title', e.target.value)}
                />
              </div>

              <div className="ps-admin-input-group">
                <label>Subtitle / Sub-headline</label>
                <textarea
                  rows={2}
                  value={heroSection.subtitle || ''}
                  onChange={(e) => handleFieldChange(heroSection.id, 'subtitle', e.target.value)}
                />
              </div>

              <div className="ps-admin-row-2">
                <div className="ps-admin-input-group">
                  <label>Primary CTA Label</label>
                  <input
                    type="text"
                    value={heroSection.cta_text || ''}
                    onChange={(e) => handleFieldChange(heroSection.id, 'cta_text', e.target.value)}
                  />
                </div>
                <div className="ps-admin-input-group">
                  <label>Primary CTA Destination</label>
                  <input
                    type="text"
                    value={heroSection.cta_link || ''}
                    onChange={(e) => handleFieldChange(heroSection.id, 'cta_link', e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem', color: '#8F8A80' }}>
                Primary Hero Image Preview
              </label>
              <div
                style={{
                  width: '100%',
                  height: '180px',
                  backgroundColor: '#050505',
                  border: '1px solid rgba(200,164,93,0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden',
                  position: 'relative',
                  marginBottom: '1rem',
                }}
              >
                {heroSection.image_url ? (
                  <img
                    src={heroSection.image_url}
                    alt="Hero Preview"
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                ) : (
                  <span style={{ color: '#8F8A80' }}>No image set</span>
                )}
              </div>

              <label className="ps-admin-btn-secondary" style={{ width: '100%', justifyContent: 'center' }}>
                <Upload size={16} />
                <span>
                  {uploadingField === `${heroSection.id}-image_url`
                    ? 'Uploading to Supabase...'
                    : 'Replace Primary Hero Image'}
                </span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) =>
                    handleImageUpload(heroSection.id, 'image_url', e.target.files?.[0])
                  }
                  style={{ display: 'none' }}
                />
              </label>
            </div>
          </div>

          <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={() => handleSaveSection(heroSection)}
              disabled={savingId === heroSection.id}
              className="ps-admin-btn-primary"
            >
              {savingId === heroSection.id ? <RefreshCw size={16} className="ps-spin" /> : <Save size={16} />}
              <span>{savingId === heroSection.id ? 'Saving...' : 'Save Hero Banner'}</span>
            </button>
          </div>
        </div>
      )}

      {editorialSection && (
        <div className="ps-admin-form-card">
          <div className="ps-admin-card-header">
            <ImageIcon size={20} className="ps-admin-gold-icon" />
            <h2 className="ps-admin-card-title">Editorial Spotlight Banner</h2>
          </div>

          <div className="ps-admin-row-2">
            <div>
              <div className="ps-admin-input-group">
                <label>Title</label>
                <input
                  type="text"
                  value={editorialSection.title || ''}
                  onChange={(e) => handleFieldChange(editorialSection.id, 'title', e.target.value)}
                />
              </div>

              <div className="ps-admin-input-group">
                <label>Editorial Description</label>
                <textarea
                  rows={3}
                  value={editorialSection.subtitle || ''}
                  onChange={(e) => handleFieldChange(editorialSection.id, 'subtitle', e.target.value)}
                />
              </div>

              <div className="ps-admin-row-2">
                <div className="ps-admin-input-group">
                  <label>CTA Button Text</label>
                  <input
                    type="text"
                    value={editorialSection.cta_text || ''}
                    onChange={(e) => handleFieldChange(editorialSection.id, 'cta_text', e.target.value)}
                  />
                </div>
                <div className="ps-admin-input-group">
                  <label>CTA Target URL</label>
                  <input
                    type="text"
                    value={editorialSection.cta_link || ''}
                    onChange={(e) => handleFieldChange(editorialSection.id, 'cta_link', e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem', color: '#8F8A80' }}>
                Editorial Image Preview
              </label>
              <div
                style={{
                  width: '100%',
                  height: '180px',
                  backgroundColor: '#050505',
                  border: '1px solid rgba(200,164,93,0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden',
                  position: 'relative',
                  marginBottom: '1rem',
                }}
              >
                {editorialSection.image_url ? (
                  <img
                    src={editorialSection.image_url}
                    alt="Editorial Preview"
                    style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                  />
                ) : (
                  <span style={{ color: '#8F8A80' }}>No image set</span>
                )}
              </div>

              <label className="ps-admin-btn-secondary" style={{ width: '100%', justifyContent: 'center' }}>
                <Upload size={16} />
                <span>
                  {uploadingField === `${editorialSection.id}-image_url`
                    ? 'Uploading...'
                    : 'Replace Spotlight Image'}
                </span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) =>
                    handleImageUpload(editorialSection.id, 'image_url', e.target.files?.[0])
                  }
                  style={{ display: 'none' }}
                />
              </label>
            </div>
          </div>

          <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={() => handleSaveSection(editorialSection)}
              disabled={savingId === editorialSection.id}
              className="ps-admin-btn-primary"
            >
              {savingId === editorialSection.id ? <RefreshCw size={16} className="ps-spin" /> : <Save size={16} />}
              <span>{savingId === editorialSection.id ? 'Saving...' : 'Save Editorial Banner'}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
