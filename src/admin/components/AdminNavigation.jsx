import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  Home,
  Image,
  Layout,
  PlayCircle,
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
} from 'lucide-react';
import './AdminNavigation.css';

export const ADMIN_NAV_SECTIONS = [
  {
    heading: 'OVERVIEW',
    items: [
      { name: 'Dashboard', path: '/admin', icon: Home, exact: true },
    ],
  },
  {
    heading: 'CONTENT',
    items: [
      { name: 'Hero Sections', path: '/admin/hero', icon: Image },
      { name: 'Homepage', path: '/admin/homepage', icon: Layout },
      { name: 'Instagram Reels', path: '/admin/reels', icon: PlayCircle },
    ],
  },
  {
    heading: 'CATALOG',
    items: [
      { name: 'Products', path: '/admin/products', icon: Package },
      { name: 'Categories', path: '/admin/categories', icon: Grid },
      { name: 'Combos', path: '/admin/combos', icon: Layers },
      { name: 'Inventory', path: '/admin/inventory', icon: Boxes },
    ],
  },
  {
    heading: 'SALES',
    items: [
      { name: 'Orders', path: '/admin/orders', icon: FileText },
      { name: 'Customers', path: '/admin/customers', icon: Users },
      { name: 'Reviews', path: '/admin/reviews', icon: Star },
    ],
  },
  {
    heading: 'MARKETING',
    items: [
      { name: 'Coupons', path: '/admin/coupons', icon: Tag },
    ],
  },
  {
    heading: 'SETTINGS',
    items: [
      { name: 'Store Settings', path: '/admin/settings', icon: Settings },
      { name: 'Admin Users', path: '/admin/admin-users', icon: ShieldCheck },
    ],
  },
];

/**
 * Reusable Grouped Admin Navigation
 */
export default function AdminNavigation({ onItemClick }) {
  return (
    <nav className="ps-admin-nav-menu" aria-label="Admin Navigation">
      {ADMIN_NAV_SECTIONS.map((section) => (
        <div key={section.heading} className="ps-admin-nav-section">
          <span className="ps-admin-nav-heading">{section.heading}</span>
          <div className="ps-admin-nav-links">
            {section.items.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.name}
                  to={item.path}
                  end={item.exact}
                  className={({ isActive }) =>
                    `ps-admin-nav-link ${isActive ? 'is-active' : ''}`
                  }
                  onClick={(e) => {
                    if (item.path !== '/admin') {
                      e.preventDefault();
                    }
                    if (onItemClick) onItemClick();
                  }}
                >
                  <Icon size={16} strokeWidth={1.8} className="ps-nav-icon" />
                  <span className="ps-nav-label">{item.name}</span>
                </NavLink>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}
