import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Image,
  Layout,
  Film,
  Package,
  Grid,
  Layers,
  Boxes,
  FileText,
  Users,
  Star,
  Tag,
  Settings,
  ShieldCheck,
  Globe,
  ExternalLink,
} from 'lucide-react';
import { getLiveWebsiteUrl } from '../../config/siteConfig';
import './AdminNavigation.css';

/**
 * Approved Navigation Item Sequence:
 * 1. Dashboard
 * 2. Hero Sections
 * 3. Homepage
 * 4. Instagram Reels
 * 5. Products
 * 6. Categories
 * 7. Combos
 * 8. Inventory
 * 9. Orders
 * 10. Customers
 * 11. Reviews
 * 12. Coupons
 * 13. Store Settings
 * 14. Admin Users
 * + Live Website (subtly separated at the bottom)
 */
export const ADMIN_NAV_ITEMS = [
  { name: 'Dashboard', path: '/admin', icon: LayoutDashboard, exact: true },
  { name: 'Hero Sections', path: '/admin/hero', icon: Image },
  { name: 'Homepage', path: '/admin/homepage', icon: Layout },
  { name: 'Instagram Reels', path: '/admin/reels', icon: Film },
  { name: 'Products', path: '/admin/products', icon: Package },
  { name: 'Categories', path: '/admin/categories', icon: Grid },
  { name: 'Combos', path: '/admin/combos', icon: Layers },
  { name: 'Inventory', path: '/admin/inventory', icon: Boxes },
  { name: 'Orders', path: '/admin/orders', icon: FileText },
  { name: 'Customers', path: '/admin/customers', icon: Users },
  { name: 'Reviews', path: '/admin/reviews', icon: Star },
  { name: 'Coupons', path: '/admin/coupons', icon: Tag },
  { name: 'Store Settings', path: '/admin/settings', icon: Settings },
  { name: 'Admin Users', path: '/admin/admin-users', icon: ShieldCheck },
];

export default function AdminNavigation({ onItemClick }) {
  const liveUrl = getLiveWebsiteUrl();

  return (
    <nav className="ps-admin-nav-menu" aria-label="Admin Navigation">
      {/* 14 Management Modules in strict approved sequence */}
      <div className="ps-admin-nav-links">
        {ADMIN_NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.name}
              to={item.path}
              end={item.exact}
              className={({ isActive }) =>
                `ps-admin-nav-link ${isActive ? 'is-active' : ''}`
              }
              onClick={onItemClick}
              title={item.name}
            >
              <Icon size={16} strokeWidth={1.8} className="ps-nav-icon" />
              <span className="ps-nav-label">{item.name}</span>
            </NavLink>
          );
        })}
      </div>

      {/* Subtle Divider before Live Website Link */}
      <div className="ps-admin-nav-divider" role="separator" />

      {/* Live Website Item — separated near bottom, opens in new browser tab */}
      <div className="ps-admin-nav-external-section">
        <a
          href={liveUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="ps-admin-nav-link ps-admin-live-link"
          aria-label="Live Website"
          title="Open Live Website in a new browser tab"
          onClick={onItemClick}
        >
          <Globe size={16} strokeWidth={1.8} className="ps-nav-icon ps-live-globe-icon" />
          <span className="ps-nav-label">Live Website</span>
          <ExternalLink size={12} strokeWidth={1.8} className="ps-live-external-icon" />
        </a>
      </div>
    </nav>
  );
}
