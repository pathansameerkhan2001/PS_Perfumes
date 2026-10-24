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
import { getCategories } from '../../services/categories';
import { uploadImage } from '../../lib/storage';
import './AdminProductForm.css';

// Categories always come from the database (categories table). There is deliberately no
// hard-coded list: offering a category that does not exist makes the save fail.
const ATTAR_SIZES = ['3 ml', '6 ml', '8 ml', '10 ml', '12 ml'];
const PERFUME_SIZES = ['30 ml', '50 ml', '100 ml'];

const isAttarName = (cat) => String(cat || '').toLowerCase().includes('attar');
const sizesForCategory = (cat) => (isAttarName(cat) ? ATTAR_SIZES : PERFUME_SIZES);

// "6ml", "6 ML" and "6 ml" are the same size; other labels (e.g. legacy sets) are kept verbatim
const sizeKey = (raw) => {
  const s = String(raw || '').trim();
  const m = s.match(/^(\d+(?:\.\d+)?)\s*ml$/i) || s.match(/^(\d+(?:\.\d+)?)$/);
  return m ? `${Number(m[1])} ml` : s;
};
const sizeSortValue = (sz) => {
  const n = parseFloat(sz);
  return Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER;
};
const sortSizes = (list) => [...new Set(list)].sort((a, b) => sizeSortValue(a) - sizeSortValue(b));
// Glass/PVC are the bottle types the matrix edits; any other stored label stays as it is
const bottleKey = (bt) => {
  const s = String(bt || '').toLowerCase();
  if (s.includes('pvc')) return 'PVC Bottle';
  if (s.includes('glass')) return 'Glass Bottle';
  return String(bt || '').trim();
};

const EMPTY_SIZE_ROW = { glassPrice: 0, pvcPrice: 0, glassStock: 0, pvcStock: 0, glassSku: '', pvcSku: '' };

// Fresh deep copy so editing one product never mutates the shared defaults
const cloneDefaultMatrix = () =>
  Object.fromEntries(Object.entries(DEFAULT_VARIANT_MATRIX).map(([k, v]) => [k, { ...v }]));
// Existing products start from zero, so a size/bottle the product never had is never given a placeholder price
const cloneEmptyMatrix = () =>
  Object.fromEntries(Object.keys(DEFAULT_VARIANT_MATRIX).map((k) => [k, { ...EMPTY_SIZE_ROW }]));

const DEFAULT_VARIANT_MATRIX = {
  '3 ml': { ...EMPTY_SIZE_ROW },
  '6 ml': { glassPrice: 499, pvcPrice: 399, glassStock: 50, pvcStock: 0, glassSku: '', pvcSku: '' },
  '8 ml': { ...EMPTY_SIZE_ROW },
  '10 ml': { glassPrice: 799, pvcPrice: 649, glassStock: 30, pvcStock: 0, glassSku: '', pvcSku: '' },
  '12 ml': { ...EMPTY_SIZE_ROW },
  '30 ml': { glassPrice: 1499, pvcPrice: 899, glassStock: 20, pvcStock: 40, glassSku: '', pvcSku: '' },
  '50 ml': { glassPrice: 2199, pvcPrice: 1299, glassStock: 15, pvcStock: 25, glassSku: '', pvcSku: '' },
  '100 ml': { glassPrice: 3299, pvcPrice: 1899, glassStock: 8, pvcStock: 12, glassSku: '', pvcSku: '' },
};

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
    // category_id is what is saved; category (the name) drives attar/perfume size rules
    category_id: '',
    category: '',
    sku: '',
    short_description: '',
    description: '',
    price: 1499,
    compare_at_price: 1899,
    main_image: '',
    main_image_path: '',
    glass_image: '',
    glass_image_path: '',
    pvc_image: '',
    pvc_image_path: '',
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

  // Selected sizes for this specific product
  const [selectedSizes, setSelectedSizes] = useState(['30 ml', '50 ml', '100 ml']);

  // Bottle Type Checkboxes
  const [bottleOptions, setBottleOptions] = useState({
    glass: true,
    pvc: true,
  });

  // Variants & Pricing Matrix
  const [variantMatrix, setVariantMatrix] = useState(cloneDefaultMatrix);

  // Sizes the saved product already has (always offered, whatever the category), and its
  // saved variants as "Bottle|size" keys, so a save never removes one without confirmation
  const [storedSizes, setStoredSizes] = useState([]);
  const [storedVariantKeys, setStoredVariantKeys] = useState([]);
  const sizeOptions = (cat) => sortSizes([...sizesForCategory(cat), ...storedSizes]);

  // Category records from the database: { id, name, slug, is_active }
  const [categories, setCategories] = useState([]);
  // 'loading' | 'ready' | 'empty' | 'error'
  const [categoriesStatus, setCategoriesStatus] = useState('loading');
  const [categoriesError, setCategoriesError] = useState('');

  useEffect(() => {
    let active = true;
    getCategories(true)
      .then((cats) => {
        if (!active) return;
        const list = (cats || []).filter((c) => c && c.id && c.name);
        setCategories(list);
        setCategoriesStatus(list.length > 0 ? 'ready' : 'empty');
        // A new product starts on the first active category that exists in the database
        if (!isEditing && list.length > 0) {
          const first = list.find((c) => c.is_active !== false) || list[0];
          setForm((prev) => (prev.category_id ? prev : { ...prev, category_id: first.id, category: first.name }));
        }
      })
      .catch((err) => {
        if (!active) return;
        setCategoriesStatus('error');
        setCategoriesError(err?.message || 'Could not load categories.');
      });
    return () => {
      active = false;
    };
  }, [isEditing]);

  useEffect(() => {
    if (isEditing) {
      setLoading(true);
      getProductById(id)
        .then((p) => {
          if (!p) {
            setErrorMsg('This product was not found in the database. It may have been deleted.');
            return;
          }
          if (p) {
            const isAttar = isAttarName(p.category);
            const stored = p.stored_images || {};
            setForm({
              name: p.name || '',
              slug: p.slug || '',
              // The product's real category; if it was removed, the admin must choose one
              category_id: p.category_id || '',
              category: p.category_id ? p.category || '' : '',
              sku: p.sku || '',
              short_description: p.short_description || '',
              description: p.description || '',
              price: p.price || 1499,
              compare_at_price: p.compare_at_price || '',
              main_image: stored.main || '',
              main_image_path: stored.main_path || '',
              glass_image: stored.glass || '',
              glass_image_path: stored.glass_path || '',
              pvc_image: stored.pvc || '',
              pvc_image_path: stored.pvc_path || '',
              gallery_images: p.gallery_images || [],
              featured: Boolean(p.featured || p.is_featured),
              new_arrival: Boolean(p.new_arrival || p.is_new_arrival),
              bestseller: Boolean(p.bestseller || p.is_bestseller),
              active: p.is_active !== false,
              top_notes: Array.isArray(p.top_notes) ? p.top_notes.join(', ') : (p.top_notes || ''),
              heart_notes: Array.isArray(p.heart_notes) ? p.heart_notes.join(', ') : (p.heart_notes || ''),
              base_notes: Array.isArray(p.base_notes) ? p.base_notes.join(', ') : (p.base_notes || ''),
              ingredients: p.ingredients || '',
              meta_title: p.meta_title || p.name || '',
              meta_description: p.meta_description || p.short_description || '',
            });

            // Populate variant matrix and dynamic sizes if available
            if (Array.isArray(p.variants) && p.variants.length > 0) {
              const nextMatrix = cloneEmptyMatrix();
              const foundSizes = [];
              const foundKeys = [];
              let hasPvc = false;
              let hasGlass = false;

              p.variants.forEach((v) => {
                const sz = sizeKey(v.size_ml);
                if (!sz) return;

                // Every stored size is kept, including sizes outside the category's usual set
                if (!foundSizes.includes(sz)) {
                  foundSizes.push(sz);
                }

                const isGlass = v.bottle_type?.toLowerCase().includes('glass');
                const isPvc = v.bottle_type?.toLowerCase().includes('pvc');
                if (isPvc) hasPvc = true;
                if (isGlass) hasGlass = true;
                foundKeys.push(`${bottleKey(v.bottle_type)}|${sz}`);

                if (!nextMatrix[sz]) nextMatrix[sz] = { ...EMPTY_SIZE_ROW };
                if (isGlass) {
                  nextMatrix[sz].glassPrice = v.sale_price || v.price;
                  nextMatrix[sz].glassStock = v.stock_quantity !== undefined ? v.stock_quantity : (v.stock || 0);
                  if (v.sku) nextMatrix[sz].glassSku = v.sku;
                } else if (isPvc) {
                  nextMatrix[sz].pvcPrice = v.sale_price || v.price;
                  nextMatrix[sz].pvcStock = v.stock_quantity !== undefined ? v.stock_quantity : (v.stock || 0);
                  if (v.sku) nextMatrix[sz].pvcSku = v.sku;
                }
              });

              setStoredSizes(foundSizes);
              setStoredVariantKeys(foundKeys);
              if (foundSizes.length > 0) {
                setSelectedSizes(sortSizes(foundSizes));
              } else if (isAttar) {
                setSelectedSizes(['6 ml', '10 ml']);
              }

              // Offer exactly the bottle types this product already has. Defaulting PVC to "on"
              // for a glass-only perfume would create PVC variants with placeholder prices on save.
              setBottleOptions({
                glass: hasGlass || !hasPvc,
                pvc: hasPvc,
              });
              setVariantMatrix(nextMatrix);
            } else if (isAttar) {
              setSelectedSizes(['6 ml', '10 ml']);
              setBottleOptions({ glass: true, pvc: false });
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

  const handleCategoryChange = (e) => {
    const chosen = categories.find((c) => c.id === e.target.value);
    const newCat = chosen ? chosen.name : '';
    const allowed = sizeOptions(newCat);
    setForm((prev) => ({ ...prev, category_id: chosen ? chosen.id : '', category: newCat }));

    // Keep sizes valid for the new category plus every size the saved product already has
    setSelectedSizes((prev) => {
      const kept = prev.filter((s) => allowed.includes(s));
      return kept.length > 0 ? kept : isAttarName(newCat) ? ['6 ml', '10 ml'] : PERFUME_SIZES;
    });

    // A saved product keeps the bottle types it has; defaults apply to new products only
    if (storedVariantKeys.length > 0) return;
    if (isAttarName(newCat)) {
      setBottleOptions({ glass: true, pvc: false });
    } else {
      setBottleOptions({ glass: true, pvc: true });
    }
  };

  const toggleSize = (sz) => {
    if (selectedSizes.includes(sz) && selectedSizes.length <= 1) {
      setErrorMsg('At least one size must remain active for the product.');
      return;
    }
    setSelectedSizes((prev) => {
      if (prev.includes(sz)) return prev.filter((s) => s !== sz);
      const next = [...prev, sz];
      return sizeOptions(form.category).filter((s) => next.includes(s));
    });
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

  // 1–3. Primary / Glass Bottle / PVC Bottle image uploads.
  // The form only receives the URL and storage path after Storage confirms the upload;
  // the blob preview is shown while uploading and replaced by the stored image afterwards.
  const FLACON_UPLOADS = {
    main: { label: 'Primary image', urlKey: 'main_image', pathKey: 'main_image_path', suffix: 'main' },
    glass: { label: 'Glass Bottle image', urlKey: 'glass_image', pathKey: 'glass_image_path', suffix: 'glass' },
    pvc: { label: 'PVC Bottle image', urlKey: 'pvc_image', pathKey: 'pvc_image_path', suffix: 'pvc' },
  };

  const uploadFlaconImage = async (field, e) => {
    const cfg = FLACON_UPLOADS[field];
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset file input so re-selecting same file triggers change
    e.target.value = '';
    setErrorMsg('');
    setSuccessMsg('');

    const localBlob = URL.createObjectURL(file);
    setLocalPreviews((prev) => ({ ...prev, [field]: localBlob }));

    setIsUploading(true);
    setUploadingField(field);
    setUploadProgress(`Uploading ${cfg.label} to Supabase Storage...`);

    try {
      const { url, path, error } = await uploadImage(file, 'products', `${form.slug || 'prod'}-${cfg.suffix}`);
      if (error || !url || !path) {
        setErrorMsg(`${cfg.label} upload failed: ${error || 'Storage did not return the uploaded file.'}`);
      } else {
        setForm((prev) => ({ ...prev, [cfg.urlKey]: url, [cfg.pathKey]: path }));
        setSuccessMsg(`${cfg.label} uploaded to Storage. Click "Save Product" to attach it to the product.`);
        setTimeout(() => setSuccessMsg(''), 4000);
      }
    } catch (err) {
      setErrorMsg(`${cfg.label} upload error: ${err.message || 'Storage error'}`);
    } finally {
      URL.revokeObjectURL(localBlob);
      setLocalPreviews((prev) => ({ ...prev, [field]: '' }));
      setIsUploading(false);
      setUploadingField(null);
      setUploadProgress(''); // Crucial: clear loading state in finally block!
    }
  };

  const handleMainImageUpload = (e) => uploadFlaconImage('main', e);
  const handleGlassImageUpload = (e) => uploadFlaconImage('glass', e);
  const handlePvcImageUpload = (e) => uploadFlaconImage('pvc', e);

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

    // The category must be a real row of the categories table (never a substituted name)
    if (!form.category_id || !categories.some((c) => c.id === form.category_id)) {
      setActiveTab('basic');
      setErrorMsg(
        categoriesStatus === 'empty'
          ? 'No categories exist in the database yet. Create the fragrance categories under Admin → Categories, then choose one for this product.'
          : categoriesStatus === 'error'
          ? `Categories could not be loaded (${categoriesError}). Reload the page and try again.`
          : 'Please choose a category for this product.'
      );
      return;
    }

    const cleanSlug = String(form.slug || form.name)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
    if (!cleanSlug) {
      setActiveTab('seo');
      setErrorMsg('Please enter a URL slug using letters or numbers.');
      return;
    }

    if (!bottleOptions.glass && !bottleOptions.pvc) {
      setActiveTab('variants');
      setErrorMsg('Select at least one bottle type (Glass or PVC).');
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

    // Generate exact variant records for enabled bottle types across the offered sizes
    // (the category's sizes plus any size the saved product already has)
    const generatedVariants = [];
    const allowedSizes = sizeOptions(form.category);
    selectedSizes.filter((sz) => allowedSizes.includes(sz)).forEach((sz) => {
      const cfg = variantMatrix[sz] || DEFAULT_VARIANT_MATRIX[sz] || EMPTY_SIZE_ROW;
      const sizeNum = sz.replace(/\D/g, '');

      // Variants stay active; product visibility is controlled by the product's own status.
      // A SKU is generated only from a product SKU, never from an empty one.
      if (bottleOptions.glass) {
        generatedVariants.push({
          id: `var-${form.slug || 'prod'}-glass-${sizeNum}`,
          bottle_type: 'Glass Bottle',
          size_ml: sz,
          price: cfg.glassPrice,
          sale_price: cfg.glassPrice,
          stock: cfg.glassStock,
          stock_quantity: cfg.glassStock,
          sku: cfg.glassSku || (form.sku ? `${form.sku}-GL-${sizeNum}` : ''),
          active: true,
          is_active: true,
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
          sku: cfg.pvcSku || (form.sku ? `${form.sku}-PV-${sizeNum}` : ''),
          active: true,
          is_active: true,
        });
      }
    });

    // Saving replaces the variant matrix: never remove a saved variant without explicit confirmation
    if (isEditing && storedVariantKeys.length > 0) {
      const kept = new Set(generatedVariants.map((v) => `${v.bottle_type}|${sizeKey(v.size_ml)}`));
      const removed = [...new Set(storedVariantKeys)].filter((k) => !kept.has(k));
      if (removed.length > 0) {
        const list = removed.map((k) => `• ${k.replace('|', ' — ')}`).join('\n');
        const ok = window.confirm(
          `Saving will remove ${removed.length} existing variant(s) from this product:\n\n${list}\n\n` +
            'Variants with order history are deactivated instead of deleted. Continue?'
        );
        if (!ok) {
          setActiveTab('variants');
          setErrorMsg('Not saved. Re-enable the sizes or bottle types listed to keep those variants.');
          return;
        }
      }
    }

    setSaving(true);
    setErrorMsg('');
    setSuccessMsg('');

    // Compute lowest variant price as base price, and total stock across active variants
    const allPrices = generatedVariants.map((v) => Number(v.sale_price || v.price)).filter((p) => p > 0);
    const minPrice = allPrices.length > 0 ? Math.min(...allPrices) : form.price;
    const totalStock = generatedVariants.reduce((sum, v) => sum + (Number(v.stock_quantity) || 0), 0);

    const payload = {
      ...form,
      // Saved as products.category_id (resolveCategoryId passes a UUID through unchanged)
      category_id: form.category_id,
      category: form.category,
      slug: cleanSlug,
      price: minPrice,
      status: form.active ? 'active' : 'draft',
      stock: totalStock,
      top_notes: form.top_notes.split(',').map((s) => s.trim()).filter(Boolean),
      heart_notes: form.heart_notes.split(',').map((s) => s.trim()).filter(Boolean),
      base_notes: form.base_notes.split(',').map((s) => s.trim()).filter(Boolean),
      main_image: form.main_image,
      main_image_path: form.main_image_path || null,
      glass_image: bottleOptions.glass ? (form.glass_image || null) : null,
      glass_image_path: bottleOptions.glass ? (form.glass_image_path || null) : null,
      pvc_image: bottleOptions.pvc ? (form.pvc_image || null) : null,
      pvc_image_path: bottleOptions.pvc ? (form.pvc_image_path || null) : null,
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
        <div className="ps-form-error-banner" role="alert" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
          <span>{errorMsg}</span>
          <button
            type="button"
            onClick={() => setErrorMsg('')}
            aria-label="Dismiss error"
            style={{ background: 'transparent', border: 'none', color: '#DC2626', cursor: 'pointer', fontWeight: 600 }}
          >
            ✕
          </button>
        </div>
      )}

      {successMsg && <div className="ps-form-success-banner" role="status">{successMsg}</div>}
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
                Configure bespoke sizes (3, 6, 8, 10, 12 ml for Attars; 30 ml, 50 ml, 100 ml for Perfumes) with individual pricing, inventory, and SKU management. Sizes this product already has are always listed.
              </p>

              {/* 1. Size Configuration Pill Controls */}
              <div className="ps-builder-section" style={{ borderTop: 'none', paddingTop: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
                  <h3 className="ps-sub-heading" style={{ margin: 0 }}>Offered Sizes (Toggle to Enable / Disable)</h3>
                  <span style={{ fontSize: '12px', color: '#8C8479' }}>
                    {isAttarName(form.category) ? 'Attar sizes: 3, 6, 8, 10, 12 ml' : 'Perfume sizes: 30, 50, 100 ml'}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {sizeOptions(form.category).map((sz) => {
                    const isSelected = selectedSizes.includes(sz);
                    const isAttarSize = ATTAR_SIZES.includes(sz);
                    return (
                      <button
                        key={sz}
                        type="button"
                        onClick={() => toggleSize(sz)}
                        style={{
                          padding: '7px 16px',
                          borderRadius: '20px',
                          fontSize: '12px',
                          fontWeight: isSelected ? 600 : 400,
                          cursor: 'pointer',
                          border: isSelected ? '1px solid #C9A96E' : '1px solid #E5E0D8',
                          backgroundColor: isSelected ? '#1A1714' : '#FFFFFF',
                          color: isSelected ? '#C9A96E' : '#6F675E',
                          transition: 'all 0.2s ease',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                        }}
                      >
                        <span>{sz}</span>
                        {isAttarSize && <span style={{ fontSize: '10px', opacity: 0.8 }}>(Attar)</span>}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 2. Dynamic Matrix Table */}
              <div className="ps-builder-section ps-matrix-scroll" role="region" aria-label="Variant pricing table" tabIndex={0}>
                <table className="ps-variant-matrix-table">
                  <thead>
                    <tr>
                      <th>Size</th>
                      {bottleOptions.glass && <th>Glass Price (₹)</th>}
                      {bottleOptions.pvc && <th>PVC Price (₹)</th>}
                      {bottleOptions.glass && <th>Glass Stock</th>}
                      {bottleOptions.pvc && <th>PVC Stock</th>}
                      {bottleOptions.glass && <th>Glass SKU</th>}
                      {bottleOptions.pvc && <th>PVC SKU</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {selectedSizes.map((sz) => {
                      const cfg = variantMatrix[sz] || DEFAULT_VARIANT_MATRIX[sz] || EMPTY_SIZE_ROW;
                      const sizeNum = sz.replace(/\D/g, '');
                      return (
                        <tr key={sz}>
                          <td className="ps-matrix-size-cell">{sz}</td>
                          {bottleOptions.glass && (
                            <td>
                              <input
                                type="number"
                                className="ps-matrix-input"
                                value={cfg.glassPrice}
                                onChange={(e) => handleMatrixChange(sz, 'glassPrice', e.target.value)}
                                placeholder="₹"
                              />
                            </td>
                          )}
                          {bottleOptions.pvc && (
                            <td>
                              <input
                                type="number"
                                className="ps-matrix-input"
                                value={cfg.pvcPrice}
                                onChange={(e) => handleMatrixChange(sz, 'pvcPrice', e.target.value)}
                                placeholder="₹"
                              />
                            </td>
                          )}
                          {bottleOptions.glass && (
                            <td>
                              <input
                                type="number"
                                className="ps-matrix-input"
                                value={cfg.glassStock}
                                onChange={(e) => handleMatrixChange(sz, 'glassStock', e.target.value)}
                                placeholder="Qty"
                              />
                            </td>
                          )}
                          {bottleOptions.pvc && (
                            <td>
                              <input
                                type="number"
                                className="ps-matrix-input"
                                value={cfg.pvcStock}
                                onChange={(e) => handleMatrixChange(sz, 'pvcStock', e.target.value)}
                                placeholder="Qty"
                              />
                            </td>
                          )}
                          {bottleOptions.glass && (
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
                          )}
                          {bottleOptions.pvc && (
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
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* 3. Bottle Type Options Checkboxes */}
              <div className="ps-builder-section">
                <h3 className="ps-sub-heading">Bottle Type Options</h3>
                <div className="ps-checkbox-group">
                  <label className="ps-checkbox-label">
                    <input
                      type="checkbox"
                      checked={bottleOptions.glass}
                      onChange={(e) => setBottleOptions({ ...bottleOptions, glass: e.target.checked })}
                    />
                    <span>Glass Bottle {isAttarName(form.category) ? '(Standard for Attars)' : ''}</span>
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
                {isAttarName(form.category) && !bottleOptions.pvc && (
                  <p style={{ margin: '8px 0 0', fontSize: '12px', color: '#8C8479' }}>
                    Notice: PVC spray flacons are disabled by default for Attars (oil extractions).
                  </p>
                )}
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
                <label htmlFor="pf-name">Product Name *</label>
                <input
                  id="pf-name"
                  type="text"
                  placeholder="e.g. Royal Oud Extrait"
                  value={form.name}
                  onChange={handleNameChange}
                  required
                />
              </div>

              <div className="ps-form-row">
                <div className="ps-form-group">
                  <label htmlFor="pf-category">Category</label>
                  <select
                    id="pf-category"
                    value={form.category_id}
                    onChange={handleCategoryChange}
                    disabled={categoriesStatus !== 'ready'}
                    aria-describedby="pf-category-help"
                  >
                    {categoriesStatus === 'loading' && <option value="">Loading categories…</option>}
                    {categoriesStatus === 'empty' && <option value="">No categories yet</option>}
                    {categoriesStatus === 'error' && <option value="">Categories unavailable</option>}
                    {categoriesStatus === 'ready' && !categories.some((c) => c.id === form.category_id) && (
                      <option value="">— Choose a category —</option>
                    )}
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}{c.is_active === false ? ' (hidden on storefront)' : ''}
                      </option>
                    ))}
                  </select>
                  {categoriesStatus === 'empty' && (
                    <p id="pf-category-help" className="ps-form-hint" role="status" style={{ color: '#9A3412', marginTop: 6 }}>
                      No categories exist in the database yet.{' '}
                      <Link to="/admin/categories">Create them in Admin → Categories</Link> before saving a product.
                    </p>
                  )}
                  {categoriesStatus === 'error' && (
                    <p id="pf-category-help" className="ps-form-hint" role="alert" style={{ color: '#B91C1C', marginTop: 6 }}>
                      Categories could not be loaded: {categoriesError}
                    </p>
                  )}
                </div>

                <div className="ps-form-group">
                  <label htmlFor="pf-sku">Base SKU</label>
                  <input
                    id="pf-sku"
                    type="text"
                    value={form.sku}
                    onChange={(e) => setForm({ ...form, sku: e.target.value })}
                    placeholder="PS-ROYAL-OUD"
                  />
                </div>
              </div>

              <div className="ps-form-group">
                <label htmlFor="pf-short">Short Headline / Subtitle</label>
                <input
                  id="pf-short"
                  type="text"
                  placeholder="Imperial Artisanal Extractions in pure flacons"
                  value={form.short_description}
                  onChange={(e) => setForm({ ...form, short_description: e.target.value })}
                />
              </div>

              <div className="ps-form-group">
                <label htmlFor="pf-desc">Full Editorial Description</label>
                <textarea
                  id="pf-desc"
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
                Upload luxury assets to Supabase Storage (folder <code>products/</code>). Supports WebP, PNG, and JPEG.
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
                          aria-label="Remove image"
                          onClick={() => {
                            setForm((prev) => ({ ...prev, main_image: '', main_image_path: '' }));
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
                          aria-label="Remove image"
                          onClick={() => {
                            setForm((prev) => ({ ...prev, glass_image: '', glass_image_path: '' }));
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
              {bottleOptions.pvc ? (
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
                          aria-label="Remove image"
                            onClick={() => {
                              setForm((prev) => ({ ...prev, pvc_image: '', pvc_image_path: '' }));
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
              ) : (
                <div className="ps-builder-section" style={{ opacity: 0.75 }}>
                  <h3 className="ps-sub-heading">PVC Bottle Flacon Image (Disabled)</h3>
                  <p style={{ fontSize: '12px', color: '#8C8479', margin: 0 }}>
                    PVC Bottle option is not enabled for this product. You can enable it in Variants &amp; Pricing if needed.
                  </p>
                </div>
              )}

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
                        aria-label={`Remove gallery image ${idx + 1}`}
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
                <label htmlFor="pf-slug">URL Slug *</label>
                <input
                  id="pf-slug"
                  type="text"
                  value={form.slug}
                  onChange={(e) => setForm({ ...form, slug: e.target.value })}
                  required
                />
              </div>

              <div className="ps-form-group">
                <label htmlFor="pf-meta-title">Meta Title</label>
                <input
                  id="pf-meta-title"
                  type="text"
                  value={form.meta_title}
                  onChange={(e) => setForm({ ...form, meta_title: e.target.value })}
                  placeholder="PS PERFUMES | Oud Royal Luxury Extrait"
                />
              </div>

              <div className="ps-form-group">
                <label htmlFor="pf-meta-desc">Meta Description</label>
                <textarea
                  id="pf-meta-desc"
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
