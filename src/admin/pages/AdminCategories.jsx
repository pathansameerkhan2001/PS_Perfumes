import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Upload, Check } from 'lucide-react';
import { getCategories, createCategory, updateCategory, deleteCategory, buildCategoryTree } from '../../services/categories';
import { uploadImage, cardImageUrl, fullImageFallback } from '../../lib/storage';

/*
 * Categories: main categories and their subcategories (Migration 12, categories.parent_id).
 * Before Migration 12 there is no parent column: every category is a main category and the
 * parent picker is hidden. The database keeps two levels (a subcategory cannot hold
 * subcategories) and refuses to delete a category that still has products or subcategories.
 */
export default function AdminCategories() {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingCat, setEditingCat] = useState(null);
  const [isFormOpen, setIsFormOpen] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    description: '',
    image_url: '',
    display_order: 1,
    is_active: true,
    parent_id: '',
  });

  // Main categories (in order), each followed by its subcategories; rows whose main category
  // is missing are listed last so nothing disappears from the admin
  const { hasTree, mains } = buildCategoryTree(categories);
  const listed = new Set();
  const rows = [];
  mains.forEach((m) => {
    rows.push({ cat: m, level: 0 });
    listed.add(m.id);
    m.children.forEach((c) => {
      rows.push({ cat: c, level: 1, parentName: m.name });
      listed.add(c.id);
    });
  });
  categories.filter((c) => !listed.has(c.id)).forEach((c) => rows.push({ cat: c, level: 1, parentName: '—' }));
  // A main category with subcategories must stay a main category (database trigger)
  const editingHasChildren = Boolean(editingCat && categories.some((c) => c.parent_id === editingCat.id));
  const parentOptions = mains.filter((m) => m.id !== editingCat?.id);

  const [notice, setNotice] = useState(null); // { type: 'success' | 'error', text }
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [formError, setFormError] = useState('');

  const loadData = async () => {
    setLoading(true);
    try {
      setCategories(await getCategories(true));
    } catch (err) {
      setNotice({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleEdit = (cat) => {
    setEditingCat(cat);
    setFormData({
      name: cat.name,
      slug: cat.slug,
      description: cat.description || '',
      image_url: cat.image_url || '',
      image_path: cat.image_path || '',
      display_order: cat.display_order || 1,
      is_active: cat.is_active,
      parent_id: cat.parent_id || '',
    });
    openForm();
  };

  const handleNew = () => {
    setEditingCat(null);
    setFormData({
      name: '',
      slug: '',
      description: '',
      image_url: '',
      image_path: '',
      display_order: categories.length + 1,
      is_active: true,
      parent_id: '',
    });
    openForm();
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (saving) return;
    setFormError('');
    const slug = String(formData.slug || '').trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/(^-|-$)/g, '');
    if (!String(formData.name || '').trim() || !slug) {
      setFormError('Enter a category name and a slug made of letters, numbers or hyphens.');
      return;
    }
    const order = Number(formData.display_order);
    if (!Number.isInteger(order) || order < 1) {
      setFormError('Display order must be a whole number of 1 or more.');
      return;
    }
    if (uploading) {
      setFormError('Wait for the image upload to finish.');
      return;
    }
    setSaving(true);
    setNotice(null);
    try {
      const { parent_id: parentId, ...fields } = formData;
      const payload = { ...fields, name: formData.name.trim(), slug, display_order: order };
      // The parent is only sent when the database has the column (after Migration 12)
      if (hasTree) payload.parent_id = parentId || null;
      if (editingCat) {
        await updateCategory(editingCat.id, payload);
      } else {
        await createCategory(payload);
      }
      setIsFormOpen(false);
      setNotice({ type: 'success', text: `Category "${payload.name}" saved.` });
      loadData();
    } catch (err) {
      // Shown inside the modal, which stays open so nothing typed is lost
      setFormError(`Category was not saved: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  // One click: show or hide a category on the storefront (hiding a main category also hides its
  // subcategories there)
  const [togglingId, setTogglingId] = useState(null);
  const handleToggleActive = async (cat) => {
    setTogglingId(cat.id);
    setNotice(null);
    try {
      await updateCategory(cat.id, { is_active: !cat.is_active });
      setNotice({ type: 'success', text: `"${cat.name}" is now ${cat.is_active ? 'hidden from' : 'shown on'} the storefront.` });
      await loadData();
    } catch (err) {
      setNotice({ type: 'error', text: `Status not changed: ${err.message}` });
    } finally {
      setTogglingId(null);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this fragrance category?')) return;
    setNotice(null);
    const res = await deleteCategory(id);
    if (res && res.success === false) {
      setNotice({ type: 'error', text: res.error || 'Category was not deleted.' });
    } else {
      setNotice({ type: 'success', text: 'Category deleted.' });
    }
    loadData();
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // choosing the same file again must trigger a new upload
    if (!file) return;
    setFormError('');
    setUploading(true);
    try {
      const { url, path, error } = await uploadImage(file, 'categories', formData.slug || 'cat');
      if (error || !url) {
        setFormError(`Category image was not uploaded: ${error || 'Storage did not return the uploaded file.'}`);
      } else {
        setFormData((prev) => ({ ...prev, image_url: url, image_path: path }));
      }
    } catch (err) {
      setFormError(`Category image was not uploaded: ${err?.message || 'Storage error'}`);
    } finally {
      setUploading(false);
    }
  };

  const openForm = () => {
    setFormError('');
    setIsFormOpen(true);
  };

  return (
    <div className="ps-admin-categories-page">
      <div className="ps-admin-page-header">
        <div>
          <span className="ps-admin-eyebrow">CATEGORY HIERARCHY</span>
          <h1 className="ps-admin-page-title">Categories &amp; Subcategories</h1>
        </div>
        <button
          type="button"
          className="ps-btn-gold-primary ps-admin-header-btn"
          onClick={handleNew}
        >
          <Plus size={16} />
          <span>+ ADD CATEGORY</span>
        </button>
      </div>

      {notice && (
        <div className={notice.type === 'error' ? 'ps-form-error-banner' : 'ps-form-success-banner'} role="status">
          {notice.text}
        </div>
      )}

      {loading ? (
        <div className="ps-admin-loading">Loading Categories...</div>
      ) : (
        <div className="ps-admin-table-container">
          <table className="ps-admin-products-table">
            <thead>
              <tr>
                <th>Thumb</th>
                <th>Category Name</th>
                {hasTree && <th>Main Category</th>}
                <th>Slug</th>
                <th>Order</th>
                <th>Active</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ cat, level, parentName }) => (
                <tr key={cat.id}>
                  <td>
                    {cat.image_url ? (
                      <img src={cardImageUrl(cat.image_url)} loading="lazy" decoding="async" onError={fullImageFallback(cat.image_url)} alt={cat.name} className="ps-prod-table-thumb" />
                    ) : (
                      <div className="ps-prod-table-thumb" style={{ background: 'var(--lux-champagne)' }} />
                    )}
                  </td>
                  <td style={level ? { paddingLeft: 28 } : undefined}>
                    {level ? <span style={{ color: 'var(--lux-gold)', marginRight: 6 }}>↳</span> : null}
                    <strong>{cat.name}</strong>
                    <div style={{ fontSize: 11, color: 'var(--color-muted)' }}>{cat.description}</div>
                  </td>
                  {hasTree && <td>{level ? parentName : <em style={{ color: 'var(--color-muted)' }}>Main category</em>}</td>}
                  <td>
                    <code style={{ color: 'var(--color-champagne)' }}>{cat.slug}</code>
                  </td>
                  <td>{cat.display_order}</td>
                  <td>
                    <button
                      type="button"
                      className={`ps-status-pill ${cat.is_active ? 'ps-status-delivered' : 'ps-status-cancelled'}`}
                      onClick={() => handleToggleActive(cat)}
                      disabled={togglingId === cat.id}
                      title={cat.is_active ? 'Click to hide from the storefront' : 'Click to show on the storefront'}
                      aria-label={`${cat.is_active ? 'Deactivate' : 'Activate'} ${cat.name}`}
                      style={{ border: 0, cursor: 'pointer' }}
                    >
                      {togglingId === cat.id ? 'Saving…' : cat.is_active ? 'Active' : 'Disabled'}
                    </button>
                  </td>
                  <td>
                    <div className="ps-table-actions">
                      <button
                        type="button"
                        className="ps-action-icon-btn"
                        onClick={() => handleEdit(cat)}
                        title="Edit Category"
                      >
                        <Edit2 size={15} />
                      </button>
                      <button
                        type="button"
                        className="ps-action-icon-btn is-delete"
                        onClick={() => handleDelete(cat.id)}
                        title="Delete Category"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {categories.length === 0 && (
                <tr>
                  <td colSpan={hasTree ? 7 : 6} style={{ textAlign: 'center', padding: 28, color: 'var(--color-muted)' }}>
                    No categories yet. Click “+ ADD CATEGORY” to create one.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Category Edit/Create Modal */}
      {isFormOpen && (
        <div className="ps-admin-modal-overlay">
          <div className="ps-admin-modal-card" style={{ maxWidth: 520, textAlign: 'left' }}>
            <h2 className="ps-card-title" style={{ marginBottom: 16 }}>
              {editingCat ? `Edit Category: ${editingCat.name}` : 'Add New Category'}
            </h2>

            {formError && (
              <div className="ps-form-error-banner" role="alert" style={{ marginBottom: 12 }}>
                {formError}
              </div>
            )}

            <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="ps-form-group">
                <label>Category Name *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => {
                    const name = e.target.value;
                    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
                    setFormData({ ...formData, name, slug: editingCat ? formData.slug : slug });
                  }}
                  required
                />
              </div>

              {hasTree && (
                <div className="ps-form-group">
                  <label htmlFor="ps-cat-parent">Main Category</label>
                  <select
                    id="ps-cat-parent"
                    value={formData.parent_id}
                    onChange={(e) => setFormData({ ...formData, parent_id: e.target.value })}
                    disabled={editingHasChildren}
                  >
                    <option value="">None — this is a main category</option>
                    {parentOptions.map((m) => (
                      <option key={m.id} value={m.id}>
                        Subcategory of {m.name}
                      </option>
                    ))}
                  </select>
                  {editingHasChildren && (
                    <small style={{ color: 'var(--color-muted)' }}>
                      This category has subcategories, so it stays a main category.
                    </small>
                  )}
                </div>
              )}

              <div className="ps-form-group">
                <label>Slug Identifier *</label>
                <input
                  type="text"
                  value={formData.slug}
                  onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                  required
                />
              </div>

              <div className="ps-form-group">
                <label>Description Hook</label>
                <textarea
                  rows="2"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                />
              </div>

              <div className="ps-form-group">
                <label>Category Image (Storage folder: categories/)</label>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  {formData.image_url && (
                    <img src={formData.image_url} alt="Preview" style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 4 }} />
                  )}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handleImageUpload}
                    disabled={uploading || saving}
                  />
                </div>
                {uploading && <small style={{ color: '#8C7343' }}>Uploading image…</small>}
              </div>

              <div className="ps-form-row">
                <div className="ps-form-group">
                  <label>Display Order</label>
                  <input
                    type="number"
                    value={formData.display_order}
                    min="1"
                    step="1"
                    onChange={(e) => setFormData({ ...formData, display_order: e.target.value })}
                  />
                </div>
                <div className="ps-form-group" style={{ justifyContent: 'center' }}>
                  <label className="ps-checkbox-label">
                    <input
                      type="checkbox"
                      checked={formData.is_active}
                      onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                    />
                    <span>Active Listing</span>
                  </label>
                </div>
              </div>

              <div className="ps-modal-actions" style={{ marginTop: 12 }}>
                <button type="button" className="ps-btn-cancel" onClick={() => setIsFormOpen(false)} disabled={saving}>
                  Cancel
                </button>
                <button type="submit" className="ps-btn-gold-primary" style={{ padding: '10px 18px' }} disabled={saving || uploading}>
                  {saving ? 'Saving…' : 'Save Category'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
