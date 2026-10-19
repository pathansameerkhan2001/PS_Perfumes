import React, { useState, useEffect } from 'react';
import { Plus, Minus } from 'lucide-react';
import { getProducts, updateVariantStock, isValidUUID } from '../../services/products';
import { formatINR } from '../../utils/formatCurrency';

const LOW_STOCK_LIMIT = 5;

/**
 * Inventory is tracked per variant (product_variants.stock_quantity), so each row here is
 * one bottle type × size of a product. Changing stock never changes product visibility.
 */
export default function AdminInventory() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState('ALL');
  const [busyId, setBusyId] = useState(null);
  const [notice, setNotice] = useState(null); // { type: 'success' | 'error', text }

  const fetchList = async () => {
    setLoading(true);
    try {
      const products = await getProducts({ allStatuses: true, throwOnError: true });
      const variantRows = [];
      products.forEach((prod) => {
        (prod.variants || [])
          .filter((v) => isValidUUID(v.id))
          .forEach((v) => {
            variantRows.push({
              id: v.id,
              productName: prod.name,
              productActive: prod.is_active !== false,
              category: prod.category,
              image: prod.main_image,
              bottle: v.bottle_type,
              size: v.size_ml,
              sku: v.sku,
              price: Number(v.sale_price || v.price) || 0,
              stock: Number(v.stock_quantity) || 0,
              variantActive: v.is_active !== false,
            });
          });
      });
      setRows(variantRows);
    } catch (err) {
      setNotice({ type: 'error', text: `Could not load inventory: ${err.message}` });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchList();
  }, []);

  const saveStock = async (row, newStock) => {
    const target = Math.max(0, Math.floor(Number(newStock) || 0));
    if (target === row.stock) return;
    setBusyId(row.id);
    setNotice(null);
    try {
      const saved = await updateVariantStock(row.id, target);
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, stock: saved } : r)));
      setNotice({
        type: 'success',
        text: `${row.productName} — ${row.bottle} ${row.size}: stock saved as ${saved}.`,
      });
    } catch (err) {
      setNotice({ type: 'error', text: `${row.productName} — ${row.bottle} ${row.size}: ${err.message}` });
    } finally {
      setBusyId(null);
    }
  };

  const filtered = rows.filter((r) => {
    if (filterType === 'LOW') return r.stock > 0 && r.stock <= LOW_STOCK_LIMIT;
    if (filterType === 'OUT') return r.stock <= 0;
    return true;
  });

  return (
    <div className="ps-admin-inventory-page">
      <div className="ps-admin-page-header">
        <div>
          <span className="ps-admin-eyebrow">WAREHOUSE & STOCK</span>
          <h1 className="ps-admin-page-title">Inventory Controls</h1>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            className={`ps-toolbar-pill ${filterType === 'ALL' ? 'is-active' : ''}`}
            onClick={() => setFilterType('ALL')}
          >
            All Variants ({rows.length})
          </button>
          <button
            type="button"
            className={`ps-toolbar-pill ${filterType === 'LOW' ? 'is-active' : ''}`}
            onClick={() => setFilterType('LOW')}
          >
            Low Stock (&le; {LOW_STOCK_LIMIT})
          </button>
          <button
            type="button"
            className={`ps-toolbar-pill ${filterType === 'OUT' ? 'is-active' : ''}`}
            onClick={() => setFilterType('OUT')}
          >
            Out of Stock
          </button>
        </div>
      </div>

      {notice && (
        <div className={notice.type === 'error' ? 'ps-form-error-banner' : 'ps-form-success-banner'} role="status">
          {notice.text}
        </div>
      )}

      {loading ? (
        <div className="ps-admin-loading">Loading Inventory...</div>
      ) : filtered.length === 0 ? (
        <div className="ps-admin-loading">
          {rows.length === 0 ? 'No product variants in the database yet.' : 'No variants match this filter.'}
        </div>
      ) : (
        <div className="ps-admin-table-container">
          <table className="ps-admin-products-table">
            <thead>
              <tr>
                <th>Flacon</th>
                <th>Product</th>
                <th>Variant</th>
                <th>Price</th>
                <th>Current Stock</th>
                <th>Status</th>
                <th>Quick Adjust</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.id}>
                  <td>
                    {row.image ? <img src={row.image} alt={row.productName} className="ps-prod-table-thumb" /> : null}
                  </td>
                  <td>
                    <strong>{row.productName}</strong>
                    <div style={{ fontSize: 11, color: 'var(--color-muted)' }}>
                      {row.category}
                      {!row.productActive ? ' · product inactive' : ''}
                    </div>
                  </td>
                  <td>
                    {row.bottle} · {row.size}
                    <div style={{ fontSize: 11, color: 'var(--color-muted)' }}>
                      {row.sku || '—'}
                      {!row.variantActive ? ' · variant inactive' : ''}
                    </div>
                  </td>
                  <td>
                    <strong style={{ color: 'var(--color-gold-bright)' }}>{formatINR(row.price)}</strong>
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input
                        type="number"
                        min="0"
                        defaultValue={row.stock}
                        key={`${row.id}-${row.stock}`}
                        disabled={busyId === row.id}
                        onBlur={(e) => saveStock(row, e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') e.currentTarget.blur();
                        }}
                        aria-label={`Stock for ${row.productName} ${row.bottle} ${row.size}`}
                        style={{
                          width: 70,
                          padding: '4px 6px',
                          background: '#050505',
                          border: '1px solid var(--color-border)',
                          color: '#fff',
                          textAlign: 'center',
                          borderRadius: 3,
                        }}
                      />
                      <span style={{ fontSize: 11, color: 'var(--color-muted)' }}>units</span>
                    </div>
                  </td>
                  <td>
                    <span
                      className={`ps-status-pill ${
                        row.stock <= 0
                          ? 'ps-status-cancelled'
                          : row.stock <= LOW_STOCK_LIMIT
                          ? 'ps-status-pending'
                          : 'ps-status-delivered'
                      }`}
                    >
                      {row.stock <= 0 ? 'OUT OF STOCK' : row.stock <= LOW_STOCK_LIMIT ? 'LOW STOCK' : 'IN STOCK'}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        type="button"
                        className="ps-action-icon-btn"
                        onClick={() => saveStock(row, row.stock - 1)}
                        disabled={busyId === row.id || row.stock <= 0}
                        title="Reduce stock by 1"
                      >
                        <Minus size={14} />
                      </button>
                      <button
                        type="button"
                        className="ps-action-icon-btn"
                        onClick={() => saveStock(row, row.stock + 1)}
                        disabled={busyId === row.id}
                        title="Increase stock by 1"
                      >
                        <Plus size={14} />
                      </button>
                      <button
                        type="button"
                        className="ps-action-icon-btn"
                        onClick={() => saveStock(row, row.stock + 10)}
                        disabled={busyId === row.id}
                        title="Add 10 units"
                        style={{ width: 'auto', padding: '0 8px', fontSize: 11 }}
                      >
                        +10
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
