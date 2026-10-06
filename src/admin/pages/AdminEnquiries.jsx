import React, { useState, useEffect } from 'react';
import { getEnquiries, updateEnquiryStatus } from '../../services/enquiries';
import { Mail, Phone, Calendar, CheckCircle, Clock, Trash2, RefreshCw } from 'lucide-react';
import './AdminProducts.css';

export default function AdminEnquiries() {
  const [enquiries, setEnquiries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('all');

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await getEnquiries();
      setEnquiries(data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleStatusChange = async (id, newStatus) => {
    await updateEnquiryStatus(id, newStatus);
    setEnquiries((prev) => prev.map((e) => (e.id === id ? { ...e, status: newStatus } : e)));
  };

  const filtered = enquiries.filter((e) => {
    if (activeTab === 'unread') return e.status === 'unread';
    if (activeTab === 'read') return e.status === 'read';
    return true;
  });

  return (
    <div className="ps-admin-products-page">
      <div className="ps-admin-products-header">
        <div>
          <h1 className="ps-admin-page-title">Client Enquiries & Bespoke Requests</h1>
          <p className="ps-admin-page-subtitle">Submissions received via the PS PERFUMES Atelier contact concierge</p>
        </div>
        <button type="button" onClick={loadData} className="ps-admin-btn-secondary">
          <RefreshCw size={16} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '1rem', borderBottom: '1px solid rgba(200,164,93,0.15)', paddingBottom: '0.75rem', marginBottom: '1.5rem' }}>
        <button
          type="button"
          onClick={() => setActiveTab('all')}
          style={{
            background: 'none',
            border: 'none',
            color: activeTab === 'all' ? '#C8A45D' : '#8F8A80',
            fontWeight: activeTab === 'all' ? '600' : '400',
            cursor: 'pointer',
            padding: '0.25rem 0.75rem',
            borderBottom: activeTab === 'all' ? '2px solid #C8A45D' : 'none',
          }}
        >
          All Enquiries ({enquiries.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('unread')}
          style={{
            background: 'none',
            border: 'none',
            color: activeTab === 'unread' ? '#C8A45D' : '#8F8A80',
            fontWeight: activeTab === 'unread' ? '600' : '400',
            cursor: 'pointer',
            padding: '0.25rem 0.75rem',
            borderBottom: activeTab === 'unread' ? '2px solid #C8A45D' : 'none',
          }}
        >
          Unread ({enquiries.filter((e) => e.status === 'unread').length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('read')}
          style={{
            background: 'none',
            border: 'none',
            color: activeTab === 'read' ? '#C8A45D' : '#8F8A80',
            fontWeight: activeTab === 'read' ? '600' : '400',
            cursor: 'pointer',
            padding: '0.25rem 0.75rem',
            borderBottom: activeTab === 'read' ? '2px solid #C8A45D' : 'none',
          }}
        >
          Resolved / Read ({enquiries.filter((e) => e.status === 'read').length})
        </button>
      </div>

      {loading ? (
        <div className="ps-admin-loading-view">
          <div className="ps-admin-spinner" />
          <p>Loading enquiries...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="ps-admin-empty-state">
          <p>No enquiries found in this category.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '1.25rem' }}>
          {filtered.map((item) => (
            <div
              key={item.id}
              style={{
                backgroundColor: '#0D0D0D',
                border: item.status === 'unread' ? '1px solid #C8A45D' : '1px solid rgba(200,164,93,0.15)',
                padding: '1.5rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '1rem',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <h3 style={{ fontFamily: 'Cinzel, serif', color: '#F8F5EE', fontSize: '1.1rem', margin: 0 }}>
                      {item.name}
                    </h3>
                    <span
                      style={{
                        fontSize: '0.75rem',
                        padding: '2px 8px',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        backgroundColor: item.status === 'unread' ? 'rgba(227,27,35,0.15)' : 'rgba(200,164,93,0.1)',
                        color: item.status === 'unread' ? '#E31B23' : '#C8A45D',
                        border: `1px solid ${item.status === 'unread' ? 'rgba(227,27,35,0.3)' : 'rgba(200,164,93,0.2)'}`,
                      }}
                    >
                      {item.status}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: '1.5rem', marginTop: '0.5rem', fontSize: '0.85rem', color: '#8F8A80', flexWrap: 'wrap' }}>
                    <a href={`mailto:${item.email}`} style={{ color: '#C8A45D', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Mail size={14} /> {item.email}
                    </a>
                    {item.phone && (
                      <a href={`tel:${item.phone}`} style={{ color: '#8F8A80', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Phone size={14} /> {item.phone}
                      </a>
                    )}
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Calendar size={14} /> {new Date(item.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  {item.status === 'unread' ? (
                    <button
                      type="button"
                      onClick={() => handleStatusChange(item.id, 'read')}
                      className="ps-admin-btn-secondary"
                      style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                    >
                      <CheckCircle size={14} /> Mark as Read
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleStatusChange(item.id, 'unread')}
                      className="ps-admin-btn-secondary"
                      style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                    >
                      <Clock size={14} /> Mark as Unread
                    </button>
                  )}
                </div>
              </div>

              {item.subject && (
                <div style={{ fontSize: '0.95rem', fontWeight: '600', color: '#F3E7C7' }}>
                  Subject: {item.subject}
                </div>
              )}

              <p style={{ margin: 0, color: '#D4CBBF', lineHeight: '1.6', fontSize: '0.9rem', backgroundColor: '#050505', padding: '1rem', borderLeft: '2px solid #C8A45D' }}>
                {item.message}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
