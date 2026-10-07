import React, { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Search, Bell, Menu, ChevronDown, Settings, LogOut, Check } from 'lucide-react';
import './AdminHeader.css';

/**
 * Luxury Admin Top Header Bar
 */
export default function AdminHeader({
  onToggleSidebar,
  adminName = 'PS Perfumes Administrator',
  adminRole = 'Super Admin',
  adminEmail = 'brandnix.in@gmail.com',
  onLogout,
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);

  const notifRef = useRef(null);
  const profileRef = useRef(null);
  const navigate = useNavigate();

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClickOutside(e) {
      if (notifRef.current && !notifRef.current.contains(e.target)) {
        setShowNotifications(false);
      }
      if (profileRef.current && !profileRef.current.contains(e.target)) {
        setShowProfileMenu(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSearchSubmit = (e) => {
    if (e.key === 'Enter' && searchQuery.trim()) {
      navigate(`/admin/products?search=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  return (
    <header className="ps-admin-header" role="banner">
      {/* Left: Menu toggle button */}
      <div className="ps-admin-header-left">
        <button
          type="button"
          className="ps-admin-header-toggle-btn"
          onClick={onToggleSidebar}
          aria-label="Toggle Navigation Menu"
        >
          <Menu size={20} />
        </button>
      </div>

      {/* Right: Search, Notifications, Admin User Menu */}
      <div className="ps-admin-header-right">
        {/* Light Minimal Search Box */}
        <div className="ps-admin-header-search-wrap">
          <Search size={14} className="ps-header-search-icon" />
          <input
            type="text"
            placeholder="Search products, orders, customers..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleSearchSubmit}
            className="ps-header-search-input"
            aria-label="Global Admin Search"
          />
        </div>

        {/* Notifications Icon with Dropdown */}
        <div className="ps-admin-header-notif-wrap" ref={notifRef}>
          <button
            type="button"
            className="ps-admin-header-icon-btn"
            onClick={() => setShowNotifications((prev) => !prev)}
            aria-label="View notifications"
            title="Notifications"
          >
            <Bell size={17} />
            <span className="ps-header-notif-dot">0</span>
          </button>

          {showNotifications && (
            <div className="ps-admin-header-dropdown ps-notif-dropdown">
              <div className="ps-header-dropdown-header">
                <strong>Notifications</strong>
                <span className="ps-header-badge-count">0 new</span>
              </div>
              <div className="ps-header-dropdown-content">
                <div className="ps-header-empty-text">
                  <Check size={16} color="var(--ps-admin-gold, #C9A96E)" />
                  <span>No unread notifications at this time.</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Admin Avatar Pill with Dropdown */}
        <div className="ps-admin-header-user-wrap" ref={profileRef}>
          <button
            type="button"
            className="ps-admin-header-user-btn"
            onClick={() => setShowProfileMenu((prev) => !prev)}
            aria-label="Admin User Menu"
          >
            <div className="ps-header-avatar">
              {adminName.charAt(0).toUpperCase()}
            </div>
            <span className="ps-header-user-name">{adminName}</span>
            <ChevronDown size={14} className="ps-header-caret" />
          </button>

          {showProfileMenu && (
            <div className="ps-admin-header-dropdown ps-user-dropdown">
              <div className="ps-header-user-meta">
                <span className="ps-user-meta-name">{adminName}</span>
                <span className="ps-user-meta-role">{adminRole}</span>
                <span className="ps-user-meta-email">{adminEmail}</span>
              </div>
              <div className="ps-header-dropdown-divider" />
              <Link
                to="/admin/settings"
                className="ps-header-dropdown-item"
                onClick={() => setShowProfileMenu(false)}
              >
                <Settings size={15} />
                <span>Store Settings</span>
              </Link>
              <button
                type="button"
                className="ps-header-dropdown-item is-logout"
                onClick={() => {
                  setShowProfileMenu(false);
                  if (onLogout) onLogout();
                }}
              >
                <LogOut size={15} />
                <span>Sign Out</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
