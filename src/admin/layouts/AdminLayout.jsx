import React, { useState, useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import AdminSidebar from '../components/AdminSidebar';
import AdminHeader from '../components/AdminHeader';
import { useAdminAuth } from '../hooks/useAdminAuth';
import { supabase } from '../../lib/supabase';
import '../styles/adminTheme.css';
// Shared admin page styles (page header, tables, modals). Loaded here so every admin page has
// them, not only pages opened after the Products page.
import '../pages/AdminProducts.css';
// Form controls, switches and builder bars (Categories, Coupons, Combos, Settings, …), the
// upload button shared by Combos/Hero/Users, card headers, status pills and plain tables:
// loaded once so a page never depends on which other admin page was opened first
import '../pages/AdminProductForm.css';
import '../pages/AdminCombos.css';
import '../components/AdminCard.css';
import '../styles/adminShared.css';
import './AdminLayout.css';

/**
 * PS PERFUMES — Luxury Master Admin Layout Shell
 * Fixed Dark Sidebar (~200px) + Warm Ivory Content Workspace (#F7F4EE)
 */
export default function AdminLayout() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const { user, role, logout } = useAdminAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Mobile drawer: close on navigation and on Escape
  useEffect(() => {
    setIsSidebarOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!isSidebarOpen) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setIsSidebarOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isSidebarOpen]);

  // The UI may admit the primary admin by e-mail, but every write is authorised by the
  // database's is_admin(). Check it once so a mismatch is visible before saves fail.
  // null = checking / unknown, true = recognised, false = not recognised
  const [dbAdmin, setDbAdmin] = useState(null);
  // Set when the is_admin() call itself fails (function missing, permission denied, network)
  const [dbAdminError, setDbAdminError] = useState(null);

  useEffect(() => {
    if (!user?.id) return undefined;
    let mounted = true;
    supabase
      .rpc('is_admin')
      .then(({ data, error }) => {
        if (!mounted) return;
        setDbAdmin(error ? null : data === true);
        setDbAdminError(error ? `${error.message || 'request failed'}${error.code ? ` (code ${error.code})` : ''}` : null);
      })
      .catch((err) => {
        if (!mounted) return;
        setDbAdmin(null);
        setDbAdminError(err?.message || 'request failed');
      });
    return () => {
      mounted = false;
    };
  }, [user?.id]);

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
          {dbAdmin === false && (
            <div className="ps-form-error-banner" role="alert">
              The database's administrator check (is_admin()) currently returns false for {email || 'this account'}.
              Image uploads and other changes are likely to be rejected until database-side administrator
              authorization is corrected (see supabase/new-project/README.md and docs/KT/09-Troubleshooting-Runbook.md, R-2). Reload this page after a fix
              to re-check.
            </div>
          )}
          {dbAdminError && (
            <div className="ps-form-error-banner" role="alert">
              The database's administrator check (is_admin()) could not be run: {dbAdminError}. Changes may be
              rejected until this is resolved (see supabase/new-project/README.md and docs/KT/09-Troubleshooting-Runbook.md, R-2).
            </div>
          )}
          <Outlet context={{ dbAdmin, dbAdminError }} />
        </main>
      </div>
    </div>
  );
}
