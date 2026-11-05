import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, FolderPlus, CornerDownRight, Wand2 } from 'lucide-react';
import {
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  categoryHierarchyAvailable,
  slugifyCategory,
} from '../../services/categories';
import { uploadImage, cardImageUrl, fullImageFallback } from '../../lib/storage';

/*
 * Categories: main categories and their subcategories (Migration 12, categories.parent_id).
 * - "Add Main Category" and "Add Subcategory" (header), or "+ Sub" on a main category's row.
 * - The table lists each main category followed by its subcategories (indented).
 * - Names must be unique within the same main category, slugs across all categories (the
 *   database also enforces slugs). A slug held by an existing, possibly disabled, category is
 *   reported with a shortcut to edit that category instead of creating a duplicate.
 * Before Migration 12 there is no parent column: every category is a main category and adding a
 * subcategory explains why it is unavailable. The database keeps two levels (a subcategory
 * cannot hold subcategories) and refuses to delete a category that still has products or
 * subcategories.
 */

const EMPTY_FORM = {
  name: '',
  slug: '',
  description: '',
  image_url: '',
  image_path: '',
  display_order: 1,
  is_active: true,
  parent_id: '',
};

const byOrder = (a, b) =>
  (Number(a.display_order) || 0) - (Number(b.display_order) || 0) || String(a.name || '').localeCompare(String(b.name || ''));

export default function AdminCategories() {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  // null while checking; false before Migration 12 (no categories.parent_id)
  const [hierarchy, setHierarchy] = useState(null);
  const [editingCat, setEditingCat] = useState(null);
  // 'main' | 'sub': what "Add" creates (an edit keeps the category's own level unless changed)
  const [formMode, setFormMode] = useState('main');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formData, setFormData] = useState(EMPTY_FORM);
  // The slug follows the name until the admin types a slug of their own
  const [slugTouched, setSlugTouched] = useState(false);

  const [notice, setNotice] = useState(null); // { type: 'success' | 'error', text }
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  // { text, conflict? } — conflict: an existing category that already holds the slug
  const [formError, setFormError] = useState(null);

  // Main categories (in order), each followed by its subcategories; rows whose main category is
  // missing are listed last so nothing disappears from the admin
  const mains = categories.filter((c) => !c.parent_id).sort(byOrder);
  const childrenOf = (id) => categories.filter((c) => c.parent_id === id).sort(byOrder);
  const nameById = new Map(categories.map((c) => [c.id, c.name]));
  const listed = new Set();
  const rows = [];
  mains.forEach((m) => {
    const kids = childrenOf(m.id);
    rows.push({ cat: m, level: 0, childCount: kids.length });
    listed.add(m.id);
    kids.forEach((c) => {
      rows.push({ cat: c, level: 1, parent: m });
      listed.add(c.id);
    });
  });
  categories
    .filter((c) => !listed.has(c.id))
    .sort(byOrder)
    .forEach((c) => rows.push({ cat: c, level: 1, parent: null, orphan: true }));

  const canNest = hierarchy !== false;
  // A main category with subcategories must stay a main category (database trigger)
  const editingHasChildren = Boolean(editingCat && categories.some((c) => c.parent_id === editingCat.id));
  const parentOptions = mains.filter((m) => m.id !== editingCat?.id);
  const isSubForm = formMode === 'sub' || Boolean(formData.parent_id);

  const loadData = async () => {
    setLoading(true);
    try {
      const [list, nested] = await Promise.all([getCategories(true), categoryHierarchyAvailable()]);
      setCategories(list);
      setHierarchy(nested);
    } catch (err) {
      setNotice({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const openForm = () => {
    setFormError(null);
    setIsFormOpen(true);
  };

  const handleEdit = (cat) => {
    setEditingCat(cat);
    setFormMode(cat.parent_id ? 'sub' : 'main');
    setSlugTouched(true);
    setFormData({
      name: cat.name,
      slug: cat.slug,
      description: cat.description || '',
      image_url: cat.image_url || '',
      image_path: cat.image_path || '',
      display_order: cat.display_order || 1,
      is_active: cat.is_active !== false,
      parent_id: cat.parent_id || '',
    });
    openForm();
  };

  const handleNewMain = () => {
    setEditingCat(null);
    setFormMode('main');
    setSlugTouched(false);
    setFormData({ ...EMPTY_FORM, display_order: mains.length + 1 });
    openForm();
  };

  const handleNewSub = (parent) => {
    if (!canNest) {
      setNotice({
        type: 'error',
        text: 'Subcategories need the categories.parent_id column (database step 12), which this database does not have yet.',
      });
      return;
    }
    if (mains.length === 0) {
      setNotice({ type: 'error', text: 'Add a main category first, then add subcategories to it.' });
      return;
    }
    setEditingCat(null);
    setFormMode('sub');
    setSlugTouched(false);
    const parentId = parent?.id || '';
    setFormData({ ...EMPTY_FORM, parent_id: parentId, display_order: parentId ? childrenOf(parentId).length + 1 : 1 });
    openForm();
  };

  const handleNameChange = (name) => {
    setFormData((prev) => ({ ...prev, name, slug: slugTouched ? prev.slug : slugifyCategory(name) }));
  };

  const handleParentChange = (parentId) => {
    setFormData((prev) => ({
      ...prev,
      parent_id: parentId,
      // A new subcategory goes to the end of its main category's list
      display_order: !editingCat && parentId ? childrenOf(parentId).length + 1 : prev.display_order,
    }));
  };

  /** Problem with the form, or null. Mirrors the database rules so the admin sees them first. */
  const validate = (data, slug) => {
    const name = String(data.name || '').trim();
    if (!name) return { text: 'Enter a category name.' };
    if (!slug) return { text: 'Enter a slug made of letters, numbers or hyphens.' };
    // Adding a subcategory needs its main category (an edit may turn a subcategory into a main one)
    if (formMode === 'sub' && !editingCat && !data.parent_id) {
      return { text: 'Choose the main category this subcategory belongs to.' };
    }
    if (data.parent_id && !mains.some((m) => m.id === data.parent_id)) {
      return { text: 'The chosen main category is not a main category. Choose another one.' };
    }
    const order = Number(data.display_order);
    if (!Number.isInteger(order) || order < 1) return { text: 'Display order must be a whole number of 1 or more.' };

    const others = categories.filter((c) => c.id !== editingCat?.id);
    const slugOwner = others.find((c) => String(c.slug || '').toLowerCase() === slug);
    if (slugOwner) {
      const where = slugOwner.parent_id
        ? `a subcategory of ${nameById.get(slugOwner.parent_id) || 'another category'}`
        : 'a main category';
      return {
        text: `The slug "${slug}" is already used by "${slugOwner.name}" (${where}${slugOwner.is_active === false ? ', disabled' : ''}). Slugs must be unique: choose another slug, or edit that category instead.`,
        conflict: slugOwner,
      };
    }
    const parentId = data.parent_id || null;
    const twin = others.find(
      (c) => (c.parent_id || null) === parentId && String(c.name || '').trim().toLowerCase() === name.toLowerCase()
    );
    if (twin) {
      return {
        text: parentId
          ? `"${twin.name}" already exists under ${nameById.get(parentId)}.`
          : `A main category named "${twin.name}" already exists.`,
        conflict: twin,
      };
    }
    return null;
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (saving) return;
    setFormError(null);
    if (uploading) {
      setFormError({ text: 'Wait for the image upload to finish.' });
      return;
    }
    const slug = slugifyCategory(formData.slug);
    const problem = validate(formData, slug);
    if (problem) {
      setFormError(problem);
      return;
    }
    setSaving(true);
    setNotice(null);
    try {
      const { parent_id: parentId, ...fields } = formData;
      const payload = {
        ...fields,
        name: formData.name.trim(),
        slug,
        description: String(formData.description || '').trim(),
        display_order: Number(formData.display_order),
      };
      // The parent is only sent when the database has the column (after Migration 12)
      if (canNest) payload.parent_id = parentId || null;
      if (editingCat) {
        await updateCategory(editingCat.id, payload);
      } else {
        await createCategory(payload);
      }
      setIsFormOpen(false);
      const parentName = payload.parent_id ? nameById.get(payload.parent_id) : '';
      setNotice({
        type: 'success',
        text: parentName ? `Subcategory "${payload.name}" saved under ${parentName}.` : `Category "${payload.name}" saved.`,
      });
      loadData();
    } catch (err) {
      // Shown inside the modal, which stays open so nothing typed is lost
      setFormError({ text: `Category was not saved: ${err.message}` });
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

  const handleDelete = async (cat) => {
    const kind = cat.parent_id ? 'subcategory' : 'category';
    if (!window.confirm(`Delete the ${kind} "${cat.name}"? This cannot be undone. Categories that still have products or subcategories are not deleted.`)) return;
    setNotice(null);
    const res = await deleteCategory(cat.id);
    if (res && res.success === false) {
      setNotice({ type: 'error', text: res.error || 'Category was not deleted.' });
    } else {
      setNotice({ type: 'success', text: `"${cat.name}" deleted.` });
    }
    loadData();
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // choosing the same file again must trigger a new upload
    if (!file) return;
    setFormError(null);
    setUploading(true);
    try {
      const { url, path, error } = await uploadImage(file, 'categories', slugifyCategory(formData.slug) || 'cat');
      if (error || !url) {
        setFormError({ text: `Category image was not uploaded: ${error || 'Storage did not return the uploaded file.'}` });
      } else {
        setFormData((prev) => ({ ...prev, image_url: url, image_path: path }));
      }
    } catch (err) {
      setFormError({ text: `Category image was not uploaded: ${err?.message || 'Storage error'}` });
    } finally {
      setUploading(false);
    }
  };

  const formTitle = editingCat
    ? `Edit ${editingCat.parent_id ? 'Subcategory' : 'Category'}: ${editingCat.name}`
    : formMode === 'sub'
    ? 'Add Subcategory'
    : 'Add Main Category';

  return (
    <div className="ps-admin-categories-page">
      <div className="ps-admin-page-header">
        <div>
          <span className="ps-admin-eyebrow">CATEGORY HIERARCHY</span>
          <h1 className="ps-admin-page-title">Categories &amp; Subcategories</h1>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="ps-lx-btn ps-lx-btn--secondary"
            onClick={() => handleNewSub(null)}
            disabled={loading || hierarchy === false}
            title={hierarchy === false ? 'Needs database step 12 (categories.parent_id)' : 'Add a subcategory under a main category'}
          >
            <FolderPlus size={16} />
            <span>Add Subcategory</span>
          </button>
          <button type="button" className="ps-btn-gold-primary ps-admin-header-btn" onClick={handleNewMain}>
            <Plus size={16} />
            <span>Add Main Category</span>
          </button>
        </div>
      </div>

      {hierarchy === false && (
        <div className="ps-form-error-banner" role="status">
          This database has no categories.parent_id column yet (database step 12), so every category is a main
          category and subcategories cannot be saved.
        </div>
      )}

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
                <th>Category</th>
                <th>Level</th>
                <th>Slug</th>
                <th>Order</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ cat, level, parent, orphan, childCount }) => {
                // A subcategory of a disabled main category is hidden on the storefront too
                const hiddenByParent = level === 1 && parent && parent.is_active === false && cat.is_active !== false;
                return (
                  <tr key={cat.id} style={level === 0 ? { background: 'rgba(242, 232, 216, 0.35)' } : undefined}>
                    <td style={level ? { paddingLeft: 28 } : undefined}>
                      {cat.image_url ? (
                        <img
                          src={cardImageUrl(cat.image_url)}
                          loading="lazy"
                          decoding="async"
                          onError={fullImageFallback(cat.image_url)}
                          alt={cat.name}
                          className="ps-prod-table-thumb"
                        />
                      ) : (
                        <div className="ps-prod-table-thumb" style={{ background: 'var(--lux-champagne)' }} />
                      )}
                    </td>
                    <td style={level ? { paddingLeft: 28 } : undefined}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {level ? <CornerDownRight size={14} style={{ color: 'var(--lux-gold)', flexShrink: 0 }} aria-hidden="true" /> : null}
                        <strong>{cat.name}</strong>
                      </div>
                      {cat.description && <div style={{ fontSize: 11, color: 'var(--color-muted)' }}>{cat.description}</div>}
                    </td>
                    <td>
                      {level === 0 ? (
                        <span className="ps-lx-badge ps-lx-badge--live">
                          Main · {childCount} sub{childCount === 1 ? '' : 's'}
                        </span>
                      ) : orphan ? (
                        <span className="ps-lx-badge ps-lx-badge--warn">Main category missing</span>
                      ) : (
                        <span className="ps-lx-badge ps-lx-badge--read">Sub of {parent.name}</span>
                      )}
                    </td>
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
                        aria-label={`${cat.is_active ? 'Disable' : 'Enable'} ${cat.name}`}
                        style={{ border: 0, cursor: 'pointer' }}
                      >
                        {togglingId === cat.id ? 'Saving…' : cat.is_active ? 'Active' : 'Disabled'}
                      </button>
                      {hiddenByParent && (
                        <div style={{ fontSize: 11, color: 'var(--color-muted)', marginTop: 4 }}>Hidden: main category disabled</div>
                      )}
                    </td>
                    <td>
                      <div className="ps-table-actions">
                        {level === 0 && canNest && (
                          <button
                            type="button"
                            className="ps-lx-btn ps-lx-btn--ghost ps-lx-btn--sm"
                            onClick={() => handleNewSub(cat)}
                            title={`Add a subcategory under ${cat.name}`}
                          >
                            <Plus size={13} />
                            <span>Sub</span>
                          </button>
                        )}
                        <button
                          type="button"
                          className="ps-action-icon-btn"
                          onClick={() => handleEdit(cat)}
                          title={`Edit ${cat.name}`}
                          aria-label={`Edit ${cat.name}`}
                        >
                          <Edit2 size={15} />
                        </button>
                        <button
                          type="button"
                          className="ps-action-icon-btn is-delete"
                          onClick={() => handleDelete(cat)}
                          title={`Delete ${cat.name}`}
                          aria-label={`Delete ${cat.name}`}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {categories.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: 28, color: 'var(--color-muted)' }}>
                    No categories yet. Click “Add Main Category” to create one.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Category / subcategory create and edit */}
      {isFormOpen && (
        <div className="ps-admin-modal-overlay">
          <div className="ps-admin-modal-card" style={{ maxWidth: 520, textAlign: 'left' }}>
            <h2 className="ps-card-title" style={{ marginBottom: 16 }}>
              {formTitle}
            </h2>

            {formError && (
              <div className="ps-form-error-banner" role="alert" style={{ marginBottom: 12 }}>
                {formError.text}
                {formError.conflict && formError.conflict.id !== editingCat?.id && (
                  <div style={{ marginTop: 8 }}>
                    <button
                      type="button"
                      className="ps-lx-btn ps-lx-btn--secondary ps-lx-btn--sm"
                      onClick={() => handleEdit(formError.conflict)}
                    >
                      Edit “{formError.conflict.name}” instead
                    </button>
                  </div>
                )}
              </div>
            )}

            <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {canNest && (formMode === 'sub' || editingCat) && (
                <div className="ps-form-group">
                  <label htmlFor="ps-cat-parent">Main Category{formMode === 'sub' && !editingCat ? ' *' : ''}</label>
                  <select
                    id="ps-cat-parent"
                    value={formData.parent_id}
                    onChange={(e) => handleParentChange(e.target.value)}
                    disabled={editingHasChildren}
                    required={formMode === 'sub' && !editingCat}
                  >
                    {formMode === 'sub' && !editingCat ? (
                      <option value="">Choose a main category…</option>
                    ) : (
                      <option value="">None — this is a main category</option>
                    )}
                    {parentOptions.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                        {m.is_active === false ? ' (disabled)' : ''}
                      </option>
                    ))}
                  </select>
                  {editingHasChildren && (
                    <small style={{ color: 'var(--color-muted)' }}>This category has subcategories, so it stays a main category.</small>
                  )}
                </div>
              )}

              <div className="ps-form-group">
                <label htmlFor="ps-cat-name">{isSubForm ? 'Subcategory Name *' : 'Category Name *'}</label>
                <input id="ps-cat-name" type="text" value={formData.name} onChange={(e) => handleNameChange(e.target.value)} required />
              </div>

              <div className="ps-form-group">
                <label htmlFor="ps-cat-slug">Slug (URL) *</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    id="ps-cat-slug"
                    type="text"
                    value={formData.slug}
                    onChange={(e) => {
                      setSlugTouched(true);
                      setFormData({ ...formData, slug: e.target.value });
                    }}
                    onBlur={() => setFormData((prev) => ({ ...prev, slug: slugifyCategory(prev.slug) }))}
                    required
                    style={{ flex: 1 }}
                  />
                  <button
                    type="button"
                    className="ps-lx-btn ps-lx-btn--ghost ps-lx-btn--sm"
                    onClick={() => {
                      setSlugTouched(false);
                      setFormData((prev) => ({ ...prev, slug: slugifyCategory(prev.name) }));
                    }}
                    title="Generate the slug from the name"
                  >
                    <Wand2 size={13} />
                    <span>From name</span>
                  </button>
                </div>
                {editingCat && slugifyCategory(formData.slug) !== editingCat.slug && (
                  <small style={{ color: 'var(--color-muted)' }}>Changing the slug changes this category’s web address; old links to it stop working.</small>
                )}
              </div>

              <div className="ps-form-group">
                <label htmlFor="ps-cat-desc">Description</label>
                <textarea id="ps-cat-desc" rows="2" value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} />
              </div>

              <div className="ps-form-group">
                <label>Thumbnail (Storage folder: categories/)</label>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  {formData.image_url && (
                    <img src={formData.image_url} alt="Preview" style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 4 }} />
                  )}
                  <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleImageUpload} disabled={uploading || saving} />
                </div>
                {uploading && <small style={{ color: '#8C7343' }}>Uploading image…</small>}
              </div>

              <div className="ps-form-row">
                <div className="ps-form-group">
                  <label htmlFor="ps-cat-order">Display Order</label>
                  <input
                    id="ps-cat-order"
                    type="number"
                    value={formData.display_order}
                    min="1"
                    step="1"
                    onChange={(e) => setFormData({ ...formData, display_order: e.target.value })}
                  />
                  {isSubForm && <small style={{ color: 'var(--color-muted)' }}>Position within its main category.</small>}
                </div>
                <div className="ps-form-group" style={{ justifyContent: 'center' }}>
                  <label className="ps-checkbox-label">
                    <input type="checkbox" checked={formData.is_active} onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })} />
                    <span>Active (shown on the storefront)</span>
                  </label>
                </div>
              </div>

              <div className="ps-modal-actions" style={{ marginTop: 12 }}>
                <button type="button" className="ps-btn-cancel" onClick={() => setIsFormOpen(false)} disabled={saving}>
                  Cancel
                </button>
                <button type="submit" className="ps-btn-gold-primary" style={{ padding: '10px 18px' }} disabled={saving || uploading}>
                  {saving ? 'Saving…' : isSubForm ? 'Save Subcategory' : 'Save Category'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
