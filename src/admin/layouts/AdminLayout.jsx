import React, { useState } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import AdminSidebar from '../components/AdminSidebar';
import AdminHeader from '../components/AdminHeader';
import { useAdminAuth } from '../hooks/useAdminAuth';
import '../styles/adminTheme.css';
import './AdminLayout.css';

/**
 * PS PERFUMES — Luxury Master Admin Layout Shell
 * Fixed Dark Sidebar (~200px) + Warm Ivory Content Workspace (#F7F4EE)
 */
export default function AdminLayout() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const { user, role, logout } = useAdminAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/admin/login');
  };

  const email = user?.email || '';
  const displayName = user?.user_metadata?.full_name || (email ? email.split('@')[0] : 'Administrator');
  const roleName = role === 'super_admin' ? 'Super Admin' : role === 'editor' ? 'Editor' : 'Admin';

  return (
    <div className="ps-admin-shell ps-admin-master-layout">
      {/* 1. Fixed Dark Sidebar (~200px desktop, drawer on tablet/mobile) */}
      <AdminSidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        adminName={displayName}
        adminEmail={email}
        roleTitle={roleName}
        onLogout={handleLogout}
      />

      {/* 2. Main Workspace (Header + Content Outlet) */}
      <div className="ps-admin-workspace-area">
        <AdminHeader
          onToggleSidebar={() => setIsSidebarOpen((prev) => !prev)}
          adminName={displayName}
          adminRole={roleName}
          adminEmail={email}
          onLogout={handleLogout}
        />

        <main className="ps-admin-main-viewport">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
