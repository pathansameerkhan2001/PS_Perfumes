import { supabase, isSupabaseConfigured, ADMIN_EMAIL } from '../../lib/supabase';

const LOCAL_ADMIN_KEY = 'ps_admin_session';

/**
 * Service handling authentication for PS PERFUMES Admin Panel
 */
export async function adminLogin(email, password) {
  const cleanEmail = (email || '').trim().toLowerCase();

  // 1. Supabase Auth if configured
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password,
    });

    if (error) {
      return { user: null, role: null, error: error.message };
    }

    // Role check from profiles or admin email match
    let role = 'customer';
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', data.user.id)
        .single();
      role = profile?.role || (cleanEmail === ADMIN_EMAIL.toLowerCase() ? 'admin' : 'customer');
    } catch {
      role = cleanEmail === ADMIN_EMAIL.toLowerCase() ? 'admin' : 'customer';
    }

    if (role !== 'admin') {
      await supabase.auth.signOut();
      return { user: null, role: null, error: 'Access denied. Administrator privileges required.' };
    }

    return { user: data.user, role, error: null };
  }

  // 2. Direct fallback authentication for configured admin email in local environment
  if (cleanEmail === ADMIN_EMAIL.toLowerCase()) {
    if (password && password.length >= 6) {
      const mockUser = {
        id: 'admin-local-atelier',
        email: cleanEmail,
        user_metadata: { full_name: 'PS Perfumes Administrator' },
      };
      const session = {
        user: mockUser,
        role: 'admin',
        token: `ps-admin-${Date.now()}`,
        expiresAt: Date.now() + 24 * 60 * 60 * 1000,
      };
      localStorage.setItem(LOCAL_ADMIN_KEY, JSON.stringify(session));
      return { user: mockUser, role: 'admin', error: null };
    }
    return { user: null, role: null, error: 'Password must be at least 6 characters' };
  }

  return {
    user: null,
    role: null,
    error: `Invalid credentials. Only ${ADMIN_EMAIL} is authorized for administration access.`,
  };
}

/**
 * Log out current administrator
 */
export async function adminLogout() {
  localStorage.removeItem(LOCAL_ADMIN_KEY);
  if (isSupabaseConfigured && supabase) {
    try {
      await supabase.auth.signOut();
    } catch {
      // ignore
    }
  }
}

/**
 * Fetch current admin session and verified role
 */
export async function getAdminSession() {
  // Check Supabase session
  if (isSupabaseConfigured && supabase) {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session || !session.user) {
        return { user: null, role: null };
      }

      let role = 'customer';
      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', session.user.id)
          .single();
        role = profile?.role || (session.user.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase() ? 'admin' : 'customer');
      } catch {
        role = session.user.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase() ? 'admin' : 'customer';
      }

      return { user: session.user, role };
    } catch {
      // Fall through to local session check
    }
  }

  // Check local session
  try {
    const raw = localStorage.getItem(LOCAL_ADMIN_KEY);
    if (!raw) return { user: null, role: null };
    const session = JSON.parse(raw);
    if (session.expiresAt && session.expiresAt < Date.now()) {
      localStorage.removeItem(LOCAL_ADMIN_KEY);
      return { user: null, role: null };
    }
    return { user: session.user, role: session.role };
  } catch {
    return { user: null, role: null };
  }
}
