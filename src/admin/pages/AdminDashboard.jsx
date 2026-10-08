import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  ShoppingBag,
  IndianRupee,
  Package,
  Users,
  ArrowRight,
  Crown,
  BarChart3,
  AlertTriangle,
  Zap,
  AlertCircle,
  RefreshCw,
  Image,
  Layout,
  PlayCircle,
  Layers,
  FileText,
  Star,
  Tag,
  Settings,
  Grid,
} from 'lucide-react';
import {
  getDashboardMetrics,
  getBestSellingProducts,
  getProductTypeDistribution,
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
  const [distribution, setDistribution] = useState(null);
  const [lowStock, setLowStock] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState(null);

  const loadData = async () => {
    setLoading(true);
    setErrorMessage(null);

    try {
      const [metricsRes, bestSellersRes, distRes, lowStockRes] = await Promise.all([
        getDashboardMetrics(),
        getBestSellingProducts(),
        getProductTypeDistribution(),
        getLowStockProducts(),
      ]);

      if (metricsRes.error) {
        setErrorMessage(metricsRes.error);
      } else {
        setMetrics(metricsRes.data);
      }

      setBestSellers(bestSellersRes.data || []);
      setDistribution(distRes.data || null);
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
        const [metricsRes, bestSellersRes, distRes, lowStockRes] = await Promise.all([
          getDashboardMetrics(),
          getBestSellingProducts(),
          getProductTypeDistribution(),
          getLowStockProducts(),
        ]);

        if (!mounted) return;

        if (metricsRes.error) {
          setErrorMessage(metricsRes.error);
        } else {
          setMetrics(metricsRes.data);
        }

        setBestSellers(bestSellersRes.data || []);
        setDistribution(distRes.data || null);
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
          {/* Header Skeleton */}
          <div className="ps-dash-header-row">
            <div>
              <div className="ps-skeleton ps-skeleton-title" style={{ width: '220px', height: '32px' }} />
              <div className="ps-skeleton ps-skeleton-subtitle" style={{ width: '140px', height: '16px', marginTop: '8px' }} />
            </div>
          </div>

          {/* KPI Skeleton Grid */}
          <div className="ps-dash-kpi-grid">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="ps-kpi-card ps-skeleton-card">
                <div className="ps-skeleton" style={{ width: '40px', height: '40px', borderRadius: '50%' }} />
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div className="ps-skeleton" style={{ width: '90px', height: '12px' }} />
                  <div className="ps-skeleton" style={{ width: '110px', height: '24px' }} />
                </div>
              </div>
            ))}
          </div>

          {/* Middle Panels Skeleton */}
          <div className="ps-dash-middle-grid">
            <div className="ps-dash-panel ps-skeleton-panel" style={{ minHeight: '340px' }}>
              <div className="ps-skeleton" style={{ width: '180px', height: '20px', marginBottom: '20px' }} />
              <div className="ps-skeleton" style={{ width: '100%', height: '45px', marginBottom: '10px' }} />
              <div className="ps-skeleton" style={{ width: '100%', height: '45px', marginBottom: '10px' }} />
              <div className="ps-skeleton" style={{ width: '100%', height: '45px' }} />
            </div>
            <div className="ps-dash-right-stack">
              <div className="ps-dash-panel ps-skeleton-panel" style={{ minHeight: '160px' }}>
                <div className="ps-skeleton" style={{ width: '160px', height: '18px', marginBottom: '16px' }} />
                <div className="ps-skeleton" style={{ width: '100%', height: '80px' }} />
              </div>
              <div className="ps-dash-panel ps-skeleton-panel" style={{ minHeight: '160px' }}>
                <div className="ps-skeleton" style={{ width: '150px', height: '18px', marginBottom: '16px' }} />
                <div className="ps-skeleton" style={{ width: '100%', height: '80px' }} />
              </div>
            </div>
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

        {/* 1. Dashboard Header Row */}
        <div className="ps-dash-header-row">
          <div className="ps-dash-title-group">
            <div className="ps-dash-flourish-wrap" aria-hidden="true">
              <svg
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="ps-dash-flourish-icon"
              >
                <path
                  d="M12 2C12 2 13.5 6.5 17.5 8C21.5 9.5 22 13 22 13C22 13 18.5 12 16 14C13.5 16 13 22 13 22C13 22 11.5 17.5 7.5 16C3.5 14.5 2 11 2 11C2 11 5.5 12 8 10C10.5 8 12 2 12 2Z"
                  fill="#C9A96E"
                  opacity="0.9"
                />
              </svg>
            </div>
            <div>
              <h1 className="ps-dash-heading">DASHBOARD</h1>
              <p className="ps-dash-subheading">Welcome back</p>
            </div>
          </div>

          <div className="ps-dash-live-badge" title="Connected to Supabase production database">
            <span className="ps-live-pulse-dot" />
            <span className="ps-live-text">Realtime Supabase</span>
          </div>
        </div>

        {/* 2. Top 4 KPI Cards (Horizontal Row) — 100% Real Database Counts */}
        <div className="ps-dash-kpi-grid">
          {/* Card 1: TOTAL ORDERS */}
          <div className="ps-kpi-card">
            <div className="ps-kpi-left">
              <div className="ps-kpi-icon-circle">
                <ShoppingBag size={18} color="#C9A96E" />
              </div>
              <div className="ps-kpi-meta">
                <span className="ps-kpi-label">TOTAL ORDERS</span>
                <div className="ps-kpi-number">{metrics.totalOrders.toLocaleString()}</div>
                <span className="ps-kpi-note">Recorded in database</span>
              </div>
            </div>
            <div className="ps-kpi-bg-graphic is-orders-art" />
          </div>

          {/* Card 2: TOTAL REVENUE */}
          <div className="ps-kpi-card">
            <div className="ps-kpi-left">
              <div className="ps-kpi-icon-circle">
                <IndianRupee size={18} color="#C9A96E" />
              </div>
              <div className="ps-kpi-meta">
                <span className="ps-kpi-label">TOTAL REVENUE</span>
                <div className="ps-kpi-number">{formatINR(metrics.totalRevenue)}</div>
                <span className="ps-kpi-note">Settled / paid orders</span>
              </div>
            </div>
            <div className="ps-kpi-bg-graphic is-revenue-art" />
          </div>

          {/* Card 3: PRODUCTS */}
          <div className="ps-kpi-card">
            <div className="ps-kpi-left">
              <div className="ps-kpi-icon-circle">
                <Package size={18} color="#C9A96E" />
              </div>
              <div className="ps-kpi-meta">
                <span className="ps-kpi-label">PRODUCTS</span>
                <div className="ps-kpi-number">{metrics.totalProducts.toLocaleString()}</div>
                <span className="ps-kpi-note">Active fragrance catalog</span>
              </div>
            </div>
            <div className="ps-kpi-bg-graphic is-products-art" />
          </div>

          {/* Card 4: CUSTOMERS */}
          <div className="ps-kpi-card">
            <div className="ps-kpi-left">
              <div className="ps-kpi-icon-circle">
                <Users size={18} color="#C9A96E" />
              </div>
              <div className="ps-kpi-meta">
                <span className="ps-kpi-label">CUSTOMERS</span>
                <div className="ps-kpi-number">{metrics.totalCustomers.toLocaleString()}</div>
                <span className="ps-kpi-note">Registered clientele</span>
              </div>
            </div>
            <div className="ps-kpi-bg-graphic is-customers-art" />
          </div>
        </div>

        {/* 3. Main Content Grid (Two Columns: Best Sellers + Right Stack) */}
        <div className="ps-dash-middle-grid">
          {/* Left Column: Best Selling Products Table */}
          <div className="ps-dash-panel ps-dash-bestsellers-panel">
            <div className="ps-panel-header">
              <div className="ps-panel-title-with-icon">
                <Crown size={18} color="#C9A96E" />
                <h2 className="ps-panel-title">Best Selling Products</h2>
              </div>
            </div>

            {bestSellers.length === 0 ? (
              <div className="ps-panel-empty-state">
                <Crown size={28} className="ps-empty-icon" />
                <p className="ps-empty-message">No sales data yet.</p>
                <span className="ps-empty-subtext">
                  Best selling fragrances will populate automatically as customer orders are fulfilled.
                </span>
              </div>
            ) : (
              <div className="ps-table-scroll-container">
                <table className="ps-dash-table">
                  <thead>
                    <tr>
                      <th style={{ width: '42px' }}>#</th>
                      <th>Product</th>
                      <th>Category</th>
                      <th>Bottle Type</th>
                      <th>Size</th>
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
                        <td className="ps-td-type">{item.type}</td>
                        <td className="ps-td-size">{item.size}</td>
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

          {/* Right Column: Product Type Distribution & Low Stock */}
          <div className="ps-dash-right-stack">
            {/* Card A: Product Type Distribution */}
            <div className="ps-dash-panel ps-dash-distribution-panel">
              <div className="ps-panel-header">
                <div className="ps-panel-title-with-icon">
                  <BarChart3 size={18} color="#C9A96E" />
                  <h2 className="ps-panel-title">Product Type Distribution</h2>
                </div>
              </div>

              {!distribution || distribution.total === 0 ? (
                <div className="ps-panel-empty-state is-compact">
                  <BarChart3 size={24} className="ps-empty-icon" />
                  <p className="ps-empty-message">No data available</p>
                </div>
              ) : (
                <div className="ps-distribution-cards-row">
                  {/* Glass Bottle Card */}
                  <div className="ps-dist-mini-card">
                    <div className="ps-dist-img-box">
                      <img
                        src="/assets/prod-royal-amber.webp"
                        alt="Glass Bottle"
                        className="ps-dist-img"
                      />
                    </div>
                    <div className="ps-dist-meta">
                      <span className="ps-dist-name">Glass Bottle</span>
                      <span className="ps-dist-qty">{distribution.glass.count} Products</span>
                      <div className="ps-dist-bar-row">
                        <div className="ps-dist-bar-wrap">
                          <div
                            className="ps-dist-bar-fill"
                            style={{ width: `${distribution.glass.percent}%` }}
                          />
                        </div>
                        <span className="ps-dist-percent">{distribution.glass.percent}%</span>
                      </div>
                    </div>
                  </div>

                  {/* PVC Bottle Card */}
                  <div className="ps-dist-mini-card">
                    <div className="ps-dist-img-box">
                      <img
                        src="/assets/prod-noir-absolu.webp"
                        alt="PVC Bottle"
                        className="ps-dist-img"
                      />
                    </div>
                    <div className="ps-dist-meta">
                      <span className="ps-dist-name">PVC Bottle</span>
                      <span className="ps-dist-qty">{distribution.pvc.count} Products</span>
                      <div className="ps-dist-bar-row">
                        <div className="ps-dist-bar-wrap">
                          <div
                            className="ps-dist-bar-fill"
                            style={{ width: `${distribution.pvc.percent}%` }}
                          />
                        </div>
                        <span className="ps-dist-percent">{distribution.pvc.percent}%</span>
                      </div>
                    </div>
                  </div>

                  {/* Combo Products Card */}
                  <div className="ps-dist-mini-card">
                    <div className="ps-dist-img-box">
                      <img
                        src="/assets/combo-oud-trio.webp"
                        alt="Combo Products"
                        className="ps-dist-img"
                      />
                    </div>
                    <div className="ps-dist-meta">
                      <span className="ps-dist-name">Combo Products</span>
                      <span className="ps-dist-qty">{distribution.combo.count} Products</span>
                      <div className="ps-dist-bar-row">
                        <div className="ps-dist-bar-wrap">
                          <div
                            className="ps-dist-bar-fill"
                            style={{ width: `${distribution.combo.percent}%` }}
                          />
                        </div>
                        <span className="ps-dist-percent">{distribution.combo.percent}%</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Card B: Low Stock Products Table */}
            <div className="ps-dash-panel ps-dash-lowstock-panel">
              <div className="ps-panel-header">
                <div className="ps-panel-title-with-icon">
                  <AlertTriangle size={18} color="#C9A96E" />
                  <h2 className="ps-panel-title">Low Stock Products</h2>
                </div>
              </div>

              {lowStock.length === 0 ? (
                <div className="ps-panel-empty-state is-compact">
                  <span className="ps-stock-sufficient-check">✓</span>
                  <p className="ps-empty-message">All products are sufficiently stocked.</p>
                </div>
              ) : (
                <div className="ps-lowstock-table-wrap">
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
                          <td className="ps-td-stock-num">{item.stock}</td>
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
          </div>
        </div>

        {/* 4. Quick Management Section */}
        <div className="ps-dash-quick-cards-section">
          <div className="ps-quick-section-header">
            <Zap size={18} color="#C9A96E" />
            <h2 className="ps-quick-main-title">Quick Management</h2>
          </div>

          <div className="ps-quick-modular-grid">
            {/* 1. Hero Sections */}
            <div className="ps-quick-item-card">
              <div className="ps-quick-icon-wrapper">
                <Image size={20} color="#C9A96E" />
              </div>
              <div className="ps-quick-details">
                <h3 className="ps-quick-title">Hero Sections</h3>
                <p className="ps-quick-desc">Manage hero banners and slider slides</p>
              </div>
              <Link to="/admin/hero" className="ps-quick-action-link" aria-label="Hero Sections">
                <ArrowRight size={15} />
              </Link>
            </div>

            {/* 2. Homepage */}
            <div className="ps-quick-item-card">
              <div className="ps-quick-icon-wrapper">
                <Layout size={20} color="#C9A96E" />
              </div>
              <div className="ps-quick-details">
                <h3 className="ps-quick-title">Homepage</h3>
                <p className="ps-quick-desc">Configure sections and promotional blocks</p>
              </div>
              <Link to="/admin/homepage" className="ps-quick-action-link" aria-label="Homepage">
                <ArrowRight size={15} />
              </Link>
            </div>

            {/* 3. Instagram Reels */}
            <div className="ps-quick-item-card">
              <div className="ps-quick-icon-wrapper">
                <PlayCircle size={20} color="#C9A96E" />
              </div>
              <div className="ps-quick-details">
                <h3 className="ps-quick-title">Instagram Reels</h3>
                <p className="ps-quick-desc">Manage curated storefront video feeds</p>
              </div>
              <Link to="/admin/reels" className="ps-quick-action-link" aria-label="Instagram Reels">
                <ArrowRight size={15} />
              </Link>
            </div>

            {/* 4. Products */}
            <div className="ps-quick-item-card">
              <div className="ps-quick-icon-wrapper">
                <Package size={20} color="#C9A96E" />
              </div>
              <div className="ps-quick-details">
                <h3 className="ps-quick-title">Products</h3>
                <p className="ps-quick-desc">Fragrance inventory and variant attributes</p>
              </div>
              <Link to="/admin/products" className="ps-quick-action-link" aria-label="Products">
                <ArrowRight size={15} />
              </Link>
            </div>

            {/* 5. Categories */}
            <div className="ps-quick-item-card">
              <div className="ps-quick-icon-wrapper">
                <Grid size={20} color="#C9A96E" />
              </div>
              <div className="ps-quick-details">
                <h3 className="ps-quick-title">Categories</h3>
                <p className="ps-quick-desc">Fragrance families and olfactive notes</p>
              </div>
              <Link to="/admin/categories" className="ps-quick-action-link" aria-label="Categories">
                <ArrowRight size={15} />
              </Link>
            </div>

            {/* 6. Combos */}
            <div className="ps-quick-item-card">
              <div className="ps-quick-icon-wrapper">
                <Layers size={20} color="#C9A96E" />
              </div>
              <div className="ps-quick-details">
                <h3 className="ps-quick-title">Combos</h3>
                <p className="ps-quick-desc">Curated gift sets and pairing bundles</p>
              </div>
              <Link to="/admin/combos" className="ps-quick-action-link" aria-label="Combos">
                <ArrowRight size={15} />
              </Link>
            </div>

            {/* 7. Orders */}
            <div className="ps-quick-item-card">
              <div className="ps-quick-icon-wrapper">
                <FileText size={20} color="#C9A96E" />
              </div>
              <div className="ps-quick-details">
                <h3 className="ps-quick-title">Orders</h3>
                <p className="ps-quick-desc">Customer purchases, shipping and invoices</p>
              </div>
              <Link to="/admin/orders" className="ps-quick-action-link" aria-label="Orders">
                <ArrowRight size={15} />
              </Link>
            </div>

            {/* 8. Customers */}
            <div className="ps-quick-item-card">
              <div className="ps-quick-icon-wrapper">
                <Users size={20} color="#C9A96E" />
              </div>
              <div className="ps-quick-details">
                <h3 className="ps-quick-title">Customers</h3>
                <p className="ps-quick-desc">Client profiles, orders and communication</p>
              </div>
              <Link to="/admin/customers" className="ps-quick-action-link" aria-label="Customers">
                <ArrowRight size={15} />
              </Link>
            </div>

            {/* 9. Reviews */}
            <div className="ps-quick-item-card">
              <div className="ps-quick-icon-wrapper">
                <Star size={20} color="#C9A96E" />
              </div>
              <div className="ps-quick-details">
                <h3 className="ps-quick-title">Reviews</h3>
                <p className="ps-quick-desc">Client feedback and testimonial approvals</p>
              </div>
              <Link to="/admin/reviews" className="ps-quick-action-link" aria-label="Reviews">
                <ArrowRight size={15} />
              </Link>
            </div>

            {/* 10. Coupons */}
            <div className="ps-quick-item-card">
              <div className="ps-quick-icon-wrapper">
                <Tag size={20} color="#C9A96E" />
              </div>
              <div className="ps-quick-details">
                <h3 className="ps-quick-title">Coupons</h3>
                <p className="ps-quick-desc">Promotional voucher discounts and perks</p>
              </div>
              <Link to="/admin/coupons" className="ps-quick-action-link" aria-label="Coupons">
                <ArrowRight size={15} />
              </Link>
            </div>

            {/* 11. Store Settings */}
            <div className="ps-quick-item-card">
              <div className="ps-quick-icon-wrapper">
                <Settings size={20} color="#C9A96E" />
              </div>
              <div className="ps-quick-details">
                <h3 className="ps-quick-title">Store Settings</h3>
                <p className="ps-quick-desc">Brand assets, shipping policies and contact info</p>
              </div>
              <Link to="/admin/settings" className="ps-quick-action-link" aria-label="Store Settings">
                <ArrowRight size={15} />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </AdminPageContainer>
  );
}
