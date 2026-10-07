import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAdminAuth } from '../hooks/useAdminAuth';

/**
 * PS PERFUMES — Luxury Protected Admin Route
 * Verifies Supabase session / Admin role before granting access.
 */
export default function AdminRoute({ children }) {
  const { loading, isAuthenticated } = useAdminAuth();

  if (loading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: '#11100F',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '14px',
          color: '#C9A96E',
          fontFamily: "'Cormorant Garamond', Georgia, serif",
          letterSpacing: '0.12em',
        }}
      >
        <div
          style={{
            width: '28px',
            height: '28px',
            border: '2px solid rgba(201, 169, 110, 0.25)',
            borderTopColor: '#C9A96E',
            borderRadius: '50%',
            animation: 'ps-spin 0.7s linear infinite',
          }}
        />
        <style>
          {`@keyframes ps-spin { to { transform: rotate(360deg); } }`}
        </style>
        <span style={{ fontSize: '13px', textTransform: 'uppercase' }}>
          Verifying Atelier Credentials...
        </span>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/admin/login" replace />;
  }

  return children ? children : <Outlet />;
}
