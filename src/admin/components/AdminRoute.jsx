import React, { useState, useEffect } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { getAuthSession } from '../../lib/auth';

export default function AdminRoute() {
  const [checking, setChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let mounted = true;
    async function verify() {
      const { user, role } = await getAuthSession();
      if (mounted) {
        if (user && role === 'admin') {
          setIsAdmin(true);
        } else {
          setIsAdmin(false);
        }
        setChecking(false);
      }
    }
    verify();
    return () => { mounted = false; };
  }, []);

  if (checking) {
    return (
      <div style={{
        minHeight: '100vh',
        background: '#050505',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#c8a45d',
        fontFamily: "'Cinzel', serif",
        letterSpacing: '0.15em',
      }}>
        VERIFYING ATELIER CREDENTIALS...
      </div>
    );
  }

  return isAdmin ? <Outlet /> : <Navigate to="/admin/login" replace />;
}
