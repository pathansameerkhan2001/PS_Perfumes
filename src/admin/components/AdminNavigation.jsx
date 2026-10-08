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
    heading: 'DASHBOARD',
    items: [
      { name: 'Dashboard', path: '/admin', icon: Home, exact: true, active: true },
    ],
  },
  {
    heading: 'CONTENT',
    items: [
      { name: 'Hero Sections', path: '/admin/hero', icon: Image, active: false },
      { name: 'Homepage', path: '/admin/homepage', icon: Layout, active: false },
      { name: 'Instagram Reels', path: '/admin/reels', icon: PlayCircle, active: false },
    ],
  },
  {
    heading: 'CATALOG',
    items: [
      { name: 'Products', path: '/admin/products', icon: Package, active: false },
      { name: 'Categories', path: '/admin/categories', icon: Grid, active: false },
      { name: 'Combos', path: '/admin/combos', icon: Layers, active: false },
      { name: 'Inventory', path: '/admin/inventory', icon: Boxes, active: false },
    ],
  },
  {
    heading: 'ORDERS',
    items: [
      { name: 'Orders', path: '/admin/orders', icon: FileText, active: false },
      { name: 'Customers', path: '/admin/customers', icon: Users, active: false },
    ],
  },
  {
    heading: 'MARKETING',
    items: [
      { name: 'Reviews', path: '/admin/reviews', icon: Star, active: false },
      { name: 'Coupons', path: '/admin/coupons', icon: Tag, active: false },
    ],
  },
  {
    heading: 'SYSTEM',
    items: [
      { name: 'Store Settings', path: '/admin/settings', icon: Settings, active: false },
      { name: 'Admin Users', path: '/admin/admin-users', icon: ShieldCheck, active: false },
    ],
  },
];

/**
 * Reusable Grouped Admin Navigation
 * Dashboard is fully active; subsequent modules are prepared for following phases.
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
              const isFunctional = item.active;

              return (
                <NavLink
                  key={item.name}
                  to={item.path}
                  end={item.exact}
                  className={({ isActive }) =>
                    `ps-admin-nav-link ${isActive ? 'is-active' : ''} ${
                      !isFunctional ? 'is-future-module' : ''
                    }`
                  }
                  onClick={(e) => {
                    if (!isFunctional) {
                      e.preventDefault();
                    } else if (onItemClick) {
                      onItemClick();
                    }
                  }}
                  title={!isFunctional ? `${item.name} (Scheduled for subsequent phase)` : item.name}
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
