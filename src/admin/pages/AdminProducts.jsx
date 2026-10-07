import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Plus,
  Search,
  Edit2,
  Trash2,
  Copy,
  Archive,
  Star,
  Sparkles,
  AlertCircle,
  Eye,
} from 'lucide-react';
import { getProducts, deleteProduct, createProduct, updateProduct } from '../../services/products';
import { formatINR } from '../../utils/formatCurrency';
import './AdminProducts.css';

export default function AdminProducts() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [bottleFilter, setBottleFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [bestsellerFilter, setBestsellerFilter] = useState('ALL');
  const [featuredFilter, setFeaturedFilter] = useState('ALL');
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const navigate = useNavigate();

  const fetchList = async () => {
    setLoading(true);
    try {
      const data = await getProducts({ allStatuses: true });
      setProducts(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchList();
  }, []);

  const handleDelete = async (id) => {
    await deleteProduct(id);
    setDeleteConfirmId(null);
    fetchList();
  };

  const handleDuplicate = async (prod) => {
    const copy = {
      ...prod,
      id: `ps-${Date.now()}`,
      name: `${prod.name} (Copy)`,
      slug: `${prod.slug}-copy-${Math.floor(Math.random() * 1000)}`,
      sku: `${prod.sku}-COPY`,
    };
    await createProduct(copy);
    fetchList();
  };

  const handleToggleStatus = async (prod) => {
    const nextStatus = prod.status === 'active' ? 'draft' : 'active';
    await updateProduct(prod.id, { status: nextStatus });
    fetchList();
  };

  // Filter
  const filtered = products.filter((p) => {
    if (categoryFilter !== 'ALL' && p.category?.toLowerCase() !== categoryFilter.toLowerCase()) {
      return false;
    }
    if (statusFilter !== 'ALL' && p.status !== statusFilter) {
      return false;
    }
    if (bestsellerFilter === 'YES' && !p.bestseller) {
      return false;
    }
    if (featuredFilter === 'YES' && !p.featured) {
      return false;
    }
    if (bottleFilter !== 'ALL') {
      const hasBottle = p.variants?.some((v) =>
        v.bottle_type?.toLowerCase().includes(bottleFilter.toLowerCase())
      );
      if (!hasBottle) return false;
    }
    if (searchTerm) {
      const s = searchTerm.toLowerCase();
      return p.name.toLowerCase().includes(s) || p.sku?.toLowerCase().includes(s);
    }
    return true;
  });

  return (
    <div className="ps-admin-products-page">
      <div className="ps-admin-page-header">
        <div>
          <h1 className="ps-admin-page-title">Products</h1>
          <p className="ps-admin-page-subtitle">Manage formulations, variant matrices, and availability</p>
        </div>
        <div className="ps-admin-header-actions">
          <Link to="/admin/products/new" className="ps-btn-gold-primary ps-admin-header-btn">
            <Plus size={16} />
            <span>+ Add Product</span>
          </Link>
        </div>
      </div>

      {/* Control Bar: Search & Multi-Filters (Section 11) */}
      <div className="ps-admin-products-toolbar">
        <div className="ps-admin-search-input-wrap">
          <Search size={15} className="ps-search-icon" />
          <input
            type="text"
            placeholder="Search products..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="ps-admin-filter-dropdowns">
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="ps-admin-filter-select"
          >
            <option value="ALL">All Categories</option>
            {['Perfume', 'Attar', 'Bakhoor', 'Musky', 'Oud', 'Floral', 'Woody'].map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>

          <select
            value={bottleFilter}
            onChange={(e) => setBottleFilter(e.target.value)}
            className="ps-admin-filter-select"
          >
            <option value="ALL">All Bottle Types</option>
            <option value="Glass">Glass Bottle</option>
            <option value="PVC">PVC Bottle</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="ps-admin-filter-select"
          >
            <option value="ALL">All Status</option>
            <option value="active">Active</option>
            <option value="draft">Draft</option>
          </select>

          <select
            value={bestsellerFilter}
            onChange={(e) => setBestsellerFilter(e.target.value)}
            className="ps-admin-filter-select"
          >
            <option value="ALL">All Badges</option>
            <option value="YES">Bestsellers Only</option>
          </select>

          <select
            value={featuredFilter}
            onChange={(e) => setFeaturedFilter(e.target.value)}
            className="ps-admin-filter-select"
          >
            <option value="ALL">Featured Filter</option>
            <option value="YES">Featured Only</option>
          </select>
        </div>
      </div>

      {/* Table matching Section 23 */}
      {loading ? (
        <div className="ps-admin-loading">Loading Formulations...</div>
      ) : filtered.length === 0 ? (
        <div className="ps-admin-empty-table">
          <p>No products match the selected criteria.</p>
        </div>
      ) : (
        <div className="ps-admin-table-container">
          <table className="ps-admin-products-table">
            <thead>
              <tr>
                <th>Image</th>
                <th>Product</th>
                <th>Category</th>
                <th>Bottle Type</th>
                <th>Available Sizes</th>
                <th>Starting Price</th>
                <th>Stock</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((prod) => (
                <tr key={prod.id}>
                  <td>
                    <img
                      src={prod.main_image || prod.image}
                      alt={prod.name}
                      className="ps-prod-table-thumb"
                    />
                  </td>
                  <td>
                    <div className="ps-prod-table-meta">
                      <Link to={`/admin/products/${prod.id}/edit`} className="ps-prod-table-name">
                        {prod.name}
                      </Link>
                      <span className="ps-prod-table-sku">{prod.sku}</span>
                    </div>
                  </td>
                  <td>
                    <span className="ps-prod-table-category">{prod.category}</span>
                  </td>
                  <td>
                    <span style={{ fontSize: '12px', color: '#fffaf0' }}>Glass & PVC</span>
                  </td>
                  <td>
                    <span style={{ fontSize: '11px', color: '#c8a45d' }}>30ml, 50ml, 100ml</span>
                  </td>
                  <td>
                    <div className="ps-prod-table-price">
                      <strong>{formatINR(prod.price)}</strong>
                      {prod.compare_at_price && (
                        <span>{formatINR(prod.compare_at_price)}</span>
                      )}
                    </div>
                  </td>
                  <td>
                    <span className={`ps-stock-indicator-pill ${prod.stock <= 5 ? 'is-low' : ''}`}>
                      {prod.stock} Units
                    </span>
                  </td>
                  <td>
                    <button
                      type="button"
                      className={`ps-status-toggle-btn ${prod.status === 'active' ? 'is-active' : 'is-draft'}`}
                      onClick={() => handleToggleStatus(prod)}
                      title="Click to toggle status"
                    >
                      {prod.status}
                    </button>
                  </td>
                    <td>
                    <div className="ps-table-actions">
                      <Link
                        to={`/admin/products/${prod.id}/edit`}
                        className="ps-table-action-btn"
                        title="Edit Formulation"
                      >
                        <Edit2 size={15} />
                      </Link>
                      <button
                        type="button"
                        className="ps-table-action-btn"
                        onClick={() => handleDuplicate(prod)}
                        title="Duplicate Formulation"
                      >
                        <Copy size={15} />
                      </button>
                      <button
                        type="button"
                        className="ps-table-action-btn is-delete"
                        onClick={() => setDeleteConfirmId(prod.id)}
                        title="Delete Formulation"
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

      {/* Delete Confirmation Modal */}
      {deleteConfirmId && (
        <div className="ps-admin-modal-overlay">
          <div className="ps-admin-modal-card">
            <AlertCircle size={40} color="#ef4444" className="ps-modal-icon" />
            <h3 className="ps-modal-title">Confirm Deletion</h3>
            <p className="ps-modal-desc">
              Are you certain you wish to permanently remove this fragrance from the atelier database? This action cannot be reversed.
            </p>
            <div className="ps-modal-actions">
              <button
                type="button"
                className="ps-btn-cancel"
                onClick={() => setDeleteConfirmId(null)}
              >
                CANCEL
              </button>
              <button
                type="button"
                className="ps-btn-confirm-delete"
                onClick={() => handleDelete(deleteConfirmId)}
              >
                PERMANENTLY DELETE
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
