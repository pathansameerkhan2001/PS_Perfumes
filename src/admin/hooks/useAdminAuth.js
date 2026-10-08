import { useState, useEffect, useCallback } from 'react';
import {
  getAdminSession,
  adminLogin,
  adminLogout,
  subscribeToAuthChanges,
} from '../services/adminAuthService';

const VALID_ROLES = ['super_admin', 'admin', 'editor'];

export function useAdminAuth() {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);

  const checkSession = useCallback(async () => {
    try {
      const { user: currentAdmin, role: verifiedRole } = await getAdminSession();
      setUser(currentAdmin);
      setRole(verifiedRole);
    } catch {
      setUser(null);
      setRole(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    async function initAuth() {
      try {
        const { user: currentAdmin, role: verifiedRole } = await getAdminSession();
        if (mounted) {
          setUser(currentAdmin);
          setRole(verifiedRole);
          setLoading(false);
        }
      } catch {
        if (mounted) {
          setUser(null);
          setRole(null);
          setLoading(false);
        }
      }
    }

    initAuth();

    const unsubscribe = subscribeToAuthChanges(({ user: authUser, role: authRole }) => {
      if (mounted) {
        setUser(authUser);
        setRole(authRole);
        setLoading(false);
      }
    });

    return () => {
      mounted = false;
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, []);

  const login = async (email, password) => {
    setLoading(true);
    const result = await adminLogin(email, password);
    if (!result.error && result.user) {
      setUser(result.user);
      setRole(result.role);
    }
    setLoading(false);
    return result;
  };

  const logout = async () => {
    await adminLogout();
    setUser(null);
    setRole(null);
  };

  const isAuthenticated = Boolean(
    user && role && VALID_ROLES.includes(String(role).toLowerCase())
  );

  return {
    user,
    role,
    loading,
    isAuthenticated,
    login,
    logout,
    refresh: checkSession,
  };
}
