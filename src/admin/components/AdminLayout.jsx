import React, { useState } from 'react';
import { NavLink, Outlet, useNavigate, Link } from 'react-router-dom';
import {
  LayoutDashboard,
  Package,
  Layers,
  ShoppingBag,
  Users,
  Star,
  Image,
  Video,
  Home,
  Boxes,
  Ticket,
  Settings,
  MessageSquare,
  LogOut,
  Menu,
  X,
  ExternalLink,
  Bell,
  Search,
} from 'lucide-react';
import PSPerfumesLogo from '../../components/common/PSPerfumesLogo';
import { signOut } from '../../lib/auth';
import { ADMIN_EMAIL } from '../../lib/supabase';
import './AdminLayout.css';

const SIDEBAR_LINKS = [
  { name: 'Dashboard', path: '/admin', icon: LayoutDashboard, exact: true },
  { name: 'Products', path: '/admin/products', icon: Package },
  { name: 'Categories', path: '/admin/categories', icon: Layers },
  { name: 'Orders', path: '/admin/orders', icon: ShoppingBag },
  { name: 'Customers', path: '/admin/customers', icon: Users },
  { name: 'Reviews', path: '/admin/reviews', icon: Star },
  { name: 'Instagram Reels', path: '/admin/reels', icon: Video },
  { name: 'Banners', path: '/admin/banners', icon: Image },
  { name: 'Homepage', path: '/admin/homepage', icon: Home },
  { name: 'Inventory', path: '/admin/inventory', icon: Boxes },
  { name: 'Coupons', path: '/admin/coupons', icon: Ticket },
  { name: 'Settings', path: '/admin/settings', icon: Settings },
  { name: 'Enquiries', path: '/admin/enquiries', icon: MessageSquare },
];

export default function AdminLayout() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const navigate = useNavigate();

  const handleLogout = async () => {
    await signOut();
    navigate('/admin/login');
  };

  return (
    <div className="ps-admin-root">
      {/* Mobile Sidebar Overlay */}
      {isSidebarOpen && (
        <div
          className="ps-admin-sidebar-backdrop"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar Navigation */}
      <aside className={`ps-admin-sidebar ${isSidebarOpen ? 'is-open' : ''}`}>
        {/* Logo and Brand Title */}
        <div className="ps-admin-sidebar-header">
          <Link to="/" className="ps-admin-logo-link" title="View Public Website">
            <PSPerfumesLogo size="sm" variant="header" />
          </Link>
          <span className="ps-admin-tagline">ATELIER CONSOLE</span>
          <button
            type="button"
            className="ps-admin-close-sidebar-btn"
            onClick={() => setIsSidebarOpen(false)}
          >
            <X size={20} />
          </button>
        </div>

        {/* Navigation Items */}
        <nav className="ps-admin-nav-menu">
          {SIDEBAR_LINKS.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.name}
                to={item.path}
                end={item.exact}
                className={({ isActive }) =>
                  `ps-admin-nav-link ${isActive ? 'is-active' : ''}`
                }
                onClick={() => setIsSidebarOpen(false)}
              >
                <Icon size={18} className="ps-nav-icon" />
                <span>{item.name}</span>
              </NavLink>
            );
          })}
        </nav>

        {/* Sidebar Footer */}
        <div className="ps-admin-sidebar-footer">
          <Link to="/" target="_blank" className="ps-admin-view-site-link">
            <span>Live Storefront</span>
            <ExternalLink size={14} />
          </Link>
          <button
            type="button"
            className="ps-admin-logout-btn"
            onClick={handleLogout}
          >
            <LogOut size={16} />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main Admin Workspace Area */}
      <div className="ps-admin-workspace">
        {/* Top Bar */}
        <header className="ps-admin-topbar">
          <div className="ps-admin-topbar-left">
            <button
              type="button"
              className="ps-admin-menu-toggle"
              onClick={() => setIsSidebarOpen(true)}
              aria-label="Toggle Navigation Sidebar"
            >
              <Menu size={22} />
            </button>
            <h2 className="ps-admin-topbar-title">PS PERFUMES ADMIN</h2>
          </div>

          <div className="ps-admin-topbar-right">
            <div className="ps-admin-profile-pill">
              <span className="ps-admin-role-badge">ADMIN</span>
              <span className="ps-admin-email-text">{ADMIN_EMAIL}</span>
            </div>

            <button
              type="button"
              className="ps-admin-topbar-btn"
              onClick={handleLogout}
              title="Sign Out"
            >
              <LogOut size={18} />
            </button>
          </div>
        </header>

        {/* Content Body */}
        <main className="ps-admin-content-container">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
