import { supabase, isSupabaseConfigured, ADMIN_EMAIL } from './supabase';

const LOCAL_AUTH_KEY = 'ps_admin_session';

/**
 * Sign in using Supabase Auth, or local session if Supabase not configured
 */
export async function signIn(email, password) {
  const cleanEmail = email.trim().toLowerCase();

  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password,
    });

    if (error) {
      return { user: null, role: null, error: error.message };
    }

    // Verify role in profiles table
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', data.user.id)
      .single();

    const role = profile?.role || (cleanEmail === ADMIN_EMAIL.toLowerCase() ? 'admin' : 'customer');
    return { user: data.user, role, error: null };
  }

  // Local development / fallback authentication for brandnix.in@gmail.com
  if (cleanEmail === ADMIN_EMAIL.toLowerCase()) {
    // If local test password or any pass >= 6 chars
    if (password && password.length >= 6) {
      const mockUser = {
        id: 'admin-local-001',
        email: cleanEmail,
        user_metadata: { full_name: 'PS Perfumes Administrator' },
      };
      const session = {
        user: mockUser,
        role: 'admin',
        token: 'local-admin-token-' + Date.now(),
        expiresAt: Date.now() + 24 * 60 * 60 * 1000,
      };
      localStorage.setItem(LOCAL_AUTH_KEY, JSON.stringify(session));
      return { user: mockUser, role: 'admin', error: null };
    } else {
      return { user: null, role: null, error: 'Password must be at least 6 characters' };
    }
  }

  return { user: null, role: null, error: 'Invalid credentials. Only brandnix.in@gmail.com is authorized for admin access.' };
}

/**
 * Sign out user
 */
export async function signOut() {
  localStorage.removeItem(LOCAL_AUTH_KEY);
  if (isSupabaseConfigured && supabase) {
    await supabase.auth.signOut();
  }
}

/**
 * Get current authenticated user and verified role
 */
export async function getAuthSession() {
  if (isSupabaseConfigured && supabase) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session || !session.user) {
      return { user: null, role: null };
    }

    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .single();

      const role = profile?.role || (session.user.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase() ? 'admin' : 'customer');
      return { user: session.user, role };
    } catch {
      const role = session.user.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase() ? 'admin' : 'customer';
      return { user: session.user, role };
    }
  }

  // Check local session
  try {
    const raw = localStorage.getItem(LOCAL_AUTH_KEY);
    if (!raw) return { user: null, role: null };
    const session = JSON.parse(raw);
    if (session.expiresAt && session.expiresAt < Date.now()) {
      localStorage.removeItem(LOCAL_AUTH_KEY);
      return { user: null, role: null };
    }
    return { user: session.user, role: session.role };
  } catch {
    return { user: null, role: null };
  }
}
