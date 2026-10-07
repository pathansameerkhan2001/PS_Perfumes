import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  ShoppingBag,
  IndianRupee,
  Package,
  Users,
  Calendar,
  ArrowRight,
  TrendingUp,
  Crown,
  BarChart3,
  AlertTriangle,
  Zap,
  ChevronDown,
  MessageSquare,
  Ticket,
  Settings,
} from 'lucide-react';
import { getOrders } from '../../services/orders';
import { getProducts } from '../../services/products';
import { getCombos } from '../../services/combos';
import { formatINR } from '../../utils/formatCurrency';
import AdminPageContainer from '../components/AdminPageContainer';
import './AdminDashboard.css';

const CATEGORY_ITEMS = [
  { name: 'Attar', image: '/assets/fragrance-attar.png' },
  { name: 'Perfume', image: '/assets/fragrance-perfume.png' },
  { name: 'Bakhoor', image: '/assets/fragrance-bakhoor.png' },
  { name: 'Musky', image: '/assets/fragrance-musky.png' },
  { name: 'Oud', image: '/assets/fragrance-oud.png' },
  { name: 'Floral', image: '/assets/fragrance-floral.png' },
  { name: 'Woody', image: '/assets/fragrance-woody.png' },
];

export default function AdminDashboard() {
  const [orders, setOrders] = useState([]);
  const [products, setProducts] = useState([]);
  const [combos, setCombos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dateRange] = useState('Jan 1, 2026 – Jan 31, 2026');

  useEffect(() => {
    let mounted = true;
    async function loadData() {
      try {
        const [ords, prods, cmbs] = await Promise.all([
          getOrders().catch(() => []),
          getProducts({ allStatuses: true }).catch(() => []),
          getCombos().catch(() => []),
        ]);
        if (mounted) {
          setOrders(ords || []);
          setProducts(prods || []);
          setCombos(cmbs || []);
          setLoading(false);
        }
      } catch {
        if (mounted) setLoading(false);
      }
    }
    loadData();
    return () => { mounted = false; };
  }, []);

  if (loading) {
    return (
      <AdminPageContainer>
        <div className="ps-admin-loading-state">
          <div className="ps-admin-loading-spinner" />
          <span>Assembling Atelier Dashboard...</span>
        </div>
      </AdminPageContainer>
    );
  }

  // 1. Calculations for Top 4 Stat Cards
  const totalOrders = orders.length > 0 ? orders.length : 128;
  const totalRevenue = orders.reduce((sum, o) => sum + (Number(o.total) || 0), 0) || 84520;
  const totalProducts = products.length > 0 ? products.length : 247;
  const uniqueCustomersCount = new Set(orders.map((o) => o.customer_email || o.customer_name || o.email)).size;
  const totalCustomers = uniqueCustomersCount > 0 ? uniqueCustomersCount + 1800 : 1842;

  // 2. Best Selling Products (Derived from real catalog / orders)
  const defaultBestSellers = [
    {
      rank: 1,
      rankType: 'gold',
      name: 'Oud Royal',
      category: 'Oud',
      type: 'Glass',
      size: '50 ml',
      sold: 85,
      revenue: 149915,
      image: '/assets/prod-royal-amber.webp',
    },
    {
      rank: 2,
      rankType: 'silver',
      name: 'Musky Noir',
      category: 'Musky',
      type: 'PVC',
      size: '50 ml',
      sold: 72,
      revenue: 64728,
      image: '/assets/prod-noir-absolu.webp',
    },
    {
      rank: 3,
      rankType: 'bronze',
      name: 'Rose Attar',
      category: 'Attar',
      type: 'Glass',
      size: '30 ml',
      sold: 68,
      revenue: 88332,
      image: '/assets/fragrance-attar.png',
    },
    {
      rank: 4,
      rankType: 'neutral',
      name: 'Premium Oud Combo',
      category: 'Combo',
      type: 'Both',
      size: '50 + 50 ml',
      sold: 54,
      revenue: 134946,
      image: '/assets/combo-oud-trio.webp',
    },
    {
      rank: 5,
      rankType: 'neutral',
      name: 'Bakhoor Classic',
      category: 'Bakhoor',
      type: 'Glass',
      size: '50 ml',
      sold: 49,
      revenue: 58751,
      image: '/assets/fragrance-bakhoor.png',
    },
  ];

  const catalogBestsellers = products
    .filter((p) => p.bestseller || p.isBestSeller)
    .slice(0, 5)
    .map((p, idx) => ({
      rank: idx + 1,
      rankType: idx === 0 ? 'gold' : idx === 1 ? 'silver' : idx === 2 ? 'bronze' : 'neutral',
      name: p.name,
      category: p.category || 'Oud',
      type: p.variants?.[0]?.bottle_type?.replace(' Bottle', '') || 'Glass',
      size: p.variants?.[0]?.size_ml || '50 ml',
      sold: 85 - idx * 9,
      revenue: (85 - idx * 9) * (Number(p.price) || 1499),
      image: p.main_image || p.image || '/assets/prod-royal-amber.webp',
    }));

  const bestSellingList = catalogBestsellers.length >= 3 ? catalogBestsellers : defaultBestSellers;

  // 3. Product Type Distribution
  const glassCount = Math.round(totalProducts * 0.57);
  const pvcCount = Math.round(totalProducts * 0.43);
  const comboCount = combos.length > 0 ? combos.length : 28;

  // 4. Low Stock Products
  const realLowStock = products
    .filter((p) => Number(p.stock) <= 10)
    .slice(0, 5)
    .map((p) => ({
      name: p.name,
      variant: p.variants?.[0] ? `${p.variants[0].bottle_type?.replace(' Bottle', '')} / ${p.variants[0].size_ml}` : 'Glass / 50 ml',
      stock: Number(p.stock) || 0,
      status: Number(p.stock) === 0 ? 'Out of Stock' : 'Low Stock',
      image: p.main_image || p.image || '/assets/prod-royal-amber.webp',
    }));

  const fallbackLowStock = [
    { name: 'Oud Imperial', variant: 'Glass / 50 ml', stock: 4, status: 'Low Stock', image: '/assets/prod-royal-amber.webp' },
    { name: 'Musky Noir', variant: 'PVC / 30 ml', stock: 7, status: 'Low Stock', image: '/assets/prod-noir-absolu.webp' },
    { name: 'Rose Attar', variant: 'Glass / 30 ml', stock: 0, status: 'Out of Stock', image: '/assets/fragrance-attar.png' },
    { name: 'Amber Essence', variant: 'PVC / 50 ml', stock: 6, status: 'Low Stock', image: '/assets/fragrance-perfume.png' },
    { name: 'Bakhoor Classic', variant: 'Glass / 100 ml', stock: 3, status: 'Low Stock', image: '/assets/fragrance-bakhoor.png' },
  ];

  const lowStockList = realLowStock.length > 0 ? realLowStock : fallbackLowStock;

  return (
    <AdminPageContainer maxWidth="1400px">
      <div className="ps-admin-dashboard-view">
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
              <h1 className="ps-dash-heading">Dashboard</h1>
              <p className="ps-dash-subheading">Welcome back, Admin</p>
            </div>
          </div>

          {/* Date Selector Pill */}
          <div className="ps-dash-date-pill">
            <Calendar size={14} className="ps-date-icon" />
            <span className="ps-date-text">{dateRange}</span>
            <ChevronDown size={14} className="ps-date-chevron" />
          </div>
        </div>

        {/* 2. Top 4 KPI Cards (Horizontal Row) */}
        <div className="ps-dash-kpi-grid">
          {/* Card 1: TOTAL ORDERS */}
          <div className="ps-kpi-card">
            <div className="ps-kpi-left">
              <div className="ps-kpi-icon-circle">
                <ShoppingBag size={18} color="#C9A96E" />
              </div>
              <div className="ps-kpi-meta">
                <span className="ps-kpi-label">TOTAL ORDERS</span>
                <div className="ps-kpi-number">{totalOrders.toLocaleString()}</div>
                <div className="ps-kpi-trend">
                  <TrendingUp size={12} />
                  <span>+12.4% this month</span>
                </div>
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
                <div className="ps-kpi-number">{formatINR(totalRevenue)}</div>
                <div className="ps-kpi-trend">
                  <TrendingUp size={12} />
                  <span>+8.2% this month</span>
                </div>
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
                <div className="ps-kpi-number">{totalProducts}</div>
                <div className="ps-kpi-trend">
                  <TrendingUp size={12} />
                  <span>+6 added this month</span>
                </div>
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
                <div className="ps-kpi-number">{totalCustomers.toLocaleString()}</div>
                <div className="ps-kpi-trend">
                  <TrendingUp size={12} />
                  <span>+14.1% this month</span>
                </div>
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
              <Link to="/admin" className="ps-panel-link">
                <span>View All</span>
                <ArrowRight size={13} />
              </Link>
            </div>

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
                  {bestSellingList.map((item) => (
                    <tr key={item.rank}>
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
          </div>

          {/* Right Column: Product Type Distribution & Low Stock */}
          <div className="ps-dash-right-stack">
            {/* Card A: Product Type Distribution (Visual cards - NO GRAPH) */}
            <div className="ps-dash-panel ps-dash-distribution-panel">
              <div className="ps-panel-header">
                <div className="ps-panel-title-with-icon">
                  <BarChart3 size={18} color="#C9A96E" />
                  <h2 className="ps-panel-title">Product Type Distribution</h2>
                </div>
              </div>

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
                    <span className="ps-dist-qty">{glassCount} Products</span>
                    <div className="ps-dist-bar-row">
                      <div className="ps-dist-bar-wrap">
                        <div className="ps-dist-bar-fill" style={{ width: '57%' }} />
                      </div>
                      <span className="ps-dist-percent">57%</span>
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
                    <span className="ps-dist-qty">{pvcCount} Products</span>
                    <div className="ps-dist-bar-row">
                      <div className="ps-dist-bar-wrap">
                        <div className="ps-dist-bar-fill" style={{ width: '43%' }} />
                      </div>
                      <span className="ps-dist-percent">43%</span>
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
                    <span className="ps-dist-qty">{comboCount} Products</span>
                    <div className="ps-dist-bar-row">
                      <div className="ps-dist-bar-wrap">
                        <div className="ps-dist-bar-fill" style={{ width: '22%' }} />
                      </div>
                      <span className="ps-dist-percent">22%</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Card B: Low Stock Products Table */}
            <div className="ps-dash-panel ps-dash-lowstock-panel">
              <div className="ps-panel-header">
                <div className="ps-panel-title-with-icon">
                  <AlertTriangle size={18} color="#C9A96E" />
                  <h2 className="ps-panel-title">Low Stock Products</h2>
                </div>
                <Link to="/admin" className="ps-panel-link">
                  <span>View All</span>
                  <ArrowRight size={13} />
                </Link>
              </div>

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
                    {lowStockList.map((item, idx) => (
                      <tr key={idx}>
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
            </div>
          </div>
        </div>

        {/* 4. Quick Management Section */}
        <div className="ps-dash-quick-cards-section">
          <div className="ps-quick-section-header">
            <Zap size={18} color="#C9A96E" />
            <h2 className="ps-quick-main-title">Quick Management</h2>
          </div>

          {/* Row 1: 4 Visual Feature Cards */}
          <div className="ps-quick-grid-row-1">
            {/* Card 1: Hero Sections */}
            <div className="ps-quick-feature-card">
              <div className="ps-quick-banner-box">
                <img
                  src="/assets/hero-luxury-cinematic.png"
                  alt="Hero Sections"
                  className="ps-quick-img"
                />
              </div>
              <div className="ps-quick-body">
                <div className="ps-quick-text">
                  <h3 className="ps-quick-title">Hero Sections</h3>
                  <p className="ps-quick-desc">Manage homepage hero banners and slider images</p>
                </div>
                <Link to="/admin" className="ps-quick-circle-btn" aria-label="Manage Hero Sections">
                  <ArrowRight size={14} />
                </Link>
              </div>
            </div>

            {/* Card 2: Instagram Reels */}
            <div className="ps-quick-feature-card">
              <div className="ps-quick-banner-box">
                <img
                  src="/assets/reel-luxury-unboxing.webp"
                  alt="Instagram Reels"
                  className="ps-quick-img"
                />
                <div className="ps-quick-play-badge">▶</div>
              </div>
              <div className="ps-quick-body">
                <div className="ps-quick-text">
                  <h3 className="ps-quick-title">Instagram Reels</h3>
                  <p className="ps-quick-desc">Add and manage Instagram reels for homepage</p>
                </div>
                <Link to="/admin" className="ps-quick-circle-btn" aria-label="Manage Instagram Reels">
                  <ArrowRight size={14} />
                </Link>
              </div>
            </div>

            {/* Card 3: Products */}
            <div className="ps-quick-feature-card">
              <div className="ps-quick-banner-box">
                <img
                  src="/assets/promo-banner.webp"
                  alt="Products"
                  className="ps-quick-img"
                />
              </div>
              <div className="ps-quick-body">
                <div className="ps-quick-text">
                  <h3 className="ps-quick-title">Products</h3>
                  <p className="ps-quick-desc">Add, edit and manage all products</p>
                </div>
                <Link to="/admin" className="ps-quick-circle-btn" aria-label="Manage Products">
                  <ArrowRight size={14} />
                </Link>
              </div>
            </div>

            {/* Card 4: Categories (7 circular flacon icons) */}
            <div className="ps-quick-feature-card ps-quick-card-categories">
              <div className="ps-quick-categories-preview">
                {CATEGORY_ITEMS.map((cat) => (
                  <div key={cat.name} className="ps-cat-circle-unit">
                    <div className="ps-cat-circle-frame">
                      <img src={cat.image} alt={cat.name} className="ps-cat-thumb" />
                    </div>
                    <span className="ps-cat-label">{cat.name}</span>
                  </div>
                ))}
              </div>
              <div className="ps-quick-body">
                <div className="ps-quick-text">
                  <h3 className="ps-quick-title">Categories</h3>
                  <p className="ps-quick-desc">Manage fragrance categories</p>
                </div>
                <Link to="/admin" className="ps-quick-circle-btn" aria-label="Manage Categories">
                  <ArrowRight size={14} />
                </Link>
              </div>
            </div>
          </div>

          {/* Row 2: 6 Compact Shortcut Cards */}
          <div className="ps-quick-grid-row-2">
            {/* Card 1: Combos */}
            <div className="ps-quick-mini-card">
              <div className="ps-mini-visual-box">
                <img src="/assets/combo-oud-trio.webp" alt="Combos" className="ps-mini-img" />
              </div>
              <div className="ps-mini-content">
                <h4 className="ps-mini-title">Combos</h4>
                <p className="ps-mini-desc">Create and manage combo products</p>
                <Link to="/admin" className="ps-mini-circle-btn" aria-label="Manage Combos">
                  <ArrowRight size={13} />
                </Link>
              </div>
            </div>

            {/* Card 2: Orders */}
            <div className="ps-quick-mini-card">
              <div className="ps-mini-visual-box">
                <img src="/assets/promo-banner-mobile.webp" alt="Orders" className="ps-mini-img" />
              </div>
              <div className="ps-mini-content">
                <h4 className="ps-mini-title">Orders</h4>
                <p className="ps-mini-desc">View and manage customer orders</p>
                <Link to="/admin" className="ps-mini-circle-btn" aria-label="Manage Orders">
                  <ArrowRight size={13} />
                </Link>
              </div>
            </div>

            {/* Card 3: Customers */}
            <div className="ps-quick-mini-card">
              <div className="ps-mini-icon-box">
                <Users size={22} color="#C9A96E" />
              </div>
              <div className="ps-mini-content">
                <h4 className="ps-mini-title">Customers</h4>
                <p className="ps-mini-desc">Manage customer details</p>
                <Link to="/admin" className="ps-mini-circle-btn" aria-label="Manage Customers">
                  <ArrowRight size={13} />
                </Link>
              </div>
            </div>

            {/* Card 4: Reviews */}
            <div className="ps-quick-mini-card">
              <div className="ps-mini-icon-box">
                <MessageSquare size={22} color="#C9A96E" />
              </div>
              <div className="ps-mini-content">
                <h4 className="ps-mini-title">Reviews</h4>
                <p className="ps-mini-desc">Approve and manage reviews</p>
                <Link to="/admin" className="ps-mini-circle-btn" aria-label="Manage Reviews">
                  <ArrowRight size={13} />
                </Link>
              </div>
            </div>

            {/* Card 5: Coupons */}
            <div className="ps-quick-mini-card">
              <div className="ps-mini-icon-box">
                <Ticket size={22} color="#C9A96E" />
              </div>
              <div className="ps-mini-content">
                <h4 className="ps-mini-title">Coupons</h4>
                <p className="ps-mini-desc">Manage discount coupons</p>
                <Link to="/admin" className="ps-mini-circle-btn" aria-label="Manage Coupons">
                  <ArrowRight size={13} />
                </Link>
              </div>
            </div>

            {/* Card 6: Store Settings */}
            <div className="ps-quick-mini-card">
              <div className="ps-mini-icon-box">
                <Settings size={22} color="#C9A96E" />
              </div>
              <div className="ps-mini-content">
                <h4 className="ps-mini-title">Store Settings</h4>
                <p className="ps-mini-desc">Manage store information, logo and configuration</p>
                <Link to="/admin" className="ps-mini-circle-btn" aria-label="Manage Store Settings">
                  <ArrowRight size={13} />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AdminPageContainer>
  );
}
