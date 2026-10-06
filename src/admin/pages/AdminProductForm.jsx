import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Upload,
  X,
  Plus,
} from 'lucide-react';
import { getProductById, createProduct, updateProduct } from '../../services/products';
import { uploadImage } from '../../lib/storage';
import './AdminProductForm.css';

const CATEGORIES = ['Attar', 'Perfume', 'Bakhoor', 'Musky', 'Oud', 'Floral', 'Woody', 'Combo Pack'];
const GENDERS = ['Unisex', 'Men', 'Women'];
const STATUSES = ['active', 'draft', 'out_of_stock', 'archived'];

export default function AdminProductForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEditing = Boolean(id);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [uploadProgress, setUploadProgress] = useState('');

  const [form, setForm] = useState({
    name: '',
    slug: '',
    category: 'Perfume',
    subcategory: '',
    sku: '',
    description: '',
    short_description: '',
    price: '',
    compare_at_price: '',
    stock: 15,
    status: 'active',
    featured: false,
    bestseller: false,
    new_arrival: false,
    gender: 'Unisex',
    occasion: 'Evening & Royal Celebrations',
    sizes: ['50ml', '100ml'],
    top_notes: '',
    heart_notes: '',
    base_notes: '',
    ingredients: 'Alcohol Denat., Parfum (Fragrance), Aqua (Water), Limonene, Linalool, Citronellol.',
    main_image: '',
    gallery_images: [],
  });

  useEffect(() => {
    if (isEditing) {
      setLoading(true);
      getProductById(id).then((p) => {
        if (p) {
          setForm({
            name: p.name || '',
            slug: p.slug || '',
            category: p.category || 'Perfume',
            subcategory: p.subcategory || '',
            sku: p.sku || '',
            description: p.description || '',
            short_description: p.short_description || '',
            price: p.price || '',
            compare_at_price: p.compare_at_price || '',
            stock: p.stock !== undefined ? p.stock : 10,
            status: p.status || 'active',
            featured: Boolean(p.featured),
            bestseller: Boolean(p.bestseller),
            new_arrival: Boolean(p.new_arrival),
            gender: p.gender || 'Unisex',
            occasion: p.occasion || '',
            sizes: p.sizes || ['50ml', '100ml'],
            top_notes: Array.isArray(p.top_notes) ? p.top_notes.join(', ') : (p.top_notes || ''),
            heart_notes: Array.isArray(p.heart_notes) ? p.heart_notes.join(', ') : (p.heart_notes || ''),
            base_notes: Array.isArray(p.base_notes) ? p.base_notes.join(', ') : (p.base_notes || ''),
            ingredients: p.ingredients || '',
            main_image: p.main_image || p.image || '',
            gallery_images: p.gallery_images || [],
          });
        }
        setLoading(false);
      });
    }
  }, [id, isEditing]);

  const handleNameChange = (e) => {
    const val = e.target.value;
    const autoSlug = val.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    setForm((prev) => ({
      ...prev,
      name: val,
      slug: isEditing ? prev.slug : autoSlug,
      sku: isEditing ? prev.sku : `PS-${autoSlug.slice(0, 10).toUpperCase()}`,
    }));
  };

  const handleMainImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadProgress('Uploading primary flacon image to storage...');
    try {
      const { url, error } = await uploadImage(file, 'products', form.slug || 'general');
      if (error) {
        setErrorMsg('Failed to upload image to storage.');
      } else {
        setForm((prev) => ({ ...prev, main_image: url }));
        setUploadProgress('Image uploaded successfully.');
        setTimeout(() => setUploadProgress(''), 2500);
      }
    } catch {
      setErrorMsg('Image upload failed.');
    }
  };

  const handleGalleryUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setUploadProgress(`Uploading ${files.length} gallery angles...`);
    try {
      const newUrls = [];
      for (const f of files) {
        const { url } = await uploadImage(f, 'products', form.slug || 'general');
        if (url) newUrls.push(url);
      }
      setForm((prev) => ({
        ...prev,
        gallery_images: [...prev.gallery_images, ...newUrls],
      }));
      setUploadProgress('Gallery images uploaded.');
      setTimeout(() => setUploadProgress(''), 2500);
    } catch {
      setErrorMsg('Gallery upload failed.');
    }
  };

  const removeGalleryImage = (idx) => {
    setForm((prev) => ({
      ...prev,
      gallery_images: prev.gallery_images.filter((_, i) => i !== idx),
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name || !form.price) {
      setErrorMsg('Please specify product name and price.');
      return;
    }

    setSaving(true);
    setErrorMsg('');

    const payload = {
      ...form,
      price: Number(form.price),
      compare_at_price: form.compare_at_price ? Number(form.compare_at_price) : null,
      stock: Number(form.stock) || 0,
      top_notes: form.top_notes.split(',').map((s) => s.trim()).filter(Boolean),
      heart_notes: form.heart_notes.split(',').map((s) => s.trim()).filter(Boolean),
      base_notes: form.base_notes.split(',').map((s) => s.trim()).filter(Boolean),
      main_image: form.main_image || '/assets/prod-royal-amber.webp',
    };

    try {
      if (isEditing) {
        await updateProduct(id, payload);
      } else {
        await createProduct(payload);
      }
      navigate('/admin/products');
    } catch {
      setErrorMsg('Failed to save product in database.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="ps-admin-loading">Retrieving formulation details...</div>;
  }

  return (
    <div className="ps-admin-form-page">
      <div className="ps-admin-page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <button
            type="button"
            className="ps-admin-back-btn"
            onClick={() => navigate('/admin/products')}
          >
            <ArrowLeft size={16} />
          </button>
          <div>
            <span className="ps-admin-eyebrow">FORMULATION REGISTRY</span>
            <h1 className="ps-admin-page-title">
              {isEditing ? `Edit Formulation: ${form.name}` : 'Create New Fragrance'}
            </h1>
          </div>
        </div>
      </div>

      {errorMsg && <div className="ps-form-error-banner">{errorMsg}</div>}
      {uploadProgress && <div className="ps-form-progress-banner">{uploadProgress}</div>}

      <form onSubmit={handleSubmit} className="ps-admin-prod-form">
        <div className="ps-form-two-col">
          {/* Main Column */}
          <div className="ps-form-main-col">
            {/* General Info Card */}
            <div className="ps-admin-form-card">
              <h2 className="ps-card-title">1. Essential Identity</h2>

              <div className="ps-form-group">
                <label htmlFor="pname">Product Name *</label>
                <input
                  id="pname"
                  type="text"
                  placeholder="e.g. Royal Amber Extrait"
                  value={form.name}
                  onChange={handleNameChange}
                  required
                />
              </div>

              <div className="ps-form-row">
                <div className="ps-form-group">
                  <label htmlFor="pslug">URL Slug *</label>
                  <input
                    id="pslug"
                    type="text"
                    value={form.slug}
                    onChange={(e) => setForm({ ...form, slug: e.target.value })}
                    required
                  />
                </div>

                <div className="ps-form-group">
                  <label htmlFor="psku">SKU Identifier</label>
                  <input
                    id="psku"
                    type="text"
                    value={form.sku}
                    onChange={(e) => setForm({ ...form, sku: e.target.value })}
                  />
                </div>
              </div>

              <div className="ps-form-group">
                <label htmlFor="pshortdesc">Short Editorial Hook (1-2 sentences)</label>
                <input
                  id="pshortdesc"
                  type="text"
                  placeholder="Majestic tribute to oriental courts with Bulgarian rose & agarwood."
                  value={form.short_description}
                  onChange={(e) => setForm({ ...form, short_description: e.target.value })}
                />
              </div>

              <div className="ps-form-group">
                <label htmlFor="pdesc">Comprehensive Olfactory Description</label>
                <textarea
                  id="pdesc"
                  rows="5"
                  placeholder="Elaborate on the distillation, background, and character..."
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </div>
            </div>

            {/* Olfactory Pyramid Notes */}
            <div className="ps-admin-form-card">
              <h2 className="ps-card-title">2. Olfactory Pyramid (Notes)</h2>

              <div className="ps-form-group">
                <label htmlFor="ptop">Top Notes (comma-separated)</label>
                <input
                  id="ptop"
                  type="text"
                  placeholder="Bergamot di Calabria, Royal Saffron, Wild Cardamom"
                  value={form.top_notes}
                  onChange={(e) => setForm({ ...form, top_notes: e.target.value })}
                />
              </div>

              <div className="ps-form-group">
                <label htmlFor="pheart">Heart Notes (comma-separated)</label>
                <input
                  id="pheart"
                  type="text"
                  placeholder="Bulgarian Rose Damascena, Crystallized Ambergris"
                  value={form.heart_notes}
                  onChange={(e) => setForm({ ...form, heart_notes: e.target.value })}
                />
              </div>

              <div className="ps-form-group">
                <label htmlFor="pbase">Base Notes (comma-separated)</label>
                <input
                  id="pbase"
                  type="text"
                  placeholder="Smoked Cambodian Agarwood (Oud), Bourbon Vanilla"
                  value={form.base_notes}
                  onChange={(e) => setForm({ ...form, base_notes: e.target.value })}
                />
              </div>

              <div className="ps-form-group">
                <label htmlFor="ping">Ingredients</label>
                <textarea
                  id="ping"
                  rows="2"
                  value={form.ingredients}
                  onChange={(e) => setForm({ ...form, ingredients: e.target.value })}
                />
              </div>
            </div>

            {/* Images Uploader to Supabase Storage bucket ps-perfumes */}
            <div className="ps-admin-form-card">
              <h2 className="ps-card-title">3. Visual Presentation (ps-perfumes bucket)</h2>

              {/* Main Image */}
              <div className="ps-form-group">
                <label>Primary Flacon Image *</label>
                <div className="ps-upload-dropzone">
                  {form.main_image ? (
                    <div className="ps-image-preview-box">
                      <img src={form.main_image} alt="Main Flacon" className="ps-img-preview" />
                      <button
                        type="button"
                        className="ps-remove-img-btn"
                        onClick={() => setForm({ ...form, main_image: '' })}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <label className="ps-dropzone-label">
                      <Upload size={24} color="#c8a45d" />
                      <span>Click or Drag & Drop Main Flacon Image</span>
                      <small>Uploads directly to ps-perfumes/products/...</small>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleMainImageUpload}
                        style={{ display: 'none' }}
                      />
                    </label>
                  )}
                </div>
              </div>

              {/* Gallery Images */}
              <div className="ps-form-group">
                <label>Gallery Angles & Boxes</label>
                <div className="ps-gallery-grid">
                  {form.gallery_images.map((url, i) => (
                    <div key={i} className="ps-image-preview-box">
                      <img src={url} alt={`Angle ${i + 1}`} className="ps-img-preview" />
                      <button
                        type="button"
                        className="ps-remove-img-btn"
                        onClick={() => removeGalleryImage(i)}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}

                  <label className="ps-add-thumb-btn">
                    <Plus size={20} color="#c8a45d" />
                    <span>Add Angle</span>
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={handleGalleryUpload}
                      style={{ display: 'none' }}
                    />
                  </label>
                </div>
              </div>
            </div>
          </div>

          {/* Sidebar Column */}
          <div className="ps-form-side-col">
            {/* Pricing & Stock Card */}
            <div className="ps-admin-form-card">
              <h2 className="ps-card-title">Pricing & Inventory</h2>

              <div className="ps-form-group">
                <label htmlFor="pprice">Retail Price (₹) *</label>
                <input
                  id="pprice"
                  type="number"
                  placeholder="1499"
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })}
                  required
                />
              </div>

              <div className="ps-form-group">
                <label htmlFor="pcompprice">Compare at Price (₹)</label>
                <input
                  id="pcompprice"
                  type="number"
                  placeholder="1999"
                  value={form.compare_at_price}
                  onChange={(e) => setForm({ ...form, compare_at_price: e.target.value })}
                />
              </div>

              <div className="ps-form-group">
                <label htmlFor="pstock">Stock Quantity</label>
                <input
                  id="pstock"
                  type="number"
                  value={form.stock}
                  onChange={(e) => setForm({ ...form, stock: e.target.value })}
                />
              </div>

              <div className="ps-form-group">
                <label htmlFor="pstatus">Listing Status</label>
                <select
                  id="pstatus"
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                >
                  {STATUSES.map((st) => (
                    <option key={st} value={st}>{st.toUpperCase()}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Categorization Card */}
            <div className="ps-admin-form-card">
              <h2 className="ps-card-title">Classification</h2>

              <div className="ps-form-group">
                <label htmlFor="pcat">Category</label>
                <select
                  id="pcat"
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                >
                  {CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              <div className="ps-form-group">
                <label htmlFor="pgender">Gender</label>
                <select
                  id="pgender"
                  value={form.gender}
                  onChange={(e) => setForm({ ...form, gender: e.target.value })}
                >
                  {GENDERS.map((g) => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
              </div>

              <div className="ps-form-group">
                <label htmlFor="pocc">Occasion</label>
                <input
                  id="pocc"
                  type="text"
                  placeholder="e.g. Royal Evening / Daily Ritual"
                  value={form.occasion}
                  onChange={(e) => setForm({ ...form, occasion: e.target.value })}
                />
              </div>
            </div>

            {/* Badges & Curations */}
            <div className="ps-admin-form-card">
              <h2 className="ps-card-title">Prominence & Badges</h2>

              <label className="ps-checkbox-label">
                <input
                  type="checkbox"
                  checked={form.bestseller}
                  onChange={(e) => setForm({ ...form, bestseller: e.target.checked })}
                />
                <span>Best Seller Badge</span>
              </label>

              <label className="ps-checkbox-label">
                <input
                  type="checkbox"
                  checked={form.new_arrival}
                  onChange={(e) => setForm({ ...form, new_arrival: e.target.checked })}
                />
                <span>New Arrival Badge</span>
              </label>

              <label className="ps-checkbox-label">
                <input
                  type="checkbox"
                  checked={form.featured}
                  onChange={(e) => setForm({ ...form, featured: e.target.checked })}
                />
                <span>Featured on Homepage</span>
              </label>
            </div>

            {/* Action Buttons */}
            <div className="ps-admin-form-actions">
              <button
                type="submit"
                className="ps-btn-gold-primary ps-save-prod-btn"
                disabled={saving}
              >
                {saving ? (
                  <span>COMMITTING FORMULATION...</span>
                ) : (
                  <span>SAVE FORMULATION</span>
                )}
              </button>

              <button
                type="button"
                className="ps-btn-cancel-form"
                onClick={() => navigate('/admin/products')}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
