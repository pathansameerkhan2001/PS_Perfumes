import React from 'react';
import { LogOut } from 'lucide-react';
import './AdminProfile.css';

/**
 * Sidebar Admin Profile & Logout Box
 */
export default function AdminProfile({
  adminName = 'Administrator',
  adminEmail = '',
  roleTitle = 'Admin',
  onLogout,
}) {
  return (
    <div className="ps-admin-profile-section">
      <div className="ps-admin-profile-card">
        <div className="ps-admin-profile-avatar">
          {(adminName || adminEmail || 'A').charAt(0).toUpperCase()}
        </div>
        <div className="ps-admin-profile-info">
          <span className="ps-admin-profile-name">{adminName || adminEmail}</span>
          {adminEmail && adminEmail !== adminName && (
            <span className="ps-admin-profile-email" style={{ fontSize: '11px', color: '#887E71', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {adminEmail}
            </span>
          )}
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
