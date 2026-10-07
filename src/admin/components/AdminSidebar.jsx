import React from 'react';
import { Link } from 'react-router-dom';
import { X } from 'lucide-react';
import PSPerfumesLogo from '../../components/common/PSPerfumesLogo';
import AdminNavigation from './AdminNavigation';
import AdminProfile from './AdminProfile';
import './AdminSidebar.css';

/**
 * Luxury Admin Sidebar Component
 */
export default function AdminSidebar({
  isOpen = false,
  onClose,
  adminName = 'Admin',
  roleTitle = 'Super Admin',
  onLogout,
}) {
  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          className="ps-admin-sidebar-backdrop"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Main Sidebar Shell (~200px Fixed Desktop) */}
      <aside className={`ps-admin-sidebar ${isOpen ? 'is-open' : ''}`} aria-label="Sidebar">
        {/* Top Brand Logo & Administration Title */}
        <div className="ps-admin-sidebar-header">
          <Link to="/admin" className="ps-admin-logo-link" onClick={onClose}>
            <PSPerfumesLogo size="sm" variant="header" />
          </Link>
          <span className="ps-admin-brand-tagline">ADMINISTRATION</span>

          {/* Mobile close button */}
          <button
            type="button"
            className="ps-admin-sidebar-close"
            onClick={onClose}
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable Navigation Area */}
        <div className="ps-admin-sidebar-nav-scroll">
          <AdminNavigation onItemClick={onClose} />
        </div>

        {/* Bottom Profile & Logout Box */}
        <AdminProfile
          adminName={adminName}
          roleTitle={roleTitle}
          onLogout={onLogout}
        />
      </aside>
    </>
  );
}
