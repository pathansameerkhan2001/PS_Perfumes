import React from 'react';
import { LogOut } from 'lucide-react';
import './AdminProfile.css';

/**
 * Sidebar Admin Profile & Logout Box
 */
export default function AdminProfile({
  adminName = 'PS Perfumes Administrator',
  roleTitle = 'Super Admin',
  onLogout,
}) {
  return (
    <div className="ps-admin-profile-section">
      <div className="ps-admin-profile-card">
        <div className="ps-admin-profile-avatar">
          {adminName.charAt(0).toUpperCase()}
        </div>
        <div className="ps-admin-profile-info">
          <span className="ps-admin-profile-name">{adminName}</span>
          <span className="ps-admin-profile-role">{roleTitle}</span>
        </div>
      </div>

      <button
        type="button"
        className="ps-admin-sidebar-logout-btn"
        onClick={onLogout}
        title="Log out of administration session"
      >
        <LogOut size={15} />
        <span>Logout</span>
      </button>
    </div>
  );
}
