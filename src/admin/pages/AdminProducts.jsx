import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
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
  Upload,
  Image as ImageIcon,
} from 'lucide-react';
import { getProducts, deleteProduct, createProduct, updateProduct } from '../../services/products';
import { formatINR } from '../../utils/formatCurrency';
import './AdminProducts.css';

export default function AdminProducts() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  // The admin header search links here with ?search=
  const [searchParams] = useSearchParams();
  const [searchTerm, setSearchTerm] = useState(() => searchParams.get('search') || '');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [bottleFilter, setBottleFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [bestsellerFilter, setBestsellerFilter] = useState('ALL');
  const [featuredFilter, setFeaturedFilter] = useState('ALL');
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [busyId, setBusyId] = useState(null);
  // { type: 'success' | 'info' | 'error', text: string }
  const [notice, setNotice] = useState(null);
  const navigate = useNavigate();

  const fetchList = async () => {
    setLoading(true);
    try {
      const data = await getProducts({ allStatuses: true, throwOnError: true });
      setProducts(data);
    } catch (err) {
      setNotice({ type: 'error', text: `Could not load products from the database: ${err.message}` });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchList();
  }, []);

  useEffect(() => {
    const q = searchParams.get('search');
    if (q !== null) setSearchTerm(q);
  }, [searchParams]);

  const deleteTarget = products.find((p) => p.id === deleteConfirmId) || null;

  const handleDelete = async (id) => {
    const prodName = products.find((p) => p.id === id)?.name || 'Product';
    setDeleting(true);
    setNotice(null);
    try {
      const result = await deleteProduct(id);
      if (result.action === 'archived') {
        const refs = result.references || {};
        const parts = [
          refs.orderItems ? `${refs.orderItems} order item(s)` : '',
          refs.comboItems ? `${refs.comboItems} combo item(s)` : '',
          refs.reviews ? `${refs.reviews} review(s)` : '',
        ].filter(Boolean);
        setNotice({
          type: 'info',
          text: `"${prodName}" was deactivated instead of deleted because it is referenced by ${
            parts.length ? parts.join(', ') : `other records (${refs.reason || 'foreign key'})`
          }. It is hidden from the storefront and its history is preserved.`,
        });
      } else if (result.action === 'deleted') {
        const st = result.storage || {};
        let text = `"${prodName}" was permanently deleted.`;
        if (st.removed?.length) text += ` ${st.removed.length} unused image file(s) removed from Storage.`;
        if (st.failed?.length) text += ` ${st.failed.length} image file(s) could not be removed: ${st.error || 'unknown error'}.`;
        setNotice({ type: st.failed?.length ? 'info' : 'success', text });
      } else {
        setNotice({ type: 'error', text: `Unexpected response from the database for "${prodName}". Reload and check its status.` });
      }
    } catch (err) {
      console.error('Delete product error:', err);
      setNotice({ type: 'error', text: `Delete failed for "${prodName}": ${err.message}` });
    } finally {
      setDeleting(false);
      setDeleteConfirmId(null);
      await fetchList();
    }
  };

  const handleDuplicate = async (prod) => {
    const copy = {
      ...prod,
      id: undefined,
      // Reuse only the images actually stored on the original (no display fallbacks)
      main_image: prod.stored_images?.main || prod.main_image,
      main_image_path: prod.stored_images?.main_path || null,
      glass_image: prod.stored_images?.glass || null,
      glass_image_path: prod.stored_images?.glass_path || null,
      pvc_image: prod.stored_images?.pvc || null,
      pvc_image_path: prod.stored_images?.pvc_path || null,
      name: `${prod.name} (Copy)`,
      slug: `${prod.slug}-copy-${Math.floor(Math.random() * 1000)}`,
      sku: prod.sku ? `${prod.sku}-COPY` : '',
    };
    setBusyId(prod.id);
    setNotice(null);
    try {
      await createProduct(copy);
      setNotice({ type: 'success', text: `"${copy.name}" created.` });
    } catch (err) {
      setNotice({ type: 'error', text: `Duplicate failed: ${err.message}` });
    } finally {
      setBusyId(null);
      await fetchList();
    }
  };

  const handleToggleStatus = async (prod) => {
    const nextStatus = prod.status === 'active' ? 'draft' : 'active';
    setBusyId(prod.id);
    setNotice(null);
    try {
      await updateProduct(prod.id, { status: nextStatus });
      setNotice({
        type: 'success',
        text: nextStatus === 'active'
          ? `"${prod.name}" is now active and visible on the storefront.`
          : `"${prod.name}" was deactivated and is hidden from the storefront.`,
      });
    } catch (err) {
      setNotice({ type: 'error', text: `Status change failed for "${prod.name}": ${err.message}` });
    } finally {
      setBusyId(null);
      await fetchList();
    }
  };

  // Homepage "Discover Our New Arrivals": the New Arrival flag shows the product there, and the
  // display order sets its position (lowest first). Only these columns change; prices,
  // variants and stock are not touched.
  const handleToggleNewArrival = async (prod) => {
    const next = !prod.new_arrival;
    setBusyId(prod.id);
    setNotice(null);
    try {
      await updateProduct(prod.id, { is_new_arrival: next });
      setNotice({
        type: 'success',
        text: next
          ? `"${prod.name}" is marked New Arrival${prod.status === 'active' ? ' and shown in the homepage section.' : ' (it appears once the product is active).'}`
          : `"${prod.name}" is no longer a New Arrival.`,
      });
    } catch (err) {
      setNotice({ type: 'error', text: `New Arrival change failed for "${prod.name}": ${err.message}` });
    } finally {
      setBusyId(null);
      await fetchList();
    }
  };

  const handleDisplayOrder = async (prod, value) => {
    const next = Math.max(0, Math.floor(Number(value) || 0));
    if (next === (Number(prod.display_order) || 0)) return;
    setBusyId(prod.id);
    setNotice(null);
    try {
      await updateProduct(prod.id, { display_order: next });
      setNotice({ type: 'success', text: `"${prod.name}": display order saved as ${next}.` });
    } catch (err) {
      setNotice({ type: 'error', text: `Display order not saved for "${prod.name}": ${err.message}` });
    } finally {
      setBusyId(null);
      await fetchList();
    }
  };

  // Bottle types and sizes actually configured (active variants), instead of fixed labels
  const variantSummary = (prod) => {
    const active = (prod.variants || []).filter((v) => v.is_active !== false);
    const bottles = [...new Set(active.map((v) => (String(v.bottle_type || '').toLowerCase().includes('pvc') ? 'PVC' : 'Glass')))];
    const sizes = [...new Set(active.map((v) => String(v.size_ml || '').replace(/\s+/g, '').toLowerCase()).filter(Boolean))];
    return { bottles: bottles.join(' & ') || '—', sizes: sizes.join(', ') || '—' };
  };

  const noticeColors = {
    success: { bg: '#ECFDF5', border: '#A7F3D0', color: '#065F46' },
    info: { bg: '#FFFBEB', border: '#FDE68A', color: '#92400E' },
    error: { bg: '#FEF2F2', border: '#FECACA', color: '#B91C1C' },
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
          <Link to="/admin/products/images" className="ps-btn-gold-primary ps-admin-header-btn">
            <ImageIcon size={16} />
            <span>Product Images</span>
          </Link>
          <Link to="/admin/products/import" className="ps-btn-gold-primary ps-admin-header-btn">
            <Upload size={16} />
            <span>Bulk Import</span>
          </Link>
          <Link to="/admin/products/new" className="ps-btn-gold-primary ps-admin-header-btn">
            <Plus size={16} />
            <span>+ Add Product</span>
          </Link>
        </div>
      </div>

      {notice && (
        <div
          role={notice.type === 'error' ? 'alert' : 'status'}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: '12px',
            padding: '12px 16px',
            marginBottom: '16px',
            borderRadius: '8px',
            fontSize: '14px',
            background: noticeColors[notice.type].bg,
            border: `1px solid ${noticeColors[notice.type].border}`,
            color: noticeColors[notice.type].color,
          }}
        >
          <span>{notice.text}</span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            aria-label="Dismiss message"
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'inherit', fontWeight: 600 }}
          >
            ✕
          </button>
        </div>
      )}

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
                <th title="Shown in the homepage New Arrivals section (active products only); lower order first">New Arrival</th>
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
                    <span style={{ fontSize: '12px', color: '#fffaf0' }}>{variantSummary(prod).bottles}</span>
                  </td>
                  <td>
                    <span style={{ fontSize: '11px', color: '#c8a45d' }}>{variantSummary(prod).sizes}</span>
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <button
                        type="button"
                        className={`ps-status-toggle-btn ${prod.new_arrival ? 'is-active' : 'is-draft'}`}
                        onClick={() => handleToggleNewArrival(prod)}
                        disabled={busyId === prod.id}
                        aria-pressed={prod.new_arrival}
                        title={prod.new_arrival ? 'Remove from New Arrivals' : 'Show in homepage New Arrivals'}
                      >
                        {prod.new_arrival ? 'New' : 'Off'}
                      </button>
                      <input
                        type="number"
                        min="0"
                        defaultValue={Number(prod.display_order) || 0}
                        key={`${prod.id}-${prod.display_order}`}
                        disabled={busyId === prod.id}
                        onBlur={(e) => handleDisplayOrder(prod, e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') e.currentTarget.blur();
                        }}
                        aria-label={`Display order for ${prod.name}`}
                        title="Display order (lower first)"
                        style={{ width: 54, padding: '4px 6px', textAlign: 'center' }}
                      />
                    </div>
                  </td>
                  <td>
                    <button
                      type="button"
                      className={`ps-status-toggle-btn ${prod.status === 'active' ? 'is-active' : 'is-draft'}`}
                      onClick={() => handleToggleStatus(prod)}
                      disabled={busyId === prod.id}
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
                        disabled={busyId === prod.id}
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
              Delete <strong>{deleteTarget?.name || 'this product'}</strong>? If it appears in any order, combo or
              review, it will be <strong>deactivated</strong> (hidden from the storefront) instead, so purchase history is
              preserved. Otherwise the product, its variants and its unused images are permanently removed. This cannot be undone.
            </p>
            <div className="ps-modal-actions">
              <button
                type="button"
                className="ps-btn-cancel"
                onClick={() => setDeleteConfirmId(null)}
                disabled={deleting}
              >
                CANCEL
              </button>
              <button
                type="button"
                className="ps-btn-confirm-delete"
                onClick={() => handleDelete(deleteConfirmId)}
                disabled={deleting}
              >
                {deleting ? 'DELETING…' : 'DELETE'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
