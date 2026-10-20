import React, { useState, useEffect } from 'react';
import {
  Plus,
  Trash2,
  Edit,
  Eye,
  EyeOff,
  Upload,
  X,
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

const EMPTY_FORM = {
  name: '',
  description: '',
  image_url: '',
  image_path: '',
  combo_price: '',
  original_price: '',
  stock: 0,
  featured: false,
  active: true,
  items: [],
};

export default function AdminCombos() {
  const [combos, setCombos] = useState([]);
  const [catalogProducts, setCatalogProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isBuilderOpen, setIsBuilderOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Item Picker Modal State
  const [isItemPickerOpen, setIsItemPickerOpen] = useState(false);
  const [pickerProdId, setPickerProdId] = useState('');
  const [pickerQty, setPickerQty] = useState(1);

  const [form, setForm] = useState(EMPTY_FORM);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [cmbs, prods] = await Promise.all([
        getCombos({ activeOnly: false }),
        getProducts({ allStatuses: true, throwOnError: true }),
      ]);
      setCombos(cmbs);
      setCatalogProducts(prods);
    } catch (err) {
      setErrorMsg(err.message || 'Failed to load combos.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const handleOpenAdd = () => {
    setEditingId(null);
    setErrorMsg('');
    setSuccessMsg('');
    setForm({ ...EMPTY_FORM, items: [] });
    setIsBuilderOpen(true);
  };

  const handleOpenEdit = (combo) => {
    setEditingId(combo.id);
    setErrorMsg('');
    setSuccessMsg('');
    setForm({
      name: combo.name || '',
      description: combo.description || '',
      image_url: combo.image_url || '',
      image_path: combo.image_path || '',
      combo_price: combo.combo_price || '',
      original_price: combo.original_price || '',
      stock: combo.stock ?? 0,
      featured: Boolean(combo.featured),
      active: combo.is_active !== false,
      items: Array.isArray(combo.items) ? combo.items.map((it) => ({ ...it })) : [],
    });
    setIsBuilderOpen(true);
  };

  const comboPriceNum = Number(form.combo_price) || 0;
  const originalPriceNum = Number(form.original_price) || 0;
  const discountPct =
    originalPriceNum > comboPriceNum && comboPriceNum > 0
      ? Math.round(((originalPriceNum - comboPriceNum) / originalPriceNum) * 100)
      : 0;

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setErrorMsg('');
    setUploading(true);
    try {
      const slug = form.name ? form.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') : 'combo';
      const { url, path, error } = await uploadImage(file, 'combos', slug);
      if (error || !url) {
        setErrorMsg(`Image upload failed: ${error || 'Storage did not return the uploaded file.'}`);
      } else {
        setForm((prev) => ({ ...prev, image_url: url, image_path: path }));
        setSuccessMsg('Image uploaded to Storage. Click "Save Combo" to attach it.');
        setTimeout(() => setSuccessMsg(''), 4000);
      }
    } catch (err) {
      setErrorMsg(`Image upload error: ${err?.message || 'Storage error'}`);
    } finally {
      setUploading(false);
    }
  };

  const handleAddItemToCombo = () => {
    if (!pickerProdId) return;
    const selectedProd = catalogProducts.find((p) => p.id === pickerProdId);
    if (!selectedProd) return;
    // A combo containing an inactive product cannot be bought
    if (selectedProd.is_active === false) {
      setErrorMsg(`"${selectedProd.name}" is inactive. Activate it under Products before adding it to a combo.`);
      return;
    }

    setForm((prev) => {
      const existing = prev.items.findIndex((it) => it.product_id === selectedProd.id);
      const qty = Math.max(1, Number(pickerQty) || 1);
      if (existing > -1) {
        const items = prev.items.map((it, i) =>
          i === existing ? { ...it, quantity: (Number(it.quantity) || 1) + qty } : it
        );
        return { ...prev, items };
      }
      return {
        ...prev,
        items: [
          ...prev.items,
          {
            product_id: selectedProd.id,
            product_name: selectedProd.name,
            image: selectedProd.stored_images?.main || selectedProd.main_image || '',
            quantity: qty,
          },
        ],
      };
    });
    setIsItemPickerOpen(false);
    setPickerProdId('');
    setPickerQty(1);
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
    if (uploading) {
      setErrorMsg('Please wait for the image upload to finish.');
      return;
    }
    // Every product in the combo must exist and be active, or the combo cannot be bought
    const blocked = form.items.filter((it) => {
      const p = catalogProducts.find((cp) => cp.id === it.product_id);
      return !p || p.is_active === false;
    });
    if (blocked.length > 0) {
      setErrorMsg(
        `This combo contains unavailable products: ${blocked
          .map((it) => it.product_name || 'a deleted product')
          .join(', ')}. Remove them, or activate them under Products, before saving.`
      );
      return;
    }

    setSaving(true);
    setErrorMsg('');
    setSuccessMsg('');

    const payload = {
      name: form.name,
      slug: form.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
      description: form.description,
      image_url: form.image_url,
      image_path: form.image_path,
      combo_price: comboPriceNum,
      original_price: originalPriceNum,
      stock: Number(form.stock) || 0,
      featured: form.featured,
      is_active: form.active,
      items: form.items,
    };

    try {
      if (editingId) {
        await updateCombo(editingId, payload);
      } else {
        await createCombo(payload);
      }
      setIsBuilderOpen(false);
      setSuccessMsg(editingId ? `Combo "${form.name}" updated.` : `Combo "${form.name}" created.`);
      await loadAll();
    } catch (err) {
      setErrorMsg(`Failed to save combo: ${err.message || 'Database error'}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCombo = async (combo) => {
    if (!window.confirm(`Delete combo "${combo.name}"? This cannot be undone.`)) return;
    setBusyId(combo.id);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      await deleteCombo(combo.id);
      setSuccessMsg(`Combo "${combo.name}" deleted.`);
    } catch (err) {
      setErrorMsg(`Delete failed: ${err.message}`);
    } finally {
      setBusyId(null);
      await loadAll();
    }
  };

  const handleToggleActive = async (combo) => {
    setBusyId(combo.id);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      await updateCombo(combo.id, { is_active: !combo.is_active });
      setSuccessMsg(`Combo "${combo.name}" ${combo.is_active ? 'disabled' : 'enabled'}.`);
    } catch (err) {
      setErrorMsg(`Status change failed: ${err.message}`);
    } finally {
      setBusyId(null);
      await loadAll();
    }
  };

  // ==============================================================
  // VIEW 1: ADD / EDIT COMBO BUILDER
  // ==============================================================
  if (isBuilderOpen) {
    return (
      <div className="ps-admin-combos-page">
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
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="button"
              className="ps-builder-btn-save"
              onClick={handleSaveCombo}
              disabled={saving || uploading}
            >
              {saving ? 'Saving...' : uploading ? 'Uploading...' : 'Save Combo'}
            </button>
          </div>
        </div>

        {errorMsg && <div className="ps-form-error-banner">{errorMsg}</div>}
        {successMsg && <div className="ps-form-success-banner">{successMsg}</div>}

        <div className="ps-combo-builder-card">
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
            <label>Description</label>
            <textarea
              rows={3}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Describe what makes this set special."
            />
          </div>

          <div className="ps-form-group">
            <label>Combo Image *</label>
            <div className="ps-combo-image-box">
              {form.image_url ? (
                <div className="ps-combo-img-preview">
                  <img src={form.image_url} alt={form.name} />
                  <button
                    type="button"
                    className="ps-combo-img-remove"
                    onClick={() => setForm({ ...form, image_url: '', image_path: '' })}
                  >
                    <X size={14} />
                  </button>
                </div>
              ) : null}

              <label className="ps-combo-upload-btn">
                <Upload size={18} color="#c8a45d" />
                <span>{uploading ? 'Uploading…' : 'Upload Image'}</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleImageUpload}
                  disabled={uploading}
                  style={{ display: 'none' }}
                />
              </label>
            </div>
          </div>

          <div className="ps-combo-items-section">
            <h3 className="ps-combo-subheading">Products in Combo *</h3>

            <div className="ps-combo-items-list">
              {form.items.length === 0 && (
                <p className="ps-cell-muted" style={{ margin: '4px 0 8px' }}>No products added yet.</p>
              )}
              {form.items.map((item, idx) => {
                // Deleted or deactivated products block saving; mark them so they can be removed
                const catalogItem = catalogProducts.find((cp) => cp.id === item.product_id);
                const problem = !catalogItem ? 'deleted product' : catalogItem.is_active === false ? 'inactive' : '';
                return (
                <div key={`${item.product_id}-${idx}`} className="ps-combo-item-row">
                  <div className="ps-combo-item-left">
                    {item.image ? (
                      <img src={item.image} alt={item.product_name} className="ps-combo-item-thumb" />
                    ) : null}
                    <span className="ps-combo-item-title">
                      {item.product_name} × {item.quantity || 1}
                    </span>
                    {problem && (
                      <span className="ps-status-pill ps-status-cancelled" title="Remove this product, or activate it under Products, before saving">
                        {problem === 'inactive' ? 'Inactive — cannot be sold' : 'Deleted product'}
                      </span>
                    )}
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
                );
              })}
            </div>

            <button
              type="button"
              className="ps-combo-add-product-btn"
              onClick={() => setIsItemPickerOpen(true)}
            >
              + Add Product
            </button>
          </div>

          <div className="ps-combo-pricing-grid">
            <div className="ps-form-group">
              <label>Combo Price (₹) *</label>
              <input
                type="number"
                min="0"
                value={form.combo_price}
                onChange={(e) => setForm({ ...form, combo_price: e.target.value })}
              />
            </div>

            <div className="ps-form-group">
              <label>Original Price (₹, optional)</label>
              <input
                type="number"
                min="0"
                value={form.original_price}
                onChange={(e) => setForm({ ...form, original_price: e.target.value })}
              />
            </div>

            <div className="ps-form-group">
              <label>Stock</label>
              <input
                type="number"
                min="0"
                value={form.stock}
                onChange={(e) => setForm({ ...form, stock: e.target.value })}
              />
            </div>
          </div>
          <p className="ps-cell-muted" style={{ marginTop: -4 }}>
            {discountPct > 0 ? `Shown to customers as ${discountPct}% off.` : 'No discount shown (original price not higher than combo price).'}
          </p>

          <div className="ps-combo-toggles-row">
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

        {isItemPickerOpen && (
          <div className="ps-admin-modal-overlay" onClick={() => setIsItemPickerOpen(false)}>
            <div className="ps-admin-modal-card" onClick={(e) => e.stopPropagation()}>
              <div className="ps-modal-header">
                <h3>Add Product to Combo</h3>
                <button
                  type="button"
                  className="ps-modal-close"
                  onClick={() => setIsItemPickerOpen(false)}
                >
                  <X size={18} />
                </button>
              </div>

              <div className="ps-form-group">
                <label>Product</label>
                <select
                  value={pickerProdId}
                  onChange={(e) => setPickerProdId(e.target.value)}
                >
                  <option value="">-- Choose Product --</option>
                  {catalogProducts.map((p) => (
                    <option key={p.id} value={p.id} disabled={p.is_active === false}>
                      {p.name} ({p.category}){p.is_active === false ? ' — inactive (cannot be added)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="ps-form-group">
                <label>Quantity</label>
                <input
                  type="number"
                  min="1"
                  value={pickerQty}
                  onChange={(e) => setPickerQty(e.target.value)}
                />
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

      {errorMsg && <div className="ps-form-error-banner">{errorMsg}</div>}
      {successMsg && <div className="ps-form-success-banner">{successMsg}</div>}

      {loading ? (
        <div className="ps-admin-loading">Loading combos...</div>
      ) : combos.length === 0 ? (
        <div className="ps-admin-table-card" style={{ padding: 24 }}>
          <p className="ps-cell-muted">No combos in the database yet. Use “Add Combo” to create one.</p>
        </div>
      ) : (
        <div className="ps-admin-table-card">
          <div className="ps-admin-table-wrap">
            <table className="ps-admin-table">
              <thead>
                <tr>
                  <th>Combo</th>
                  <th>Price</th>
                  <th>Original</th>
                  <th>Items</th>
                  <th>Stock</th>
                  <th>Featured</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {combos.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <div className="ps-combo-td-cell">
                        {c.image_url ? <img src={c.image_url} alt={c.name} className="ps-combo-thumb" /> : null}
                        <strong>{c.name}</strong>
                      </div>
                    </td>
                    <td>
                      <strong className="ps-cell-gold">{formatINR(c.combo_price)}</strong>
                    </td>
                    <td>
                      <span className="ps-cell-muted">
                        {c.original_price ? formatINR(c.original_price) : '—'}
                      </span>
                    </td>
                    <td>{`${c.items.length} product${c.items.length === 1 ? '' : 's'}`}</td>
                    <td>
                      {c.stock_quantity > 0 ? (
                        c.stock_quantity
                      ) : (
                        <span className="ps-status-pill ps-status-cancelled">Out of stock</span>
                      )}
                    </td>
                    <td>
                      {c.featured ? <span className="ps-status-pill ps-status-confirmed">Yes</span> : '—'}
                    </td>
                    <td>
                      <span
                        className={`ps-status-pill ${
                          c.is_active !== false ? 'ps-status-confirmed' : 'ps-status-cancelled'
                        }`}
                      >
                        {c.is_active !== false ? 'Active' : 'Disabled'}
                      </span>
                      {/* Active but cannot be bought (out of stock, unavailable products, no price) */}
                      {c.is_active !== false && c.is_purchasable === false && (
                        <span
                          className="ps-status-pill ps-status-cancelled"
                          title={c.unavailable_message}
                          style={{ display: 'block', marginTop: 4, whiteSpace: 'normal', maxWidth: 220 }}
                        >
                          Not purchasable: {c.unavailable_message}
                        </span>
                      )}
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
                          disabled={busyId === c.id}
                          title={c.is_active !== false ? 'Disable' : 'Enable'}
                        >
                          {c.is_active !== false ? <Eye size={16} /> : <EyeOff size={16} />}
                        </button>
                        <button
                          type="button"
                          className="ps-action-icon-btn is-delete"
                          onClick={() => handleDeleteCombo(c)}
                          disabled={busyId === c.id}
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
      )}
    </div>
  );
}
