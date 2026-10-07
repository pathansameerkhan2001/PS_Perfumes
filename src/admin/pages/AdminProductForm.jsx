import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  Upload,
  X,
  Layers,
  FileText,
  Image as ImageIcon,
  Sliders,
  Globe,
  Settings,
  Check,
} from 'lucide-react';
import { getProductById, createProduct, updateProduct } from '../../services/products';
import { uploadImage } from '../../lib/storage';
import './AdminProductForm.css';

const CATEGORIES = ['Attar', 'Perfume', 'Bakhoor', 'Musky', 'Oud', 'Floral', 'Woody', 'Combo Pack'];
const SIZES = ['30 ml', '50 ml', '100 ml'];

export default function AdminProductForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEditing = Boolean(id);

  const [activeTab, setActiveTab] = useState('variants');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [uploadProgress, setUploadProgress] = useState('');

  // Basic Info Form State
  const [form, setForm] = useState({
    name: '',
    slug: '',
    category: 'Oud',
    sku: '',
    short_description: '',
    description: '',
    price: 1499,
    compare_at_price: 1899,
    main_image: '',
    gallery_images: [],
    featured: false,
    new_arrival: false,
    bestseller: true,
    active: true,
    top_notes: '',
    heart_notes: '',
    base_notes: '',
    ingredients: '',
    meta_title: '',
    meta_description: '',
  });

  // Bottle Type Checkboxes
  const [bottleOptions, setBottleOptions] = useState({
    glass: true,
    pvc: true,
  });

  // Variants & Pricing Matrix (Screenshot 7)
  const [variantMatrix, setVariantMatrix] = useState({
    '30 ml': { glassPrice: 1499, pvcPrice: 899, glassStock: 20, pvcStock: 40 },
    '50 ml': { glassPrice: 2199, pvcPrice: 1299, glassStock: 15, pvcStock: 25 },
    '100 ml': { glassPrice: 3299, pvcPrice: 1899, glassStock: 8, pvcStock: 12 },
  });

  useEffect(() => {
    if (isEditing) {
      setLoading(true);
      getProductById(id).then((p) => {
        if (p) {
          setForm({
            name: p.name || '',
            slug: p.slug || '',
            category: p.category || 'Oud',
            sku: p.sku || '',
            short_description: p.short_description || '',
            description: p.description || '',
            price: p.price || 1499,
            compare_at_price: p.compare_at_price || '',
            main_image: p.main_image || p.image || '',
            gallery_images: p.gallery_images || [],
            featured: Boolean(p.featured),
            new_arrival: Boolean(p.new_arrival),
            bestseller: Boolean(p.bestseller),
            active: p.status === 'active' || p.active !== false,
            top_notes: Array.isArray(p.top_notes) ? p.top_notes.join(', ') : (p.top_notes || ''),
            heart_notes: Array.isArray(p.heart_notes) ? p.heart_notes.join(', ') : (p.heart_notes || ''),
            base_notes: Array.isArray(p.base_notes) ? p.base_notes.join(', ') : (p.base_notes || ''),
            ingredients: p.ingredients || '',
            meta_title: p.meta_title || p.name || '',
            meta_description: p.meta_description || p.short_description || '',
          });

          // Populate variant matrix if available
          if (Array.isArray(p.variants) && p.variants.length > 0) {
            const nextMatrix = { ...variantMatrix };
            p.variants.forEach((v) => {
              const sz = v.size_ml?.includes('ml') ? v.size_ml : `${v.size_ml} ml`;
              const isGlass = v.bottle_type?.toLowerCase().includes('glass');
              if (nextMatrix[sz]) {
                if (isGlass) {
                  nextMatrix[sz].glassPrice = v.sale_price || v.price;
                  nextMatrix[sz].glassStock = v.stock;
                } else {
                  nextMatrix[sz].pvcPrice = v.sale_price || v.price;
                  nextMatrix[sz].pvcStock = v.stock;
                }
              }
            });
            setVariantMatrix(nextMatrix);
          }
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
      meta_title: isEditing ? prev.meta_title : val,
    }));
  };

  const handleMatrixChange = (size, field, val) => {
    const num = Math.max(0, parseInt(val, 10) || 0);
    setVariantMatrix((prev) => ({
      ...prev,
      [size]: {
        ...prev[size],
        [field]: num,
      },
    }));
  };

  const handleMainImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadProgress('Uploading primary image to Supabase Storage...');
    try {
      const { url, error } = await uploadImage(file, 'products', form.slug || 'general');
      if (error) {
        setErrorMsg('Upload failed. Using image preview.');
      } else {
        setForm((prev) => ({ ...prev, main_image: url }));
        setUploadProgress('Primary image uploaded successfully.');
        setTimeout(() => setUploadProgress(''), 2500);
      }
    } catch {
      setErrorMsg('Image upload error.');
    }
  };

  const handleGalleryUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setUploadProgress(`Uploading ${files.length} gallery images...`);
    try {
      const urls = [];
      for (const f of files) {
        const { url } = await uploadImage(f, 'products', form.slug || 'general');
        if (url) urls.push(url);
      }
      setForm((prev) => ({
        ...prev,
        gallery_images: [...prev.gallery_images, ...urls],
      }));
      setUploadProgress('Gallery images uploaded.');
      setTimeout(() => setUploadProgress(''), 2500);
    } catch {
      setErrorMsg('Gallery upload error.');
    }
  };

  const removeGalleryImage = (idx) => {
    setForm((prev) => ({
      ...prev,
      gallery_images: prev.gallery_images.filter((_, i) => i !== idx),
    }));
  };

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!form.name.trim()) {
      setActiveTab('basic');
      setErrorMsg('Please specify Product Name.');
      return;
    }

    setSaving(true);
    setErrorMsg('');
    setSuccessMsg('');

    // Generate exact variant records for both Glass and PVC across 30, 50, 100 ml
    const generatedVariants = [];
    SIZES.forEach((sz) => {
      const cfg = variantMatrix[sz];
      const sizeNum = sz.replace(/\D/g, '');

      if (bottleOptions.glass) {
        generatedVariants.push({
          id: `var-${form.slug || 'prod'}-glass-${sizeNum}`,
          bottle_type: 'Glass Bottle',
          size_ml: sz,
          price: cfg.glassPrice,
          sale_price: cfg.glassPrice,
          stock: cfg.glassStock,
          sku: `${form.sku}-GL-${sizeNum}`,
          active: form.active,
          is_active: form.active,
        });
      }

      if (bottleOptions.pvc) {
        generatedVariants.push({
          id: `var-${form.slug || 'prod'}-pvc-${sizeNum}`,
          bottle_type: 'PVC Bottle',
          size_ml: sz,
          price: cfg.pvcPrice,
          sale_price: cfg.pvcPrice,
          stock: cfg.pvcStock,
          sku: `${form.sku}-PV-${sizeNum}`,
          active: form.active,
          is_active: form.active,
        });
      }
    });

    const payload = {
      ...form,
      price: variantMatrix['30 ml'].glassPrice || form.price,
      status: form.active ? 'active' : 'draft',
      stock: Object.values(variantMatrix).reduce((sum, item) => sum + item.glassStock + item.pvcStock, 0),
      top_notes: form.top_notes.split(',').map((s) => s.trim()).filter(Boolean),
      heart_notes: form.heart_notes.split(',').map((s) => s.trim()).filter(Boolean),
      base_notes: form.base_notes.split(',').map((s) => s.trim()).filter(Boolean),
      main_image: form.main_image || '/assets/prod-royal-amber.webp',
      variants: generatedVariants,
    };

    try {
      if (isEditing) {
        await updateProduct(id, payload);
      } else {
        await createProduct(payload);
      }
      setSuccessMsg('Product and variant matrix saved successfully!');
      setTimeout(() => {
        navigate('/admin/products');
      }, 1200);
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
    <div className="ps-admin-product-builder">
      {/* Top Breadcrumb & Actions Bar (Screenshot 7) */}
      <div className="ps-builder-top-bar">
        <div className="ps-builder-breadcrumbs">
          <Link to="/admin/products" className="ps-crumb-link">Products</Link>
          <span className="ps-crumb-sep">&gt;</span>
          <span className="ps-crumb-active">
            {isEditing ? `Edit Product` : 'Add Product'}
          </span>
        </div>

        <div className="ps-builder-top-actions">
          <button
            type="button"
            className="ps-builder-btn-cancel"
            onClick={() => navigate('/admin/products')}
          >
            Cancel
          </button>
          <button
            type="button"
            className="ps-builder-btn-save"
            onClick={handleSubmit}
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Save Product'}
          </button>
        </div>
      </div>

      {errorMsg && <div className="ps-form-error-banner">{errorMsg}</div>}
      {successMsg && <div className="ps-form-success-banner">{successMsg}</div>}
      {uploadProgress && <div className="ps-form-progress-banner">{uploadProgress}</div>}

      {/* Main Builder Grid: Left Tabs Sidebar + Right Form Panel */}
      <div className="ps-builder-workspace">
        {/* Left Vertical Tabs (Screenshot 7) */}
        <aside className="ps-builder-tabs-sidebar">
          <button
            type="button"
            className={`ps-tab-item ${activeTab === 'basic' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('basic')}
          >
            <FileText size={16} />
            <span>Basic Info</span>
          </button>

          <button
            type="button"
            className={`ps-tab-item ${activeTab === 'variants' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('variants')}
          >
            <Sliders size={16} />
            <span>Variants & Pricing</span>
          </button>

          <button
            type="button"
            className={`ps-tab-item ${activeTab === 'images' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('images')}
          >
            <ImageIcon size={16} />
            <span>Images</span>
          </button>

          <button
            type="button"
            className={`ps-tab-item ${activeTab === 'description' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('description')}
          >
            <Layers size={16} />
            <span>Description</span>
          </button>

          <button
            type="button"
            className={`ps-tab-item ${activeTab === 'seo' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('seo')}
          >
            <Globe size={16} />
            <span>SEO</span>
          </button>

          <button
            type="button"
            className={`ps-tab-item ${activeTab === 'settings' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('settings')}
          >
            <Settings size={16} />
            <span>Settings</span>
          </button>
        </aside>

        {/* Right Tab Content Container */}
        <div className="ps-builder-content-card">
          {/* ========================================================
              TAB 1: VARIANTS & PRICING (SCREENSHOT 7 MATRIX)
              ======================================================== */}
          {activeTab === 'variants' && (
            <div className="ps-tab-pane">
              <h2 className="ps-pane-title">Variants & Pricing</h2>

              {/* Matrix Table */}
              <div className="ps-matrix-table-wrap">
                <table className="ps-variant-matrix-table">
                  <thead>
                    <tr>
                      <th>Size</th>
                      <th>Glass Bottle</th>
                      <th>PVC Bottle</th>
                      <th>Stock (Glass)</th>
                      <th>Stock (PVC)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {SIZES.map((sz) => {
                      const cfg = variantMatrix[sz];
                      return (
                        <tr key={sz}>
                          <td className="ps-matrix-size-cell">
                            <strong>{sz}</strong>
                          </td>
                          <td>
                            <input
                              type="number"
                              className="ps-matrix-input"
                              value={cfg.glassPrice}
                              onChange={(e) => handleMatrixChange(sz, 'glassPrice', e.target.value)}
                              placeholder="₹"
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              className="ps-matrix-input"
                              value={cfg.pvcPrice}
                              onChange={(e) => handleMatrixChange(sz, 'pvcPrice', e.target.value)}
                              placeholder="₹"
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              className="ps-matrix-input"
                              value={cfg.glassStock}
                              onChange={(e) => handleMatrixChange(sz, 'glassStock', e.target.value)}
                              placeholder="Qty"
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              className="ps-matrix-input"
                              value={cfg.pvcStock}
                              onChange={(e) => handleMatrixChange(sz, 'pvcStock', e.target.value)}
                              placeholder="Qty"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Bottle Type Options Checkboxes (Screenshot 7) */}
              <div className="ps-builder-section">
                <h3 className="ps-sub-heading">Bottle Type Options</h3>
                <div className="ps-checkbox-group">
                  <label className="ps-checkbox-label">
                    <input
                      type="checkbox"
                      checked={bottleOptions.glass}
                      onChange={(e) => setBottleOptions({ ...bottleOptions, glass: e.target.checked })}
                    />
                    <span>Glass Bottle</span>
                  </label>
                  <label className="ps-checkbox-label">
                    <input
                      type="checkbox"
                      checked={bottleOptions.pvc}
                      onChange={(e) => setBottleOptions({ ...bottleOptions, pvc: e.target.checked })}
                    />
                    <span>PVC Bottle</span>
                  </label>
                </div>
              </div>

              {/* Other Settings Toggles (Screenshot 7) */}
              <div className="ps-builder-section">
                <h3 className="ps-sub-heading">Other Settings</h3>
                <div className="ps-toggles-grid">
                  <div className="ps-toggle-row">
                    <label className="ps-switch">
                      <input
                        type="checkbox"
                        checked={form.featured}
                        onChange={(e) => setForm({ ...form, featured: e.target.checked })}
                      />
                      <span className="ps-slider" />
                    </label>
                    <span className="ps-toggle-label">Featured Product</span>
                  </div>

                  <div className="ps-toggle-row">
                    <label className="ps-switch">
                      <input
                        type="checkbox"
                        checked={form.active}
                        onChange={(e) => setForm({ ...form, active: e.target.checked })}
                      />
                      <span className="ps-slider" />
                    </label>
                    <span className="ps-toggle-label">Active</span>
                  </div>

                  <div className="ps-toggle-row">
                    <label className="ps-switch">
                      <input
                        type="checkbox"
                        checked={form.new_arrival}
                        onChange={(e) => setForm({ ...form, new_arrival: e.target.checked })}
                      />
                      <span className="ps-slider" />
                    </label>
                    <span className="ps-toggle-label">New Arrival</span>
                  </div>

                  <div className="ps-toggle-row">
                    <label className="ps-switch">
                      <input
                        type="checkbox"
                        checked={form.bestseller}
                        onChange={(e) => setForm({ ...form, bestseller: e.target.checked })}
                      />
                      <span className="ps-slider" />
                    </label>
                    <span className="ps-toggle-label">Best Seller</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================
              TAB 2: BASIC INFO
              ======================================================== */}
          {activeTab === 'basic' && (
            <div className="ps-tab-pane">
              <h2 className="ps-pane-title">Basic Info</h2>

              <div className="ps-form-group">
                <label>Product Name *</label>
                <input
                  type="text"
                  placeholder="e.g. Oud Royal"
                  value={form.name}
                  onChange={handleNameChange}
                  required
                />
              </div>

              <div className="ps-form-row">
                <div className="ps-form-group">
                  <label>SKU</label>
                  <input
                    type="text"
                    value={form.sku}
                    onChange={(e) => setForm({ ...form, sku: e.target.value })}
                  />
                </div>
                <div className="ps-form-group">
                  <label>Category *</label>
                  <select
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                  >
                    {CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="ps-form-group">
                <label>Short Description</label>
                <input
                  type="text"
                  placeholder="A luxurious blend of traditional oud with modern elegance."
                  value={form.short_description}
                  onChange={(e) => setForm({ ...form, short_description: e.target.value })}
                />
              </div>

              <div className="ps-form-group">
                <label>Full Editorial Description</label>
                <textarea
                  rows={5}
                  placeholder="Describe the fragrance character, inspiration, and mood..."
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </div>
            </div>
          )}

          {/* ========================================================
              TAB 3: IMAGES
              ======================================================== */}
          {activeTab === 'images' && (
            <div className="ps-tab-pane">
              <h2 className="ps-pane-title">Flacon Imagery</h2>

              {/* Main Image */}
              <div className="ps-builder-section">
                <h3 className="ps-sub-heading">Primary Product Image</h3>
                <div className="ps-image-upload-row">
                  {form.main_image ? (
                    <div className="ps-img-preview-card">
                      <img src={form.main_image} alt={form.name} />
                      <button
                        type="button"
                        className="ps-img-del-btn"
                        onClick={() => setForm({ ...form, main_image: '' })}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ) : null}

                  <label className="ps-upload-card">
                    <Upload size={22} color="#c8a45d" />
                    <span>Upload Main Flacon Image</span>
                    <small>Supports PNG, JPG, WebP</small>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleMainImageUpload}
                      style={{ display: 'none' }}
                    />
                  </label>
                </div>
              </div>

              {/* Gallery Images */}
              <div className="ps-builder-section">
                <h3 className="ps-sub-heading">Gallery Angles</h3>
                <div className="ps-gallery-grid">
                  {form.gallery_images.map((img, idx) => (
                    <div key={idx} className="ps-img-preview-card">
                      <img src={img} alt={`Angle ${idx + 1}`} />
                      <button
                        type="button"
                        className="ps-img-del-btn"
                        onClick={() => removeGalleryImage(idx)}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}

                  <label className="ps-upload-card ps-upload-gallery-card">
                    <Upload size={20} color="#c8a45d" />
                    <span>Add Angle</span>
                    <input
                      type="file"
                      multiple
                      accept="image/*"
                      onChange={handleGalleryUpload}
                      style={{ display: 'none' }}
                    />
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================
              TAB 4: DESCRIPTION & NOTES
              ======================================================== */}
          {activeTab === 'description' && (
            <div className="ps-tab-pane">
              <h2 className="ps-pane-title">Olfactory Notes & Formulation</h2>

              <div className="ps-form-group">
                <label>Top Notes (comma separated)</label>
                <input
                  type="text"
                  placeholder="Bergamot, Royal Saffron, Wild Cardamom"
                  value={form.top_notes}
                  onChange={(e) => setForm({ ...form, top_notes: e.target.value })}
                />
              </div>

              <div className="ps-form-group">
                <label>Heart Notes (comma separated)</label>
                <input
                  type="text"
                  placeholder="Bulgarian Rose, Ambergris, Cinnamon Bark"
                  value={form.heart_notes}
                  onChange={(e) => setForm({ ...form, heart_notes: e.target.value })}
                />
              </div>

              <div className="ps-form-group">
                <label>Base Notes (comma separated)</label>
                <input
                  type="text"
                  placeholder="Cambodian Agarwood (Oud), Bourbon Vanilla, Velvet Musk"
                  value={form.base_notes}
                  onChange={(e) => setForm({ ...form, base_notes: e.target.value })}
                />
              </div>

              <div className="ps-form-group">
                <label>Ingredients Declaration</label>
                <textarea
                  rows={3}
                  value={form.ingredients}
                  onChange={(e) => setForm({ ...form, ingredients: e.target.value })}
                  placeholder="Alcohol Denat., Parfum (Fragrance), Aqua (Water)..."
                />
              </div>
            </div>
          )}

          {/* ========================================================
              TAB 5: SEO
              ======================================================== */}
          {activeTab === 'seo' && (
            <div className="ps-tab-pane">
              <h2 className="ps-pane-title">Search Engine Optimization (SEO)</h2>

              <div className="ps-form-group">
                <label>URL Slug *</label>
                <input
                  type="text"
                  value={form.slug}
                  onChange={(e) => setForm({ ...form, slug: e.target.value })}
                  required
                />
              </div>

              <div className="ps-form-group">
                <label>Meta Title</label>
                <input
                  type="text"
                  value={form.meta_title}
                  onChange={(e) => setForm({ ...form, meta_title: e.target.value })}
                  placeholder="PS PERFUMES | Oud Royal Luxury Extrait"
                />
              </div>

              <div className="ps-form-group">
                <label>Meta Description</label>
                <textarea
                  rows={3}
                  value={form.meta_description}
                  onChange={(e) => setForm({ ...form, meta_description: e.target.value })}
                  placeholder="Discover Oud Royal by PS PERFUMES. Pure steam-distilled agarwood in bespoke flacons."
                />
              </div>
            </div>
          )}

          {/* ========================================================
              TAB 6: SETTINGS
              ======================================================== */}
          {activeTab === 'settings' && (
            <div className="ps-tab-pane">
              <h2 className="ps-pane-title">Settings & Status</h2>

              <div className="ps-form-group">
                <label>Product Status</label>
                <select
                  value={form.active ? 'active' : 'draft'}
                  onChange={(e) => setForm({ ...form, active: e.target.value === 'active' })}
                >
                  <option value="active">Active (Visible on Storefront)</option>
                  <option value="draft">Draft (Hidden)</option>
                </select>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
