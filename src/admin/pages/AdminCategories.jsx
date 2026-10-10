import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Upload, Check } from 'lucide-react';
import { getCategories, createCategory, updateCategory, deleteCategory } from '../../services/categories';
import { uploadImage } from '../../lib/storage';

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
    is_featured: false,
  });

  const loadData = async () => {
    setLoading(true);
    const data = await getCategories(true);
    setCategories(data);
    setLoading(false);
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
      display_order: cat.display_order || 1,
      is_active: cat.is_active,
      is_featured: Boolean(cat.is_featured),
    });
    setIsFormOpen(true);
  };

  const handleNew = () => {
    setEditingCat(null);
    setFormData({
      name: '',
      slug: '',
      description: '',
      image_url: '',
      display_order: categories.length + 1,
      is_active: true,
      is_featured: false,
    });
    setIsFormOpen(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (editingCat) {
      await updateCategory(editingCat.id, formData);
    } else {
      await createCategory(formData);
    }
    setIsFormOpen(false);
    loadData();
  };

  const handleDelete = async (id) => {
    if (window.confirm('Delete this fragrance category?')) {
      const res = await deleteCategory(id);
      if (res && res.success === false && res.error) {
        alert(res.error);
      }
      loadData();
    }
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const { url, error } = await uploadImage(file, 'categories', formData.slug || 'cat');
      if (error) {
        alert(`Category image upload failed: ${error}`);
      } else if (url) {
        setFormData((prev) => ({ ...prev, image_url: url }));
      }
    } catch (err) {
      alert(`Category image upload error: ${err?.message || 'Storage error'}`);
    }
  };

  return (
    <div className="ps-admin-categories-page">
      <div className="ps-admin-page-header">
        <div>
          <span className="ps-admin-eyebrow">FAMILY HIERARCHY</span>
          <h1 className="ps-admin-page-title">Fragrance Categories</h1>
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

      {loading ? (
        <div className="ps-admin-loading">Loading Categories...</div>
      ) : (
        <div className="ps-admin-table-container">
          <table className="ps-admin-products-table">
            <thead>
              <tr>
                <th>Thumb</th>
                <th>Category Name</th>
                <th>Slug</th>
                <th>Order</th>
                <th>Active</th>
                <th>Featured</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {categories.map((cat) => (
                <tr key={cat.id}>
                  <td>
                    {cat.image_url ? (
                      <img src={cat.image_url} alt={cat.name} className="ps-prod-table-thumb" />
                    ) : (
                      <div className="ps-prod-table-thumb" style={{ background: '#222' }} />
                    )}
                  </td>
                  <td>
                    <strong>{cat.name}</strong>
                    <div style={{ fontSize: 11, color: 'var(--color-muted)' }}>{cat.description}</div>
                  </td>
                  <td>
                    <code style={{ color: 'var(--color-champagne)' }}>{cat.slug}</code>
                  </td>
                  <td>{cat.display_order}</td>
                  <td>
                    <span className={`ps-status-pill ${cat.is_active ? 'ps-status-delivered' : 'ps-status-cancelled'}`}>
                      {cat.is_active ? 'Active' : 'Disabled'}
                    </span>
                  </td>
                  <td>
                    {cat.is_featured ? (
                      <span className="ps-table-badge ps-badge-gold">FEATURED</span>
                    ) : (
                      <span style={{ color: '#666', fontSize: 11 }}>—</span>
                    )}
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
                <label>Category Image (ps-perfumes/categories/...)</label>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  {formData.image_url && (
                    <img src={formData.image_url} alt="Preview" style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 4 }} />
                  )}
                  <input type="file" accept="image/*" onChange={handleImageUpload} />
                </div>
              </div>

              <div className="ps-form-row">
                <div className="ps-form-group">
                  <label>Display Order</label>
                  <input
                    type="number"
                    value={formData.display_order}
                    onChange={(e) => setFormData({ ...formData, display_order: Number(e.target.value) })}
                  />
                </div>
                <div className="ps-form-group" style={{ justifyContent: 'center' }}>
                  <label className="ps-checkbox-label">
                    <input
                      type="checkbox"
                      checked={formData.is_featured}
                      onChange={(e) => setFormData({ ...formData, is_featured: e.target.checked })}
                    />
                    <span>Featured Category</span>
                  </label>
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
                <button type="button" className="ps-btn-cancel" onClick={() => setIsFormOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="ps-btn-gold-primary" style={{ padding: '10px 18px' }}>
                  Save Category
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
