import React, { useState, useEffect } from 'react';
import { AlertTriangle, Plus, Minus, Check, Archive } from 'lucide-react';
import { getProducts, updateProduct } from '../../services/products';
import { formatINR } from '../../utils/formatCurrency';

export default function AdminInventory() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState('ALL');

  const fetchList = async () => {
    setLoading(true);
    const data = await getProducts({ allStatuses: true });
    setProducts(data);
    setLoading(false);
  };

  useEffect(() => {
    fetchList();
  }, []);

  const handleAdjustStock = async (prod, delta) => {
    const newStock = Math.max(0, (prod.stock || 0) + delta);
    const newStatus = newStock === 0 ? 'out_of_stock' : (prod.status === 'out_of_stock' ? 'active' : prod.status);
    await updateProduct(prod.id, { stock: newStock, status: newStatus });
    fetchList();
  };

  const handleDirectSetStock = async (prod, val) => {
    const newStock = Math.max(0, Number(val) || 0);
    const newStatus = newStock === 0 ? 'out_of_stock' : (prod.status === 'out_of_stock' ? 'active' : prod.status);
    await updateProduct(prod.id, { stock: newStock, status: newStatus });
    fetchList();
  };

  const filtered = products.filter((p) => {
    if (filterType === 'LOW') return p.stock > 0 && p.stock <= 5;
    if (filterType === 'OUT') return p.stock <= 0 || p.status === 'out_of_stock';
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
            All Stock ({products.length})
          </button>
          <button
            type="button"
            className={`ps-toolbar-pill ${filterType === 'LOW' ? 'is-active' : ''}`}
            onClick={() => setFilterType('LOW')}
          >
            Low Stock (&le; 5)
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

      {loading ? (
        <div className="ps-admin-loading">Loading Inventory...</div>
      ) : (
        <div className="ps-admin-table-container">
          <table className="ps-admin-products-table">
            <thead>
              <tr>
                <th>Flacon</th>
                <th>Product</th>
                <th>Category</th>
                <th>Price</th>
                <th>Current Stock</th>
                <th>Status</th>
                <th>Quick Adjust</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((prod) => (
                <tr key={prod.id}>
                  <td>
                    <img src={prod.main_image || prod.image} alt={prod.name} className="ps-prod-table-thumb" />
                  </td>
                  <td>
                    <strong>{prod.name}</strong>
                    <div style={{ fontSize: 11, color: 'var(--color-muted)' }}>{prod.sku}</div>
                  </td>
                  <td>{prod.category}</td>
                  <td>
                    <strong style={{ color: 'var(--color-gold-bright)' }}>{formatINR(prod.price)}</strong>
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input
                        type="number"
                        defaultValue={prod.stock}
                        key={prod.stock}
                        onBlur={(e) => handleDirectSetStock(prod, e.target.value)}
                        style={{
                          width: 60,
                          padding: '4px 6px',
                          background: '#050505',
                          border: '1px solid var(--color-border)',
                          color: '#fff',
                          textAlign: 'center',
                          borderRadius: 3,
                        }}
                      />
                      <span style={{ fontSize: 11, color: 'var(--color-muted)' }}>Flacons</span>
                    </div>
                  </td>
                  <td>
                    <span
                      className={`ps-status-pill ${
                        prod.stock <= 0
                          ? 'ps-status-cancelled'
                          : prod.stock <= 5
                          ? 'ps-status-pending'
                          : 'ps-status-delivered'
                      }`}
                    >
                      {prod.stock <= 0 ? 'OUT OF STOCK' : prod.stock <= 5 ? 'LOW STOCK' : 'OPTIMAL'}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        type="button"
                        className="ps-action-icon-btn"
                        onClick={() => handleAdjustStock(prod, -1)}
                        title="Reduce Stock by 1"
                      >
                        <Minus size={14} />
                      </button>
                      <button
                        type="button"
                        className="ps-action-icon-btn"
                        onClick={() => handleAdjustStock(prod, 1)}
                        title="Increase Stock by 1"
                      >
                        <Plus size={14} />
                      </button>
                      <button
                        type="button"
                        className="ps-action-icon-btn"
                        onClick={() => handleAdjustStock(prod, 10)}
                        title="Add 10 Flacons Batch"
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
