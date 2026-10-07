import { useState, useEffect, useCallback } from 'react';
import { getAdminSession, adminLogin, adminLogout } from '../services/adminAuthService';

export function useAdminAuth() {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);

  const checkAuth = useCallback(async () => {
    try {
      const { user: currentUser, role: currentRole } = await getAdminSession();
      setUser(currentUser);
      setRole(currentRole);
    } catch {
      setUser(null);
      setRole(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

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

  const isAuthenticated = Boolean(user && role === 'admin');

  return {
    user,
    role,
    loading,
    isAuthenticated,
    login,
    logout,
    refresh: checkAuth,
  };
}
