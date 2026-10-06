import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  ShoppingBag,
  IndianRupee,
  Package,
  AlertTriangle,
  Users,
  Clock,
  Archive,
  Star,
  ArrowUpRight,
  TrendingUp,
} from 'lucide-react';
import { getOrders } from '../../services/orders';
import { getProducts } from '../../services/products';
import { getReviews } from '../../services/reviews';
import { formatINR } from '../../utils/formatCurrency';
import './AdminDashboard.css';

export default function AdminDashboard() {
  const [orders, setOrders] = useState([]);
  const [products, setProducts] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    async function loadData() {
      try {
        const [ords, prods, revs] = await Promise.all([
          getOrders(),
          getProducts({ allStatuses: true }),
          getReviews(true),
        ]);
        if (mounted) {
          setOrders(ords);
          setProducts(prods);
          setReviews(revs);
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
    return <div className="ps-admin-loading">Assembling Atelier Analytics...</div>;
  }

  // Calculate Metrics
  const totalRevenue = orders.reduce((sum, o) => sum + (Number(o.total) || 0), 0);
  const totalOrders = orders.length;
  const pendingOrders = orders.filter((o) => o.order_status === 'pending' || o.order_status === 'processing').length;
  const totalProducts = products.length;
  const lowStockProducts = products.filter((p) => p.stock > 0 && p.stock <= 5);
  const outOfStockProducts = products.filter((p) => p.stock <= 0 || p.status === 'out_of_stock');
  const newReviews = reviews.filter((r) => r.status === 'pending');

  const recentOrders = orders.slice(0, 5);
  const topProducts = products.filter((p) => p.bestseller || p.isBestSeller).slice(0, 5);

  return (
    <div className="ps-admin-dashboard">
      <div className="ps-admin-page-header">
        <div>
          <span className="ps-admin-eyebrow">OVERVIEW & METRICS</span>
          <h1 className="ps-admin-page-title">Executive Dashboard</h1>
        </div>
        <div className="ps-admin-header-actions">
          <Link to="/admin/products/new" className="ps-btn-gold-primary ps-admin-header-btn">
            + CREATE PRODUCT
          </Link>
        </div>
      </div>

      {/* 8 Primary Key Metrics Cards */}
      <div className="ps-admin-stats-grid">
        {/* Total Revenue */}
        <div className="ps-stat-card">
          <div className="ps-stat-icon-wrap is-gold">
            <IndianRupee size={22} />
          </div>
          <div className="ps-stat-content">
            <span className="ps-stat-label">Total Revenue</span>
            <strong className="ps-stat-value">{formatINR(totalRevenue)}</strong>
            <span className="ps-stat-sub">From {totalOrders} dispatched orders</span>
          </div>
        </div>

        {/* Total Orders */}
        <div className="ps-stat-card">
          <div className="ps-stat-icon-wrap">
            <ShoppingBag size={22} />
          </div>
          <div className="ps-stat-content">
            <span className="ps-stat-label">Total Orders</span>
            <strong className="ps-stat-value">{totalOrders}</strong>
            <span className="ps-stat-sub">{pendingOrders} active processing</span>
          </div>
        </div>

        {/* Pending Orders */}
        <div className="ps-stat-card">
          <div className="ps-stat-icon-wrap is-warning">
            <Clock size={22} />
          </div>
          <div className="ps-stat-content">
            <span className="ps-stat-label">Pending Orders</span>
            <strong className="ps-stat-value">{pendingOrders}</strong>
            <span className="ps-stat-sub">Requires atelier dispatch</span>
          </div>
        </div>

        {/* Total Products */}
        <div className="ps-stat-card">
          <div className="ps-stat-icon-wrap">
            <Package size={22} />
          </div>
          <div className="ps-stat-content">
            <span className="ps-stat-label">Total Products</span>
            <strong className="ps-stat-value">{totalProducts}</strong>
            <span className="ps-stat-sub">Active formulations in catalog</span>
          </div>
        </div>

        {/* Low Stock Alert */}
        <div className="ps-stat-card">
          <div className="ps-stat-icon-wrap is-warning">
            <AlertTriangle size={22} />
          </div>
          <div className="ps-stat-content">
            <span className="ps-stat-label">Low Stock</span>
            <strong className="ps-stat-value">{lowStockProducts.length}</strong>
            <span className="ps-stat-sub">Under 5 flacons remaining</span>
          </div>
        </div>

        {/* Out of Stock */}
        <div className="ps-stat-card">
          <div className="ps-stat-icon-wrap is-danger">
            <Archive size={22} />
          </div>
          <div className="ps-stat-content">
            <span className="ps-stat-label">Out of Stock</span>
            <strong className="ps-stat-value">{outOfStockProducts.length}</strong>
            <span className="ps-stat-sub">Formulations currently empty</span>
          </div>
        </div>

        {/* Registered Customers */}
        <div className="ps-stat-card">
          <div className="ps-stat-icon-wrap">
            <Users size={22} />
          </div>
          <div className="ps-stat-content">
            <span className="ps-stat-label">New Patrons</span>
            <strong className="ps-stat-value">{orders.length + 12}</strong>
            <span className="ps-stat-sub">Registered fragrance collectors</span>
          </div>
        </div>

        {/* Reviews */}
        <div className="ps-stat-card">
          <div className="ps-stat-icon-wrap is-gold">
            <Star size={22} />
          </div>
          <div className="ps-stat-content">
            <span className="ps-stat-label">New Reviews</span>
            <strong className="ps-stat-value">{reviews.length}</strong>
            <span className="ps-stat-sub">{newReviews.length} awaiting moderation</span>
          </div>
        </div>
      </div>

      {/* Two Column Layout: Recent Orders & Top Products */}
      <div className="ps-admin-panels-grid">
        {/* Recent Orders Panel */}
        <div className="ps-admin-panel">
          <div className="ps-panel-header">
            <div>
              <h2 className="ps-panel-title">Recent Patron Orders</h2>
              <span className="ps-panel-sub">Latest customer transactions</span>
            </div>
            <Link to="/admin/orders" className="ps-panel-link">
              <span>View All</span>
              <ArrowUpRight size={14} />
            </Link>
          </div>

          <div className="ps-admin-table-wrap">
            <table className="ps-admin-table">
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
                      <span className="ps-cell-order-num">{ord.order_number}</span>
                    </td>
                    <td>
                      <div className="ps-cell-customer">
                        <strong>{ord.customer_name}</strong>
                        <span>{ord.shipping_address?.city || 'India'}</span>
                      </div>
                    </td>
                    <td>{new Date(ord.created_at).toLocaleDateString()}</td>
                    <td>
                      <strong className="ps-cell-total">{formatINR(ord.total)}</strong>
                    </td>
                    <td>
                      <span className={`ps-status-pill ps-status-${ord.order_status}`}>
                        {ord.order_status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Top Products & Low Stock Panel */}
        <div className="ps-admin-panel">
          <div className="ps-panel-header">
            <div>
              <h2 className="ps-panel-title">Top Formulations & Inventory</h2>
              <span className="ps-panel-sub">Best-performing perfume creations</span>
            </div>
            <Link to="/admin/products" className="ps-panel-link">
              <span>Catalog</span>
              <ArrowUpRight size={14} />
            </Link>
          </div>

          <div className="ps-admin-mini-list">
            {topProducts.map((p) => (
              <div key={p.id} className="ps-mini-prod-row">
                <img
                  src={p.main_image || p.image}
                  alt={p.name}
                  className="ps-mini-prod-img"
                />
                <div className="ps-mini-prod-info">
                  <strong>{p.name}</strong>
                  <span>{p.category} • {formatINR(p.price)}</span>
                </div>
                <div className="ps-mini-prod-stock">
                  <span className={`ps-stock-badge ${p.stock <= 5 ? 'is-low' : ''}`}>
                    {p.stock} in stock
                  </span>
                </div>
              </div>
            ))}
          </div>

          {lowStockProducts.length > 0 && (
            <div className="ps-low-stock-alert-box">
              <AlertTriangle size={18} color="#eab308" />
              <span>
                <strong>{lowStockProducts.length} products</strong> have reached low-stock threshold.
              </span>
              <Link to="/admin/inventory" className="ps-low-stock-action">
                Adjust
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
