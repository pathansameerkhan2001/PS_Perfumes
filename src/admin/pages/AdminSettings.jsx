import React, { useState, useEffect } from 'react';
import { getSiteSettings, updateSiteSettings } from '../../services/settings';
import { uploadImage } from '../../lib/storage';
import { Save, CheckCircle, AlertCircle, Building, MapPin, Share2, Truck, RefreshCw, Upload } from 'lucide-react';
import './AdminProductForm.css';

export default function AdminSettings() {
  const [settings, setSettings] = useState({
    brand_name: 'PS PERFUMES',
    tagline: 'Haute Parfumerie & Luxury Fragrances',
    logo_url: '/assets/ps-perfumes-logo.webp',
    contact_email: 'brandnix.in@gmail.com',
    phone: '+91 94949 51600',
    address: 'Kadapa, Andhra Pradesh, India – 516001',
    city: 'Kadapa',
    state: 'Andhra Pradesh',
    pincode: '516001',
    instagram_url: 'https://www.instagram.com/ps_perfumes_kadapa/?hl=en',
    google_maps_url: 'https://share.google/b0yildKJKTaGc365J',
    whatsapp_url: 'https://wa.me/919494951600',
    free_shipping_threshold: 999,
    standard_shipping_fee: 99,
    currency: 'INR',
    currency_symbol: '₹',
    store_status: 'open',
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [statusMessage, setStatusMessage] = useState({ type: '', text: '' });

  useEffect(() => {
    async function load() {
      try {
        const data = await getSiteSettings();
        if (data) {
          setSettings((prev) => ({ ...prev, ...data }));
        }
      } catch (err) {
        console.error('Failed to load settings:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setSettings((prev) => ({ ...prev, [name]: value }));
  };

  const handleLogoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingLogo(true);
    setStatusMessage({ type: '', text: '' });

    try {
      const res = await uploadImage(file, 'logo');
      if (res.error) throw new Error(res.error);
      setSettings((prev) => ({ ...prev, logo_url: res.url }));
      setStatusMessage({ type: 'success', text: 'Logo uploaded successfully.' });
    } catch (err) {
      setStatusMessage({ type: 'error', text: err.message || 'Logo upload failed.' });
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setStatusMessage({ type: '', text: '' });

    try {
      await updateSiteSettings(settings);
      setStatusMessage({ type: 'success', text: 'Store settings saved successfully to Supabase.' });
    } catch (err) {
      setStatusMessage({ type: 'error', text: 'Failed to update settings. ' + err.message });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="ps-admin-loading-view">
        <div className="ps-admin-spinner" />
        <p>Loading Atelier Settings...</p>
      </div>
    );
  }

  return (
    <div className="ps-admin-form-page">
      <div className="ps-admin-form-header">
        <div>
          <h1 className="ps-admin-page-title">Store & Brand Settings</h1>
          <p className="ps-admin-page-subtitle">Configure PS PERFUMES Atelier identity, location, and commerce rules</p>
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="ps-admin-btn-primary"
        >
          {saving ? <RefreshCw size={18} className="ps-spin" /> : <Save size={18} />}
          <span>{saving ? 'Saving...' : 'Save Settings'}</span>
        </button>
      </div>

      {statusMessage.text && (
        <div className={`ps-admin-alert ${statusMessage.type === 'error' ? 'ps-alert-danger' : 'ps-alert-success'}`}>
          {statusMessage.type === 'error' ? <AlertCircle size={18} /> : <CheckCircle size={18} />}
          <span>{statusMessage.text}</span>
        </div>
      )}

      <form onSubmit={handleSave} className="ps-admin-form-grid">
        {/* Brand Identity */}
        <div className="ps-admin-form-card">
          <div className="ps-admin-card-header">
            <Building size={20} className="ps-admin-gold-icon" />
            <h2 className="ps-admin-card-title">Brand Identity</h2>
          </div>

          <div className="ps-admin-input-group">
            <label htmlFor="brand_name">Brand Name</label>
            <input
              id="brand_name"
              name="brand_name"
              type="text"
              value={settings.brand_name}
              onChange={handleChange}
              required
            />
          </div>

          <div className="ps-admin-input-group">
            <label htmlFor="tagline">Editorial Tagline</label>
            <input
              id="tagline"
              name="tagline"
              type="text"
              value={settings.tagline}
              onChange={handleChange}
            />
          </div>

          <div className="ps-admin-input-group">
            <label>Brand Monogram / Logo</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', marginTop: '0.5rem' }}>
              <img
                src={settings.logo_url}
                alt="Brand Logo"
                style={{
                  height: '56px',
                  backgroundColor: '#050505',
                  padding: '8px 16px',
                  border: '1px solid rgba(200,164,93,0.3)',
                  objectFit: 'contain',
                }}
              />
              <label className="ps-admin-btn-secondary" style={{ cursor: 'pointer' }}>
                <Upload size={16} />
                <span>{uploadingLogo ? 'Uploading...' : 'Upload New Logo'}</span>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  onChange={handleLogoUpload}
                  style={{ display: 'none' }}
                  disabled={uploadingLogo}
                />
              </label>
            </div>
            <span className="ps-admin-input-hint">Bucket: ps-perfumes/logo/ (PNG, WebP or SVG recommended)</span>
          </div>

          <div className="ps-admin-input-group">
            <label htmlFor="store_status">Store Status</label>
            <select
              id="store_status"
              name="store_status"
              value={settings.store_status}
              onChange={handleChange}
            >
              <option value="open">Open (Accepting Orders)</option>
              <option value="maintenance">Private Atelier Maintenance Mode</option>
            </select>
          </div>
        </div>

        {/* Location & Contact */}
        <div className="ps-admin-form-card">
          <div className="ps-admin-card-header">
            <MapPin size={20} className="ps-admin-gold-icon" />
            <h2 className="ps-admin-card-title">Atelier Location & Contact</h2>
          </div>

          <div className="ps-admin-input-group">
            <label htmlFor="address">Official Address</label>
            <input
              id="address"
              name="address"
              type="text"
              value={settings.address}
              onChange={handleChange}
              required
            />
          </div>

          <div className="ps-admin-row-2">
            <div className="ps-admin-input-group">
              <label htmlFor="city">City</label>
              <input
                id="city"
                name="city"
                type="text"
                value={settings.city}
                onChange={handleChange}
                required
              />
            </div>
            <div className="ps-admin-input-group">
              <label htmlFor="pincode">Pincode</label>
              <input
                id="pincode"
                name="pincode"
                type="text"
                value={settings.pincode}
                onChange={handleChange}
                required
              />
            </div>
          </div>

          <div className="ps-admin-row-2">
            <div className="ps-admin-input-group">
              <label htmlFor="contact_email">Admin / Contact Email</label>
              <input
                id="contact_email"
                name="contact_email"
                type="email"
                value={settings.contact_email}
                onChange={handleChange}
                required
              />
            </div>
            <div className="ps-admin-input-group">
              <label htmlFor="phone">Phone / Concierge</label>
              <input
                id="phone"
                name="phone"
                type="text"
                value={settings.phone}
                onChange={handleChange}
                required
              />
            </div>
          </div>

          <div className="ps-admin-input-group">
            <label htmlFor="google_maps_url">Google Maps Business URL</label>
            <input
              id="google_maps_url"
              name="google_maps_url"
              type="url"
              value={settings.google_maps_url}
              onChange={handleChange}
            />
            <span className="ps-admin-input-hint">Official Google Maps listing for Kadapa store</span>
          </div>
        </div>

        {/* Social & Messaging */}
        <div className="ps-admin-form-card">
          <div className="ps-admin-card-header">
            <Share2 size={20} className="ps-admin-gold-icon" />
            <h2 className="ps-admin-card-title">Social Links & Concierge</h2>
          </div>

          <div className="ps-admin-input-group">
            <label htmlFor="instagram_url">Official Instagram URL</label>
            <input
              id="instagram_url"
              name="instagram_url"
              type="url"
              value={settings.instagram_url}
              onChange={handleChange}
              required
            />
            <span className="ps-admin-input-hint">Default: @ps_perfumes_kadapa</span>
          </div>

          <div className="ps-admin-input-group">
            <label htmlFor="whatsapp_url">WhatsApp Concierge Link</label>
            <input
              id="whatsapp_url"
              name="whatsapp_url"
              type="text"
              placeholder="https://wa.me/919494951600 or leave empty"
              value={settings.whatsapp_url}
              onChange={handleChange}
            />
            <span className="ps-admin-input-hint">Only enabled if official WhatsApp number is active</span>
          </div>
        </div>

        {/* Shipping & Commerce Rules */}
        <div className="ps-admin-form-card">
          <div className="ps-admin-card-header">
            <Truck size={20} className="ps-admin-gold-icon" />
            <h2 className="ps-admin-card-title">Pan-India Shipping & Rates</h2>
          </div>

          <div className="ps-admin-row-2">
            <div className="ps-admin-input-group">
              <label htmlFor="free_shipping_threshold">Free Shipping Order Minimum (₹)</label>
              <input
                id="free_shipping_threshold"
                name="free_shipping_threshold"
                type="number"
                min="0"
                value={settings.free_shipping_threshold}
                onChange={handleChange}
                required
              />
            </div>

            <div className="ps-admin-input-group">
              <label htmlFor="standard_shipping_fee">Standard Delivery Fee (₹)</label>
              <input
                id="standard_shipping_fee"
                name="standard_shipping_fee"
                type="number"
                min="0"
                value={settings.standard_shipping_fee}
                onChange={handleChange}
                required
              />
            </div>
          </div>

          <div className="ps-admin-row-2">
            <div className="ps-admin-input-group">
              <label htmlFor="currency">Currency Code</label>
              <input
                id="currency"
                name="currency"
                type="text"
                value={settings.currency}
                onChange={handleChange}
                required
              />
            </div>

            <div className="ps-admin-input-group">
              <label htmlFor="currency_symbol">Currency Symbol</label>
              <input
                id="currency_symbol"
                name="currency_symbol"
                type="text"
                value={settings.currency_symbol}
                onChange={handleChange}
                required
              />
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
