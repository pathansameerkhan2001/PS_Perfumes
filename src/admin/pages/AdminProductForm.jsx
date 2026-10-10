import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  Upload,
  X,
  FileText,
  Image as ImageIcon,
  Sliders,
  Settings,
  RotateCcw,
  Loader2,
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
  const [isUploading, setIsUploading] = useState(false);
  const [uploadingField, setUploadingField] = useState(null);
  const [uploadProgress, setUploadProgress] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Local object URLs for immediate preview while uploading to Storage
  const [localPreviews, setLocalPreviews] = useState({
    main: '',
    glass: '',
    pvc: '',
  });

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
    glass_image: '',
    pvc_image: '',
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

  // Variants & Pricing Matrix (Glass & PVC across 30, 50, 100 ml with stock & SKU)
  const [variantMatrix, setVariantMatrix] = useState({
    '30 ml': { glassPrice: 1499, pvcPrice: 899, glassStock: 20, pvcStock: 40, glassSku: '', pvcSku: '' },
    '50 ml': { glassPrice: 2199, pvcPrice: 1299, glassStock: 15, pvcStock: 25, glassSku: '', pvcSku: '' },
    '100 ml': { glassPrice: 3299, pvcPrice: 1899, glassStock: 8, pvcStock: 12, glassSku: '', pvcSku: '' },
  });

  useEffect(() => {
    if (isEditing) {
      setLoading(true);
      getProductById(id)
        .then((p) => {
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
              glass_image: p.glass_image || '',
              pvc_image: p.pvc_image || '',
              gallery_images: p.gallery_images || [],
              featured: Boolean(p.featured || p.is_featured),
              new_arrival: Boolean(p.new_arrival || p.is_new_arrival),
              bestseller: Boolean(p.bestseller || p.is_bestseller),
              active: p.status === 'active' || p.active !== false || p.is_active !== false,
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
                    nextMatrix[sz].glassStock = v.stock_quantity !== undefined ? v.stock_quantity : (v.stock || 0);
                    if (v.sku) nextMatrix[sz].glassSku = v.sku;
                  } else {
                    nextMatrix[sz].pvcPrice = v.sale_price || v.price;
                    nextMatrix[sz].pvcStock = v.stock_quantity !== undefined ? v.stock_quantity : (v.stock || 0);
                    if (v.sku) nextMatrix[sz].pvcSku = v.sku;
                  }
                }
              });
              setVariantMatrix(nextMatrix);
            }
          }
        })
        .catch((err) => {
          setErrorMsg(`Failed to load product details: ${err.message || 'Unknown error'}`);
        })
        .finally(() => {
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
    const isTextField = field.toLowerCase().includes('sku');
    const value = isTextField ? String(val) : Math.max(0, parseInt(val, 10) || 0);
    setVariantMatrix((prev) => ({
      ...prev,
      [size]: {
        ...prev[size],
        [field]: value,
      },
    }));
  };

  // 1. Primary Campaign Image Upload Handler
  const handleMainImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset file input so re-selecting same file triggers change
    e.target.value = '';
    setErrorMsg('');
    setSuccessMsg('');

    // Instant local preview
    const localBlob = URL.createObjectURL(file);
    setLocalPreviews((prev) => ({ ...prev, main: localBlob }));

    setIsUploading(true);
    setUploadingField('main');
    setUploadProgress('Uploading primary image to Supabase Storage...');

    try {
      const { url, error } = await uploadImage(file, 'products', `${form.slug || 'prod'}-main`);
      if (error) {
        URL.revokeObjectURL(localBlob);
        setLocalPreviews((prev) => ({ ...prev, main: '' }));
        setErrorMsg(`Primary image upload failed: ${error}`);
      } else {
        setForm((prev) => ({ ...prev, main_image: url }));
        setSuccessMsg('Primary image uploaded successfully to Supabase Storage.');
        setTimeout(() => setSuccessMsg(''), 3000);
      }
    } catch (err) {
      URL.revokeObjectURL(localBlob);
      setLocalPreviews((prev) => ({ ...prev, main: '' }));
      setErrorMsg(`Primary image upload error: ${err.message || 'Storage error'}`);
    } finally {
      setIsUploading(false);
      setUploadingField(null);
      setUploadProgress(''); // Crucial: clear loading state in finally block!
    }
  };

  // 2. Glass Bottle Flacon Image Upload Handler
  const handleGlassImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    e.target.value = '';
    setErrorMsg('');
    setSuccessMsg('');

    const localBlob = URL.createObjectURL(file);
    setLocalPreviews((prev) => ({ ...prev, glass: localBlob }));

    setIsUploading(true);
    setUploadingField('glass');
    setUploadProgress('Uploading Glass Bottle image to Supabase Storage...');

    try {
      const { url, error } = await uploadImage(file, 'products', `${form.slug || 'prod'}-glass`);
      if (error) {
        URL.revokeObjectURL(localBlob);
        setLocalPreviews((prev) => ({ ...prev, glass: '' }));
        setErrorMsg(`Glass Bottle upload failed: ${error}`);
      } else {
        setForm((prev) => ({ ...prev, glass_image: url }));
        setSuccessMsg('Glass Bottle flacon image uploaded successfully.');
        setTimeout(() => setSuccessMsg(''), 3000);
      }
    } catch (err) {
      URL.revokeObjectURL(localBlob);
      setLocalPreviews((prev) => ({ ...prev, glass: '' }));
      setErrorMsg(`Glass Bottle upload error: ${err.message || 'Storage error'}`);
    } finally {
      setIsUploading(false);
      setUploadingField(null);
      setUploadProgress('');
    }
  };

  // 3. PVC Bottle Flacon Image Upload Handler
  const handlePvcImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    e.target.value = '';
    setErrorMsg('');
    setSuccessMsg('');

    const localBlob = URL.createObjectURL(file);
    setLocalPreviews((prev) => ({ ...prev, pvc: localBlob }));

    setIsUploading(true);
    setUploadingField('pvc');
    setUploadProgress('Uploading PVC Bottle image to Supabase Storage...');

    try {
      const { url, error } = await uploadImage(file, 'products', `${form.slug || 'prod'}-pvc`);
      if (error) {
        URL.revokeObjectURL(localBlob);
        setLocalPreviews((prev) => ({ ...prev, pvc: '' }));
        setErrorMsg(`PVC Bottle upload failed: ${error}`);
      } else {
        setForm((prev) => ({ ...prev, pvc_image: url }));
        setSuccessMsg('PVC Bottle flacon image uploaded successfully.');
        setTimeout(() => setSuccessMsg(''), 3000);
      }
    } catch (err) {
      URL.revokeObjectURL(localBlob);
      setLocalPreviews((prev) => ({ ...prev, pvc: '' }));
      setErrorMsg(`PVC Bottle upload error: ${err.message || 'Storage error'}`);
    } finally {
      setIsUploading(false);
      setUploadingField(null);
      setUploadProgress('');
    }
  };

  // 4. Gallery Images Upload Handler
  const handleGalleryUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    e.target.value = '';
    setErrorMsg('');
    setSuccessMsg('');

    setIsUploading(true);
    setUploadingField('gallery');
    setUploadProgress(`Uploading ${files.length} gallery images to Supabase Storage...`);

    try {
      const urls = [];
      for (const f of files) {
        const { url, error } = await uploadImage(f, 'products', `${form.slug || 'prod'}-angle`);
        if (error) {
          setErrorMsg(`Partial upload issue: ${error}`);
        } else if (url) {
          urls.push(url);
        }
      }
      if (urls.length > 0) {
        setForm((prev) => ({
          ...prev,
          gallery_images: [...prev.gallery_images, ...urls],
        }));
        setSuccessMsg(`${urls.length} gallery image(s) uploaded successfully.`);
        setTimeout(() => setSuccessMsg(''), 3000);
      }
    } catch (err) {
      setErrorMsg(`Gallery upload error: ${err.message || 'Storage error'}`);
    } finally {
      setIsUploading(false);
      setUploadingField(null);
      setUploadProgress('');
    }
  };

  const removeGalleryImage = (idx) => {
    setForm((prev) => ({
      ...prev,
      gallery_images: prev.gallery_images.filter((_, i) => i !== idx),
    }));
  };

  // Form Save & Submit
  const handleSubmit = async (e) => {
    if (e) e.preventDefault();

    if (isUploading) {
      setErrorMsg('Please wait for image uploads to complete before saving.');
      return;
    }

    if (!form.name.trim()) {
      setActiveTab('basic');
      setErrorMsg('Please specify a Product Name.');
      return;
    }

    // Require primary image
    if (!form.main_image) {
      setActiveTab('images');
      setErrorMsg('Primary campaign image is required. Please upload an image to Supabase Storage.');
      return;
    }

    // Safety: ensure no blob URLs are submitted
    if (form.main_image.startsWith('blob:') || form.glass_image?.startsWith('blob:') || form.pvc_image?.startsWith('blob:')) {
      setActiveTab('images');
      setErrorMsg('Temporary preview is still uploading. Please wait for upload to complete.');
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
          stock_quantity: cfg.glassStock,
          sku: cfg.glassSku || `${form.sku}-GL-${sizeNum}`,
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
          stock_quantity: cfg.pvcStock,
          sku: cfg.pvcSku || `${form.sku}-PV-${sizeNum}`,
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
      main_image: form.main_image,
      glass_image: form.glass_image || null,
      pvc_image: form.pvc_image || null,
      variants: generatedVariants,
    };

    try {
      if (isEditing) {
        await updateProduct(id, payload);
      } else {
        await createProduct(payload);
      }
      setSuccessMsg('Product, flacon images, and variant matrix saved successfully!');
      setTimeout(() => {
        navigate('/admin/products');
      }, 1200);
    } catch (err) {
      console.error('Save product error:', err);
      setErrorMsg(`Failed to save product in database: ${err.message || 'Unknown database error'}`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="ps-admin-product-builder">
        <div className="ps-admin-loading" style={{ padding: '60px', textAlign: 'center' }}>
          <Loader2 size={32} className="ps-spinner" style={{ margin: '0 auto 16px', display: 'block', animation: 'spin 1s linear infinite' }} />
          <span>Retrieving formulation details...</span>
        </div>
      </div>
    );
  }

  // Active display URLs for preview
  const activeMainImage = localPreviews.main || form.main_image;
  const activeGlassImage = localPreviews.glass || form.glass_image;
  const activePvcImage = localPreviews.pvc || form.pvc_image;

  return (
    <div className="ps-admin-product-builder">
      {/* Top Breadcrumb & Actions Bar */}
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
            disabled={saving || isUploading}
          >
            Cancel
          </button>
          <button
            type="button"
            className="ps-builder-btn-save"
            onClick={handleSubmit}
            disabled={saving || isUploading}
          >
            {saving ? 'Saving...' : isUploading ? 'Uploading Image...' : 'Save Product'}
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="ps-form-error-banner" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>{errorMsg}</span>
          <button
            type="button"
            onClick={() => setErrorMsg('')}
            style={{ background: 'transparent', border: 'none', color: '#DC2626', cursor: 'pointer', fontWeight: 600 }}
          >
            ✕
          </button>
        </div>
      )}

      {successMsg && <div className="ps-form-success-banner">{successMsg}</div>}
      {uploadProgress && (
        <div className="ps-form-progress-banner" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Loader2 size={16} className="ps-spin" style={{ animation: 'spin 1s linear infinite' }} />
          <span>{uploadProgress}</span>
        </div>
      )}

      {/* Main Builder Grid: Left Tabs Sidebar + Right Form Panel */}
      <div className="ps-builder-workspace">
        {/* Left Vertical Tabs */}
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
            <FileText size={16} />
            <span>Notes & Olfactory</span>
          </button>

          <button
            type="button"
            className={`ps-tab-item ${activeTab === 'seo' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('seo')}
          >
            <Settings size={16} />
            <span>SEO</span>
          </button>
        </aside>

        {/* Right Form Workspace */}
        <div className="ps-builder-content">
          {/* ========================================================
              TAB 1: VARIANTS & PRICING
              ======================================================== */}
          {activeTab === 'variants' && (
            <div className="ps-tab-pane">
              <h2 className="ps-pane-title">Variants & Pricing Matrix</h2>
              <p className="ps-pane-desc">
                Configure bespoke sizes (30ml, 50ml, 100ml) across Glass and PVC flacon styles with separate pricing and inventory.
              </p>

              <div className="ps-builder-section">
                <table className="ps-variant-matrix-table">
                  <thead>
                    <tr>
                      <th>Size</th>
                      <th>Glass Price (₹)</th>
                      <th>PVC Price (₹)</th>
                      <th>Glass Stock</th>
                      <th>PVC Stock</th>
                      <th>Glass SKU</th>
                      <th>PVC SKU</th>
                    </tr>
                  </thead>
                  <tbody>
                    {SIZES.map((sz) => {
                      const cfg = variantMatrix[sz];
                      const sizeNum = sz.replace(/\D/g, '');
                      return (
                        <tr key={sz}>
                          <td className="ps-matrix-size-cell">{sz}</td>
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
                          <td>
                            <input
                              type="text"
                              className="ps-matrix-input"
                              value={cfg.glassSku || ''}
                              onChange={(e) => handleMatrixChange(sz, 'glassSku', e.target.value)}
                              placeholder={`${form.sku || 'PS'}-GL-${sizeNum}`}
                              style={{ width: '130px', fontSize: '11.5px' }}
                            />
                          </td>
                          <td>
                            <input
                              type="text"
                              className="ps-matrix-input"
                              value={cfg.pvcSku || ''}
                              onChange={(e) => handleMatrixChange(sz, 'pvcSku', e.target.value)}
                              placeholder={`${form.sku || 'PS'}-PV-${sizeNum}`}
                              style={{ width: '130px', fontSize: '11.5px' }}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Bottle Type Options Checkboxes */}
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

              {/* Other Settings Toggles */}
              <div className="ps-builder-section">
                <h3 className="ps-sub-heading">Product Badges & Visibility</h3>
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
                    <span className="ps-toggle-label">Active on Storefront</span>
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
                  placeholder="e.g. Royal Oud Extrait"
                  value={form.name}
                  onChange={handleNameChange}
                  required
                />
              </div>

              <div className="ps-form-row">
                <div className="ps-form-group">
                  <label>Category</label>
                  <select
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                <div className="ps-form-group">
                  <label>Base SKU</label>
                  <input
                    type="text"
                    value={form.sku}
                    onChange={(e) => setForm({ ...form, sku: e.target.value })}
                    placeholder="PS-ROYAL-OUD"
                  />
                </div>
              </div>

              <div className="ps-form-group">
                <label>Short Headline / Subtitle</label>
                <input
                  type="text"
                  placeholder="Imperial Artisanal Extractions in pure flacons"
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
              TAB 3: IMAGES (SUPABASE STORAGE CONNECTED)
              ======================================================== */}
          {activeTab === 'images' && (
            <div className="ps-tab-pane">
              <h2 className="ps-pane-title">Flacon Imagery</h2>
              <p className="ps-pane-desc">
                Upload luxury assets to Supabase Storage bucket <code>ps-perfumes</code>. Supports WebP, PNG, and JPEG.
              </p>

              {/* 1. Main Primary Campaign Image */}
              <div className="ps-builder-section">
                <h3 className="ps-sub-heading">Primary Campaign Image *</h3>
                <div className="ps-image-upload-row">
                  {activeMainImage ? (
                    <div className="ps-img-preview-card" style={{ position: 'relative' }}>
                      <img src={activeMainImage} alt={form.name || 'Primary campaign'} />
                      {uploadingField === 'main' ? (
                        <div style={{
                          position: 'absolute',
                          inset: 0,
                          background: 'rgba(0,0,0,0.6)',
                          color: '#C9A96E',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '11px',
                          fontWeight: 600,
                          borderRadius: '8px'
                        }}>
                          Uploading...
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="ps-img-del-btn"
                          title="Remove image"
                          onClick={() => {
                            setForm((prev) => ({ ...prev, main_image: '' }));
                            setLocalPreviews((prev) => ({ ...prev, main: '' }));
                          }}
                        >
                          <X size={14} />
                        </button>
                      )}
                    </div>
                  ) : null}

                  <label className="ps-upload-card" style={{ opacity: isUploading ? 0.6 : 1, cursor: isUploading ? 'not-allowed' : 'pointer' }}>
                    <Upload size={22} color="#c8a45d" />
                    <span>{activeMainImage ? 'Replace Primary Image' : 'Upload Main Campaign Image'}</span>
                    <small>Supports PNG, JPG, WebP (Max 10MB)</small>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={handleMainImageUpload}
                      disabled={isUploading}
                      style={{ display: 'none' }}
                    />
                  </label>
                </div>
              </div>

              {/* 2. Glass Bottle Flacon Image */}
              <div className="ps-builder-section">
                <h3 className="ps-sub-heading">Glass Bottle Flacon Image</h3>
                <div className="ps-image-upload-row">
                  {activeGlassImage ? (
                    <div className="ps-img-preview-card" style={{ position: 'relative' }}>
                      <img src={activeGlassImage} alt={`${form.name} Glass Bottle`} />
                      {uploadingField === 'glass' ? (
                        <div style={{
                          position: 'absolute',
                          inset: 0,
                          background: 'rgba(0,0,0,0.6)',
                          color: '#C9A96E',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '11px',
                          fontWeight: 600,
                          borderRadius: '8px'
                        }}>
                          Uploading...
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="ps-img-del-btn"
                          title="Remove image"
                          onClick={() => {
                            setForm((prev) => ({ ...prev, glass_image: '' }));
                            setLocalPreviews((prev) => ({ ...prev, glass: '' }));
                          }}
                        >
                          <X size={14} />
                        </button>
                      )}
                    </div>
                  ) : null}

                  <label className="ps-upload-card" style={{ opacity: isUploading ? 0.6 : 1, cursor: isUploading ? 'not-allowed' : 'pointer' }}>
                    <Upload size={22} color="#c8a45d" />
                    <span>{activeGlassImage ? 'Replace Glass Flacon Image' : 'Upload Glass Flacon Image'}</span>
                    <small>Dedicated Glass Bottle Asset</small>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={handleGlassImageUpload}
                      disabled={isUploading}
                      style={{ display: 'none' }}
                    />
                  </label>
                </div>
              </div>

              {/* 3. PVC Bottle Flacon Image */}
              <div className="ps-builder-section">
                <h3 className="ps-sub-heading">PVC Bottle Flacon Image</h3>
                <div className="ps-image-upload-row">
                  {activePvcImage ? (
                    <div className="ps-img-preview-card" style={{ position: 'relative' }}>
                      <img src={activePvcImage} alt={`${form.name} PVC Bottle`} />
                      {uploadingField === 'pvc' ? (
                        <div style={{
                          position: 'absolute',
                          inset: 0,
                          background: 'rgba(0,0,0,0.6)',
                          color: '#C9A96E',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '11px',
                          fontWeight: 600,
                          borderRadius: '8px'
                        }}>
                          Uploading...
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="ps-img-del-btn"
                          title="Remove image"
                          onClick={() => {
                            setForm((prev) => ({ ...prev, pvc_image: '' }));
                            setLocalPreviews((prev) => ({ ...prev, pvc: '' }));
                          }}
                        >
                          <X size={14} />
                        </button>
                      )}
                    </div>
                  ) : null}

                  <label className="ps-upload-card" style={{ opacity: isUploading ? 0.6 : 1, cursor: isUploading ? 'not-allowed' : 'pointer' }}>
                    <Upload size={22} color="#c8a45d" />
                    <span>{activePvcImage ? 'Replace PVC Flacon Image' : 'Upload PVC Flacon Image'}</span>
                    <small>Dedicated PVC Bottle Asset</small>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={handlePvcImageUpload}
                      disabled={isUploading}
                      style={{ display: 'none' }}
                    />
                  </label>
                </div>
              </div>

              {/* 4. Gallery Images */}
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

                  <label className="ps-upload-card ps-upload-gallery-card" style={{ opacity: isUploading ? 0.6 : 1, cursor: isUploading ? 'not-allowed' : 'pointer' }}>
                    <Upload size={20} color="#c8a45d" />
                    <span>Add Angle</span>
                    <input
                      type="file"
                      multiple
                      accept="image/png,image/jpeg,image/webp"
                      onChange={handleGalleryUpload}
                      disabled={isUploading}
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
        </div>
      </div>
    </div>
  );
}
