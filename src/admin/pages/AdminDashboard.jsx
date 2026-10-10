import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  ShoppingBag,
  IndianRupee,
  Package,
  Users,
  Crown,
  FileText,
  AlertTriangle,
  Plus,
  Grid,
  Image,
  Film,
  Settings,
  ArrowRight,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import {
  getDashboardMetrics,
  getBestSellingProducts,
  getRecentOrders,
  getLowStockProducts,
} from '../services/dashboardService';
import { formatINR } from '../../utils/formatCurrency';
import AdminPageContainer from '../components/AdminPageContainer';
import './AdminDashboard.css';

export default function AdminDashboard() {
  const [metrics, setMetrics] = useState({
    totalOrders: 0,
    totalRevenue: 0,
    totalProducts: 0,
    totalCustomers: 0,
  });
  const [bestSellers, setBestSellers] = useState([]);
  const [recentOrders, setRecentOrders] = useState([]);
  const [lowStock, setLowStock] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState(null);

  const loadData = async () => {
    setLoading(true);
    setErrorMessage(null);

    try {
      const [metricsRes, bestSellersRes, recentOrdersRes, lowStockRes] = await Promise.all([
        getDashboardMetrics(),
        getBestSellingProducts(),
        getRecentOrders(5),
        getLowStockProducts(),
      ]);

      if (metricsRes.error) {
        setErrorMessage(metricsRes.error);
      } else {
        setMetrics(metricsRes.data);
      }

      setBestSellers(bestSellersRes.data || []);
      setRecentOrders(recentOrdersRes.data || []);
      setLowStock(lowStockRes.data || []);
    } catch {
      setErrorMessage('Unable to load dashboard data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let mounted = true;

    async function fetchDashboardData() {
      try {
        const [metricsRes, bestSellersRes, recentOrdersRes, lowStockRes] = await Promise.all([
          getDashboardMetrics(),
          getBestSellingProducts(),
          getRecentOrders(5),
          getLowStockProducts(),
        ]);

        if (!mounted) return;

        if (metricsRes.error) {
          setErrorMessage(metricsRes.error);
        } else {
          setMetrics(metricsRes.data);
        }

        setBestSellers(bestSellersRes.data || []);
        setRecentOrders(recentOrdersRes.data || []);
        setLowStock(lowStockRes.data || []);
      } catch {
        if (mounted) {
          setErrorMessage('Unable to load dashboard data. Please try again.');
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    fetchDashboardData();

    return () => {
      mounted = false;
    };
  }, []);

  // Premium Skeleton Loader
  if (loading) {
    return (
      <AdminPageContainer maxWidth="1400px">
        <div className="ps-admin-dashboard-view">
          <div className="ps-dash-header-row">
            <div>
              <div className="ps-skeleton ps-skeleton-title" style={{ width: '200px', height: '28px' }} />
              <div className="ps-skeleton ps-skeleton-subtitle" style={{ width: '280px', height: '14px', marginTop: '6px' }} />
            </div>
          </div>

          <div className="ps-dash-kpi-grid">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="ps-kpi-card ps-skeleton-card">
                <div className="ps-skeleton" style={{ width: '40px', height: '40px', borderRadius: '50%' }} />
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div className="ps-skeleton" style={{ width: '90px', height: '11px' }} />
                  <div className="ps-skeleton" style={{ width: '110px', height: '22px' }} />
                </div>
              </div>
            ))}
          </div>

          <div className="ps-dash-main-grid">
            <div className="ps-dash-panel ps-skeleton-panel" style={{ minHeight: '280px' }} />
            <div className="ps-dash-panel ps-skeleton-panel" style={{ minHeight: '280px' }} />
          </div>
        </div>
      </AdminPageContainer>
    );
  }

  return (
    <AdminPageContainer maxWidth="1400px">
      <div className="ps-admin-dashboard-view">
        {/* Error Notification Banner if query failed */}
        {errorMessage && (
          <div className="ps-dash-error-banner" role="alert">
            <div className="ps-dash-error-left">
              <AlertCircle size={18} className="ps-dash-error-icon" />
              <span>{errorMessage}</span>
            </div>
            <button
              type="button"
              className="ps-dash-retry-btn"
              onClick={loadData}
              aria-label="Retry loading data"
            >
              <RefreshCw size={13} />
              <span>Retry</span>
            </button>
          </div>
        )}

        {/* 1. Header Row */}
        <div className="ps-dash-header-row">
          <div>
            <h1 className="ps-dash-heading">Dashboard</h1>
            <p className="ps-dash-subheading">Overview of PS PERFUMES atelier operations and catalog metrics</p>
          </div>

          <div className="ps-dash-header-actions">
            <button
              type="button"
              className="ps-dash-refresh-btn"
              onClick={loadData}
              title="Refresh dashboard data"
              aria-label="Refresh data"
            >
              <RefreshCw size={14} />
              <span>Refresh</span>
            </button>
            <div className="ps-dash-live-badge" title="Live connection to Supabase database">
              <span className="ps-live-pulse-dot" />
              <span className="ps-live-text">Supabase Active</span>
            </div>
          </div>
        </div>

        {/* 2. Top 4 Compact KPI Cards */}
        <div className="ps-dash-kpi-grid">
          {/* Card 1: TOTAL ORDERS */}
          <div className="ps-kpi-card">
            <div className="ps-kpi-left">
              <div className="ps-kpi-icon-circle">
                <ShoppingBag size={18} color="#C9A96E" />
              </div>
              <div className="ps-kpi-meta">
                <span className="ps-kpi-label">Total Orders</span>
                <div className="ps-kpi-number">{metrics.totalOrders.toLocaleString()}</div>
                <span className="ps-kpi-note">Recorded in database</span>
              </div>
            </div>
          </div>

          {/* Card 2: TOTAL REVENUE */}
          <div className="ps-kpi-card">
            <div className="ps-kpi-left">
              <div className="ps-kpi-icon-circle">
                <IndianRupee size={18} color="#C9A96E" />
              </div>
              <div className="ps-kpi-meta">
                <span className="ps-kpi-label">Total Revenue</span>
                <div className="ps-kpi-number">{formatINR(metrics.totalRevenue)}</div>
                <span className="ps-kpi-note">Settled / paid orders</span>
              </div>
            </div>
          </div>

          {/* Card 3: TOTAL PRODUCTS */}
          <div className="ps-kpi-card">
            <div className="ps-kpi-left">
              <div className="ps-kpi-icon-circle">
                <Package size={18} color="#C9A96E" />
              </div>
              <div className="ps-kpi-meta">
                <span className="ps-kpi-label">Total Products</span>
                <div className="ps-kpi-number">{metrics.totalProducts.toLocaleString()}</div>
                <span className="ps-kpi-note">Active catalog formulations</span>
              </div>
            </div>
          </div>

          {/* Card 4: TOTAL CUSTOMERS */}
          <div className="ps-kpi-card">
            <div className="ps-kpi-left">
              <div className="ps-kpi-icon-circle">
                <Users size={18} color="#C9A96E" />
              </div>
              <div className="ps-kpi-meta">
                <span className="ps-kpi-label">Total Customers</span>
                <div className="ps-kpi-number">{metrics.totalCustomers.toLocaleString()}</div>
                <span className="ps-kpi-note">Registered clientele accounts</span>
              </div>
            </div>
          </div>
        </div>

        {/* 3. Primary Sections: Best Selling Products & Recent Orders */}
        <div className="ps-dash-main-grid">
          {/* Best Selling Products */}
          <div className="ps-dash-panel">
            <div className="ps-panel-header">
              <div className="ps-panel-title-with-icon">
                <Crown size={17} color="#C9A96E" />
                <h2 className="ps-panel-title">Best Selling Products</h2>
              </div>
              <Link to="/admin/products" className="ps-panel-action-link">
                View Catalog
              </Link>
            </div>

            {bestSellers.length === 0 ? (
              <div className="ps-panel-empty-state">
                <Crown size={26} className="ps-empty-icon" />
                <p className="ps-empty-message">No sales recorded yet.</p>
                <span className="ps-empty-subtext">
                  Best selling fragrances will populate automatically as customer orders are fulfilled.
                </span>
              </div>
            ) : (
              <div className="ps-table-scroll-container">
                <table className="ps-dash-table">
                  <thead>
                    <tr>
                      <th style={{ width: '40px' }}>#</th>
                      <th>Product</th>
                      <th>Category</th>
                      <th>Units Sold</th>
                      <th>Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bestSellers.map((item) => (
                      <tr key={item.id || item.rank}>
                        <td className="ps-td-rank-cell">
                          <span className={`ps-rank-circle is-${item.rankType}`}>{item.rank}</span>
                        </td>
                        <td className="ps-td-product">
                          <img src={item.image} alt={item.name} className="ps-td-thumb" />
                          <span className="ps-td-prod-name">{item.name}</span>
                        </td>
                        <td className="ps-td-cat">{item.category}</td>
                        <td className="ps-td-sold">
                          <strong>{item.sold}</strong>
                        </td>
                        <td className="ps-td-revenue">
                          <strong>{formatINR(item.revenue)}</strong>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Recent Orders */}
          <div className="ps-dash-panel">
            <div className="ps-panel-header">
              <div className="ps-panel-title-with-icon">
                <FileText size={17} color="#C9A96E" />
                <h2 className="ps-panel-title">Recent Orders</h2>
              </div>
              <Link to="/admin/orders" className="ps-panel-action-link">
                View All Orders
              </Link>
            </div>

            {recentOrders.length === 0 ? (
              <div className="ps-panel-empty-state">
                <FileText size={26} className="ps-empty-icon" />
                <p className="ps-empty-message">No orders registered yet.</p>
                <span className="ps-empty-subtext">
                  Client purchase dispatches will appear here in realtime once placed.
                </span>
              </div>
            ) : (
              <div className="ps-table-scroll-container">
                <table className="ps-dash-table">
                  <thead>
                    <tr>
                      <th>Order #</th>
                      <th>Customer</th>
                      <th>Date</th>
                      <th>Total</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentOrders.map((ord) => (
                      <tr key={ord.id}>
                        <td>
                          <Link to="/admin/orders" className="ps-td-order-link">
                            {ord.order_number || `#${ord.id.slice(0, 8)}`}
                          </Link>
                        </td>
                        <td className="ps-td-client-name">
                          {ord.customer_name || ord.email || 'Client'}
                        </td>
                        <td className="ps-td-date">
                          {ord.created_at ? new Date(ord.created_at).toLocaleDateString() : '—'}
                        </td>
                        <td className="ps-td-amount">
                          <strong>{formatINR(ord.total || 0)}</strong>
                        </td>
                        <td>
                          <span className={`ps-order-status-badge is-${(ord.order_status || 'pending').toLowerCase()}`}>
                            {ord.order_status || 'pending'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* 4. Secondary Sections: Low Stock Products & Quick Actions */}
        <div className="ps-dash-secondary-grid">
          {/* Low Stock Products */}
          <div className="ps-dash-panel">
            <div className="ps-panel-header">
              <div className="ps-panel-title-with-icon">
                <AlertTriangle size={17} color="#C9A96E" />
                <h2 className="ps-panel-title">Low Stock Products</h2>
              </div>
              <Link to="/admin/inventory" className="ps-panel-action-link">
                Inventory
              </Link>
            </div>

            {lowStock.length === 0 ? (
              <div className="ps-panel-empty-state is-compact">
                <span className="ps-stock-sufficient-check">✓</span>
                <p className="ps-empty-message">All products are sufficiently stocked.</p>
                <span className="ps-empty-subtext">No variants are below the threshold of 5 units.</span>
              </div>
            ) : (
              <div className="ps-table-scroll-container">
                <table className="ps-dash-table is-compact">
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Variant</th>
                      <th>Stock</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lowStock.map((item, idx) => (
                      <tr key={item.id || idx}>
                        <td className="ps-td-product">
                          <img src={item.image} alt={item.name} className="ps-td-thumb-sm" />
                          <span className="ps-td-prod-name">{item.name}</span>
                        </td>
                        <td className="ps-td-variant">{item.variant}</td>
                        <td className="ps-td-stock-num">
                          <strong>{item.stock}</strong>
                        </td>
                        <td>
                          <span
                            className={`ps-stock-status-pill ${
                              item.status === 'Out of Stock' ? 'is-out' : 'is-low'
                            }`}
                          >
                            {item.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Quick Actions */}
          <div className="ps-dash-panel ps-dash-quickactions-panel">
            <div className="ps-panel-header">
              <div className="ps-panel-title-with-icon">
                <h2 className="ps-panel-title">Quick Actions</h2>
              </div>
            </div>

            <div className="ps-quick-actions-grid">
              {/* 1. Add Product */}
              <Link to="/admin/products/new" className="ps-quick-btn">
                <div className="ps-quick-btn-icon">
                  <Plus size={16} />
                </div>
                <div className="ps-quick-btn-content">
                  <span className="ps-quick-btn-title">Add Product</span>
                  <span className="ps-quick-btn-desc">Create formulation</span>
                </div>
                <ArrowRight size={14} className="ps-quick-btn-arrow" />
              </Link>

              {/* 2. Manage Categories */}
              <Link to="/admin/categories" className="ps-quick-btn">
                <div className="ps-quick-btn-icon">
                  <Grid size={16} />
                </div>
                <div className="ps-quick-btn-content">
                  <span className="ps-quick-btn-title">Manage Categories</span>
                  <span className="ps-quick-btn-desc">Olfactive families</span>
                </div>
                <ArrowRight size={14} className="ps-quick-btn-arrow" />
              </Link>

              {/* 3. View Orders */}
              <Link to="/admin/orders" className="ps-quick-btn">
                <div className="ps-quick-btn-icon">
                  <FileText size={16} />
                </div>
                <div className="ps-quick-btn-content">
                  <span className="ps-quick-btn-title">View Orders</span>
                  <span className="ps-quick-btn-desc">Dispatch management</span>
                </div>
                <ArrowRight size={14} className="ps-quick-btn-arrow" />
              </Link>

              {/* 4. Update Hero Section */}
              <Link to="/admin/hero" className="ps-quick-btn">
                <div className="ps-quick-btn-icon">
                  <Image size={16} />
                </div>
                <div className="ps-quick-btn-content">
                  <span className="ps-quick-btn-title">Update Hero Section</span>
                  <span className="ps-quick-btn-desc">Hero banners & slides</span>
                </div>
                <ArrowRight size={14} className="ps-quick-btn-arrow" />
              </Link>

              {/* 5. Upload Reel */}
              <Link to="/admin/reels" className="ps-quick-btn">
                <div className="ps-quick-btn-icon">
                  <Film size={16} />
                </div>
                <div className="ps-quick-btn-content">
                  <span className="ps-quick-btn-title">Upload Reel</span>
                  <span className="ps-quick-btn-desc">Instagram video feed</span>
                </div>
                <ArrowRight size={14} className="ps-quick-btn-arrow" />
              </Link>

              {/* 6. Store Settings */}
              <Link to="/admin/settings" className="ps-quick-btn">
                <div className="ps-quick-btn-icon">
                  <Settings size={16} />
                </div>
                <div className="ps-quick-btn-content">
                  <span className="ps-quick-btn-title">Store Settings</span>
                  <span className="ps-quick-btn-desc">Brand & shipping</span>
                </div>
                <ArrowRight size={14} className="ps-quick-btn-arrow" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </AdminPageContainer>
  );
}
