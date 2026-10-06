import React, { useState, useEffect } from 'react';
import { getHomepageSections, updateHomepageSection, reorderSections } from '../../services/homepage';
import { ArrowUp, ArrowDown, Eye, EyeOff, Save, CheckCircle, AlertCircle, RefreshCw, LayoutTemplate } from 'lucide-react';
import './AdminProducts.css';

export default function AdminHomepage() {
  const [sections, setSections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState({ type: '', text: '' });

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await getHomepageSections();
      setSections(data.sort((a, b) => a.display_order - b.display_order));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleToggleActive = async (id, currentActive) => {
    const updated = !currentActive;
    setSections((prev) =>
      prev.map((s) => (s.id === id ? { ...s, is_active: updated } : s))
    );
    await updateHomepageSection(id, { is_active: updated });
  };

  const handleMove = async (index, direction) => {
    if (
      (direction === -1 && index === 0) ||
      (direction === 1 && index === sections.length - 1)
    ) {
      return;
    }

    const reordered = [...sections];
    const targetIndex = index + direction;
    const temp = reordered[index];
    reordered[index] = reordered[targetIndex];
    reordered[targetIndex] = temp;

    setSections(reordered);
    const orderedIds = reordered.map((s) => s.id);
    await reorderSections(orderedIds);
  };

  const handleTitleChange = (id, newTitle) => {
    setSections((prev) =>
      prev.map((s) => (s.id === id ? { ...s, title: newTitle } : s))
    );
  };

  const handleSaveAll = async () => {
    setSaving(true);
    setStatusMessage({ type: '', text: '' });
    try {
      for (const sec of sections) {
        await updateHomepageSection(sec.id, {
          title: sec.title,
          subtitle: sec.subtitle,
          is_active: sec.is_active,
        });
      }
      setStatusMessage({ type: 'success', text: 'Homepage section structure and settings saved.' });
    } catch (err) {
      setStatusMessage({ type: 'error', text: 'Failed to save changes: ' + err.message });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="ps-admin-loading-view">
        <div className="ps-admin-spinner" />
        <p>Loading homepage structure...</p>
      </div>
    );
  }

  return (
    <div className="ps-admin-products-page">
      <div className="ps-admin-products-header">
        <div>
          <h1 className="ps-admin-page-title">Homepage Section Layout & Ordering</h1>
          <p className="ps-admin-page-subtitle">Enable, reorder, and customize the editorial blocks of the storefront</p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button type="button" onClick={loadData} className="ps-admin-btn-secondary">
            <RefreshCw size={16} />
            <span>Reset</span>
          </button>
          <button type="button" onClick={handleSaveAll} disabled={saving} className="ps-admin-btn-primary">
            {saving ? <RefreshCw size={16} className="ps-spin" /> : <Save size={16} />}
            <span>{saving ? 'Saving...' : 'Save All Layouts'}</span>
          </button>
        </div>
      </div>

      {statusMessage.text && (
        <div className={`ps-admin-alert ${statusMessage.type === 'error' ? 'ps-alert-danger' : 'ps-alert-success'}`}>
          {statusMessage.type === 'error' ? <AlertCircle size={18} /> : <CheckCircle size={18} />}
          <span>{statusMessage.text}</span>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {sections.map((section, idx) => (
          <div
            key={section.id}
            style={{
              backgroundColor: '#0D0D0D',
              border: '1px solid rgba(200,164,93,0.15)',
              padding: '1.25rem 1.5rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '1rem',
              opacity: section.is_active ? 1 : 0.5,
              transition: 'opacity 0.2s ease',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', flex: 1 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '32px',
                  height: '32px',
                  backgroundColor: '#050505',
                  border: '1px solid rgba(200,164,93,0.3)',
                  color: '#C8A45D',
                  fontFamily: 'Cinzel, serif',
                  fontSize: '0.85rem',
                  fontWeight: '700',
                }}
              >
                {idx + 1}
              </div>

              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
                  <span
                    style={{
                      fontFamily: 'Cinzel, serif',
                      fontSize: '0.75rem',
                      color: '#C8A45D',
                      letterSpacing: '0.05em',
                      textTransform: 'uppercase',
                    }}
                  >
                    {section.section_key.replace('_', ' ')}
                  </span>
                  <span
                    style={{
                      fontSize: '0.7rem',
                      padding: '1px 6px',
                      backgroundColor: section.is_active ? 'rgba(74,222,128,0.1)' : 'rgba(143,138,128,0.2)',
                      color: section.is_active ? '#4ade80' : '#8F8A80',
                    }}
                  >
                    {section.is_active ? 'ACTIVE' : 'HIDDEN'}
                  </span>
                </div>
                <input
                  type="text"
                  value={section.title || ''}
                  onChange={(e) => handleTitleChange(section.id, e.target.value)}
                  style={{
                    backgroundColor: '#050505',
                    border: '1px solid rgba(200,164,93,0.2)',
                    color: '#F8F5EE',
                    padding: '0.4rem 0.75rem',
                    fontFamily: 'Cormorant Garamond, serif',
                    fontSize: '1.1rem',
                    width: '100%',
                    maxWidth: '450px',
                  }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <button
                type="button"
                onClick={() => handleToggleActive(section.id, section.is_active)}
                className="ps-admin-btn-secondary"
                style={{ padding: '0.4rem 0.75rem' }}
                title={section.is_active ? 'Hide Section' : 'Show Section'}
              >
                {section.is_active ? <Eye size={16} /> : <EyeOff size={16} />}
                <span>{section.is_active ? 'Visible' : 'Hidden'}</span>
              </button>

              <button
                type="button"
                onClick={() => handleMove(idx, -1)}
                disabled={idx === 0}
                className="ps-admin-btn-secondary"
                style={{ padding: '0.4rem', opacity: idx === 0 ? 0.3 : 1 }}
                title="Move Up"
              >
                <ArrowUp size={16} />
              </button>

              <button
                type="button"
                onClick={() => handleMove(idx, 1)}
                disabled={idx === sections.length - 1}
                className="ps-admin-btn-secondary"
                style={{ padding: '0.4rem', opacity: idx === sections.length - 1 ? 0.3 : 1 }}
                title="Move Down"
              >
                <ArrowDown size={16} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
