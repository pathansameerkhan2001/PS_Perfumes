import React, { useState, useEffect } from 'react';
import {
  Plus,
  Trash2,
  Edit,
  Eye,
  EyeOff,
  Star,
  Upload,
  X,
  Boxes,
  Check,
} from 'lucide-react';
import {
  getCombos,
  createCombo,
  updateCombo,
  deleteCombo,
} from '../../services/combos';
import { getProducts } from '../../services/products';
import { uploadImage } from '../../lib/storage';
import { formatINR } from '../../utils/formatCurrency';
import './AdminCombos.css';

export default function AdminCombos() {
  const [combos, setCombos] = useState([]);
  const [catalogProducts, setCatalogProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isBuilderOpen, setIsBuilderOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Item Picker Modal State
  const [isItemPickerOpen, setIsItemPickerOpen] = useState(false);
  const [pickerProdId, setPickerProdId] = useState('');
  const [pickerBottle, setPickerBottle] = useState('Glass');
  const [pickerSize, setPickerSize] = useState('50 ml');

  // Combo Builder Form State (Screenshot 8)
  const [form, setForm] = useState({
    name: '',
    category: 'Combo',
    description: '',
    image_url: '',
    combo_price: 2499,
    original_price: 3199,
    discount: 22,
    stock: 25,
    bestseller: true,
    featured: false,
    active: true,
    items: [],
  });

  const loadAll = async () => {
    setLoading(true);
    try {
      const [cmbs, prods] = await Promise.all([
        getCombos(),
        getProducts({ allStatuses: true }),
      ]);
      setCombos(cmbs);
      setCatalogProducts(prods);
    } catch {
      console.error('Failed to load combos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const handleOpenAdd = () => {
    setEditingId(null);
    setForm({
      name: '',
      category: 'Combo',
      description: 'A perfect combination of our signature Oud, Musky and Bakhoor fragrances.',
      image_url: '/assets/promo-banner.webp',
      combo_price: 2499,
      original_price: 3199,
      discount: 22,
      stock: 25,
      bestseller: true,
      featured: false,
      active: true,
      items: [
        {
          product_name: 'Oud Royal',
          bottle_type: 'Glass Bottle',
          size_ml: '50 ml',
          image: '/assets/prod-royal-amber.webp',
        },
        {
          product_name: 'Musky Noir',
          bottle_type: 'PVC Bottle',
          size_ml: '50 ml',
          image: '/assets/prod-noir-absolu.webp',
        },
        {
          product_name: 'Bakhoor Classic',
          bottle_type: 'Glass Bottle',
          size_ml: '50 ml',
          image: '/assets/prod-rose-imperiale.webp',
        },
      ],
    });
    setIsBuilderOpen(true);
  };

  const handleOpenEdit = (combo) => {
    setEditingId(combo.id);
    setForm({
      name: combo.name || '',
      category: combo.category || 'Combo',
      description: combo.description || '',
      image_url: combo.image_url || combo.image || '',
      combo_price: combo.combo_price || 0,
      original_price: combo.original_price || 0,
      discount: combo.discount || 0,
      stock: combo.stock !== undefined ? combo.stock : 20,
      bestseller: Boolean(combo.bestseller),
      featured: Boolean(combo.featured),
      active: combo.is_active !== false && combo.active !== false,
      items: Array.isArray(combo.items) ? [...combo.items] : [],
    });
    setIsBuilderOpen(true);
  };

  const handlePriceChange = (field, val) => {
    const num = Math.max(0, parseInt(val, 10) || 0);
    const updated = { ...form, [field]: num };

    if (field === 'combo_price' || field === 'original_price') {
      const orig = field === 'original_price' ? num : updated.original_price;
      const cur = field === 'combo_price' ? num : updated.combo_price;
      if (orig > cur && orig > 0) {
        updated.discount = Math.round(((orig - cur) / orig) * 100);
      }
    }
    setForm(updated);
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const { url, error } = await uploadImage(file, 'combos', form.name ? form.name.toLowerCase().replace(/\s+/g, '-') : 'general');
      if (error) {
        setErrorMsg(`Image upload failed: ${error}`);
      } else if (url) {
        setForm((prev) => ({ ...prev, image_url: url }));
      }
    } catch (err) {
      setErrorMsg(`Image upload error: ${err?.message || 'Storage error'}`);
    }
  };

  const handleAddItemToCombo = () => {
    if (!pickerProdId) return;
    const selectedProd = catalogProducts.find((p) => p.id === pickerProdId);
    if (!selectedProd) return;

    const newItem = {
      product_id: selectedProd.id,
      product_name: selectedProd.name,
      bottle_type: pickerBottle === 'Glass' ? 'Glass Bottle' : 'PVC Bottle',
      size_ml: pickerSize,
      image: selectedProd.main_image || selectedProd.image,
    };

    setForm((prev) => ({
      ...prev,
      items: [...prev.items, newItem],
    }));
    setIsItemPickerOpen(false);
    setPickerProdId('');
  };

  const handleRemoveItem = (index) => {
    setForm((prev) => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index),
    }));
  };

  const handleSaveCombo = async () => {
    if (!form.name.trim()) {
      setErrorMsg('Please specify Combo Name.');
      return;
    }

    setSaving(true);
    setErrorMsg('');
    setSuccessMsg('');

    const payload = {
      ...form,
      combo_price: Number(form.combo_price),
      original_price: Number(form.original_price),
      discount: Number(form.discount),
      is_active: form.active,
      slug: form.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
    };

    try {
      if (editingId) {
        await updateCombo(editingId, payload);
        setSuccessMsg('Combo updated successfully!');
      } else {
        await createCombo(payload);
        setSuccessMsg('Combo created successfully!');
      }
      setTimeout(async () => {
        setIsBuilderOpen(false);
        await loadAll();
      }, 1000);
    } catch {
      setErrorMsg('Failed to save combo in database.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCombo = async (id) => {
    if (window.confirm('Are you sure you want to delete this combo?')) {
      await deleteCombo(id);
      await loadAll();
    }
  };

  const handleToggleActive = async (combo) => {
    await updateCombo(combo.id, { is_active: !combo.is_active });
    await loadAll();
  };

  // ==============================================================
  // VIEW 1: ADD / EDIT COMBO BUILDER (SCREENSHOT 8)
  // ==============================================================
  if (isBuilderOpen) {
    return (
      <div className="ps-admin-combos-page">
        {/* Top Breadcrumb & Actions Bar (Screenshot 8) */}
        <div className="ps-builder-top-bar">
          <div className="ps-builder-breadcrumbs">
            <button
              type="button"
              className="ps-crumb-btn"
              onClick={() => setIsBuilderOpen(false)}
            >
              Combos
            </button>
            <span className="ps-crumb-sep">&gt;</span>
            <span className="ps-crumb-active">
              {editingId ? 'Edit Combo' : 'Add Combo'}
            </span>
          </div>

          <div className="ps-builder-top-actions">
            <button
              type="button"
              className="ps-builder-btn-cancel"
              onClick={() => setIsBuilderOpen(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="ps-builder-btn-save"
              onClick={handleSaveCombo}
              disabled={saving}
            >
              {saving ? 'Saving...' : 'Save Combo'}
            </button>
          </div>
        </div>

        {errorMsg && <div className="ps-form-error-banner">{errorMsg}</div>}
        {successMsg && <div className="ps-form-success-banner">{successMsg}</div>}

        {/* Builder Form Card matching Screenshot 8 */}
        <div className="ps-combo-builder-card">
          <div className="ps-combo-form-row">
            <div className="ps-form-group">
              <label>Combo Name *</label>
              <input
                type="text"
                placeholder="e.g. Premium Oud Collection"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </div>

            <div className="ps-form-group">
              <label>Category *</label>
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              >
                <option value="Combo">Combo</option>
                <option value="Combo Pack">Combo Pack</option>
                <option value="Gift Set">Gift Set</option>
              </select>
            </div>
          </div>

          {/* Description */}
          <div className="ps-form-group">
            <label>Description</label>
            <textarea
              rows={3}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="A perfect combination of our signature Oud, Musky and Bakhoor fragrances."
            />
          </div>

          {/* Combo Image */}
          <div className="ps-form-group">
            <label>Combo Image *</label>
            <div className="ps-combo-image-box">
              {form.image_url ? (
                <div className="ps-combo-img-preview">
                  <img src={form.image_url} alt={form.name} />
                  <button
                    type="button"
                    className="ps-combo-img-remove"
                    onClick={() => setForm({ ...form, image_url: '' })}
                  >
                    <X size={14} />
                  </button>
                </div>
              ) : null}

              <label className="ps-combo-upload-btn">
                <Upload size={18} color="#c8a45d" />
                <span>Upload Image</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  style={{ display: 'none' }}
                />
              </label>
            </div>
          </div>

          {/* Products in Combo (Screenshot 8) */}
          <div className="ps-combo-items-section">
            <h3 className="ps-combo-subheading">Products in Combo *</h3>

            <div className="ps-combo-items-list">
              {form.items.map((item, idx) => (
                <div key={idx} className="ps-combo-item-row">
                  <div className="ps-combo-item-left">
                    <img
                      src={item.image || '/assets/prod-royal-amber.webp'}
                      alt={item.product_name}
                      className="ps-combo-item-thumb"
                    />
                    <span className="ps-combo-item-title">
                      {item.product_name} ({item.size_ml} - {item.bottle_type?.replace(' Bottle', '')})
                    </span>
                  </div>

                  <button
                    type="button"
                    className="ps-combo-item-delete"
                    onClick={() => handleRemoveItem(idx)}
                    aria-label="Remove item"
                  >
                    <X size={16} />
                  </button>
                </div>
              ))}
            </div>

            <button
              type="button"
              className="ps-combo-add-product-btn"
              onClick={() => setIsItemPickerOpen(true)}
            >
              + Add Product
            </button>
          </div>

          {/* Pricing Row (Screenshot 8) */}
          <div className="ps-combo-pricing-grid">
            <div className="ps-form-group">
              <label>Combo Price *</label>
              <input
                type="number"
                value={form.combo_price}
                onChange={(e) => handlePriceChange('combo_price', e.target.value)}
                placeholder="2499"
              />
            </div>

            <div className="ps-form-group">
              <label>Original Price (Optional)</label>
              <input
                type="number"
                value={form.original_price}
                onChange={(e) => handlePriceChange('original_price', e.target.value)}
                placeholder="3199"
              />
            </div>

            <div className="ps-form-group">
              <label>Discount (%)</label>
              <input
                type="number"
                value={form.discount}
                onChange={(e) => setForm({ ...form, discount: parseInt(e.target.value, 10) || 0 })}
                placeholder="22"
              />
            </div>
          </div>

          {/* Toggles (Screenshot 8) */}
          <div className="ps-combo-toggles-row">
            <div className="ps-toggle-row">
              <label className="ps-switch">
                <input
                  type="checkbox"
                  checked={form.bestseller}
                  onChange={(e) => setForm({ ...form, bestseller: e.target.checked })}
                />
                <span className="ps-slider" />
              </label>
              <span className="ps-toggle-label">Mark as Best Seller</span>
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
                  checked={form.featured}
                  onChange={(e) => setForm({ ...form, featured: e.target.checked })}
                />
                <span className="ps-slider" />
              </label>
              <span className="ps-toggle-label">Featured</span>
            </div>
          </div>
        </div>

        {/* Modal: Pick a Product and exact variant to add */}
        {isItemPickerOpen && (
          <div className="ps-admin-modal-overlay" onClick={() => setIsItemPickerOpen(false)}>
            <div className="ps-admin-modal-card" onClick={(e) => e.stopPropagation()}>
              <div className="ps-modal-header">
                <h3>Select Product & Variant</h3>
                <button
                  type="button"
                  className="ps-modal-close"
                  onClick={() => setIsItemPickerOpen(false)}
                >
                  <X size={18} />
                </button>
              </div>

              <div className="ps-form-group">
                <label>Select Formulation</label>
                <select
                  value={pickerProdId}
                  onChange={(e) => setPickerProdId(e.target.value)}
                >
                  <option value="">-- Choose Formulation --</option>
                  {catalogProducts.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.category})
                    </option>
                  ))}
                </select>
              </div>

              <div className="ps-form-row">
                <div className="ps-form-group">
                  <label>Bottle Type</label>
                  <select
                    value={pickerBottle}
                    onChange={(e) => setPickerBottle(e.target.value)}
                  >
                    <option value="Glass">Glass Bottle</option>
                    <option value="PVC">PVC Bottle</option>
                  </select>
                </div>

                <div className="ps-form-group">
                  <label>Size</label>
                  <select
                    value={pickerSize}
                    onChange={(e) => setPickerSize(e.target.value)}
                  >
                    <option value="30 ml">30 ml</option>
                    <option value="50 ml">50 ml</option>
                    <option value="100 ml">100 ml</option>
                  </select>
                </div>
              </div>

              <div className="ps-modal-actions">
                <button
                  type="button"
                  className="ps-builder-btn-cancel"
                  onClick={() => setIsItemPickerOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="ps-builder-btn-save"
                  onClick={handleAddItemToCombo}
                  disabled={!pickerProdId}
                >
                  Add to Combo
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ==============================================================
  // VIEW 2: COMBOS LIST OVERVIEW
  // ==============================================================
  return (
    <div className="ps-admin-combos-page">
      <div className="ps-admin-page-header">
        <div>
          <span className="ps-admin-eyebrow">CURATED PACKS & BUNDLES</span>
          <h1 className="ps-admin-page-title">Combos Management</h1>
        </div>

        <button
          type="button"
          className="ps-btn-gold-primary ps-admin-header-btn"
          onClick={handleOpenAdd}
        >
          <Plus size={16} />
          <span>ADD COMBO</span>
        </button>
      </div>

      <div className="ps-admin-table-card">
        <div className="ps-admin-table-wrap">
          <table className="ps-admin-table">
            <thead>
              <tr>
                <th>Combo</th>
                <th>Category</th>
                <th>Price</th>
                <th>Original</th>
                <th>Items</th>
                <th>Bestseller</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {combos.map((c) => (
                <tr key={c.id}>
                  <td>
                    <div className="ps-combo-td-cell">
                      <img
                        src={c.image_url || c.image || '/assets/promo-banner.webp'}
                        alt={c.name}
                        className="ps-combo-thumb"
                      />
                      <strong>{c.name}</strong>
                    </div>
                  </td>
                  <td>{c.category || 'Combo'}</td>
                  <td>
                    <strong className="ps-cell-gold">{formatINR(c.combo_price)}</strong>
                  </td>
                  <td>
                    <span className="ps-cell-muted">
                      {c.original_price ? formatINR(c.original_price) : '—'}
                    </span>
                  </td>
                  <td>{c.items ? `${c.items.length} products` : '3 products'}</td>
                  <td>
                    {c.bestseller ? (
                      <span className="ps-status-pill ps-status-confirmed">Yes</span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>
                    <span
                      className={`ps-status-pill ${
                        c.is_active !== false ? 'ps-status-confirmed' : 'ps-status-cancelled'
                      }`}
                    >
                      {c.is_active !== false ? 'Active' : 'Disabled'}
                    </span>
                  </td>
                  <td>
                    <div className="ps-table-actions">
                      <button
                        type="button"
                        className="ps-action-icon-btn"
                        onClick={() => handleOpenEdit(c)}
                        title="Edit Combo"
                      >
                        <Edit size={16} />
                      </button>
                      <button
                        type="button"
                        className="ps-action-icon-btn"
                        onClick={() => handleToggleActive(c)}
                        title={c.is_active !== false ? 'Disable' : 'Enable'}
                      >
                        {c.is_active !== false ? <Eye size={16} /> : <EyeOff size={16} />}
                      </button>
                      <button
                        type="button"
                        className="ps-action-icon-btn is-delete"
                        onClick={() => handleDeleteCombo(c.id)}
                        title="Delete Combo"
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
    </div>
  );
}
