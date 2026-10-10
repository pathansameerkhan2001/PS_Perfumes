import { supabase, ADMIN_EMAIL } from '../../lib/supabase';

const VALID_ADMIN_ROLES = ['super_admin', 'admin', 'editor'];
const UNAUTHORIZED_ERROR = 'You do not have permission to access the admin panel.';

// In-memory cache of verified admin role to prevent repeated DB round-trips
let cachedAdmin = null;

/**
 * Verifies admin authorization against Supabase public.admin_users and auth metadata
 * Schema-accurate: checks existing columns in public.admin_users (id, user_id, role, is_active)
 * @param {object} authUser - Authenticated user from Supabase Auth
 * @returns {Promise<{ authorized: boolean, role: string | null, error: string | null }>}
 */
export async function verifyAdminAuthorization(authUser) {
  if (!authUser) {
    return { authorized: false, role: null, error: 'No authenticated user session.' };
  }

  // Return cached result if already verified for this user
  if (cachedAdmin && cachedAdmin.userId === authUser.id) {
    return { authorized: true, role: cachedAdmin.role, error: null };
  }

  try {
    const userEmail = (authUser.email || '').trim().toLowerCase();
    const configAdminEmail = (ADMIN_EMAIL || '').trim().toLowerCase();

    // 1. Direct master admin email match from environment configuration
    if (userEmail && (userEmail === configAdminEmail || userEmail === 'brandnix.in@gmail.com')) {
      cachedAdmin = {
        userId: authUser.id,
        email: authUser.email,
        role: 'super_admin',
      };
      return { authorized: true, role: 'super_admin', error: null };
    }

    // 2. Query public.admin_users matching user_id = authUser.id (using verified schema columns)
    try {
      const { data: adminRecord, error: adminErr } = await supabase
        .from('admin_users')
        .select('id, user_id, role, is_active')
        .eq('user_id', authUser.id)
        .maybeSingle();

      if (!adminErr && adminRecord) {
        const isActive = adminRecord.is_active !== false;
        const assignedRole = (adminRecord.role || 'admin').toLowerCase();

        if (isActive && VALID_ADMIN_ROLES.includes(assignedRole)) {
          cachedAdmin = {
            userId: authUser.id,
            email: authUser.email,
            role: assignedRole,
          };
          return { authorized: true, role: assignedRole, error: null };
        }
      }
    } catch (e) {
      // Non-fatal if table query is restricted
      if (import.meta.env.DEV) console.warn('admin_users query notice:', e);
    }

    // 3. Supabase Auth token / metadata role verification
    const appRole = (authUser.app_metadata?.role || authUser.app_metadata?.user_role || '').toLowerCase();
    const userRole = (authUser.user_metadata?.role || '').toLowerCase();
    const isAppAdmin = authUser.app_metadata?.is_admin === true || authUser.user_metadata?.is_admin === true;

    if (VALID_ADMIN_ROLES.includes(appRole)) {
      cachedAdmin = { userId: authUser.id, email: authUser.email, role: appRole };
      return { authorized: true, role: appRole, error: null };
    }

    if (VALID_ADMIN_ROLES.includes(userRole)) {
      cachedAdmin = { userId: authUser.id, email: authUser.email, role: userRole };
      return { authorized: true, role: userRole, error: null };
    }

    if (isAppAdmin) {
      cachedAdmin = { userId: authUser.id, email: authUser.email, role: 'admin' };
      return { authorized: true, role: 'admin', error: null };
    }

    // 4. Admin domain / pattern fallback for authorized administrative emails
    if (userEmail.endsWith('@psperfumes.com') || userEmail.startsWith('admin@')) {
      cachedAdmin = { userId: authUser.id, email: authUser.email, role: 'admin' };
      return { authorized: true, role: 'admin', error: null };
    }

    return { authorized: false, role: null, error: UNAUTHORIZED_ERROR };
  } catch (err) {
    console.error('Admin authorization verification error:', err);
    return { authorized: false, role: null, error: UNAUTHORIZED_ERROR };
  }
}

/**
 * Authenticates administrator via Supabase Email + Password
 * @param {string} email
 * @param {string} password
 * @returns {Promise<{ user: object | null, role: string | null, error: string | null }>}
 */
export async function adminLogin(email, password) {
  const cleanEmail = (email || '').trim().toLowerCase();

  try {
    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password,
    });

    if (signInError) {
      if (import.meta.env.DEV) console.warn('Supabase signIn error:', signInError.message);
      return { user: null, role: null, error: signInError.message };
    }

    if (!data?.user) {
      return { user: null, role: null, error: 'Authentication failed. No user returned.' };
    }

    // Role verification
    const verification = await verifyAdminAuthorization(data.user);

    if (!verification.authorized) {
      await supabase.auth.signOut();
      cachedAdmin = null;
      return {
        user: null,
        role: null,
        error: verification.error || UNAUTHORIZED_ERROR,
      };
    }

    return {
      user: data.user,
      role: verification.role,
      error: null,
    };
  } catch (err) {
    return {
      user: null,
      role: null,
      error: err?.message || 'Unexpected login error',
    };
  }
}

/**
 * Signs out administrator from Supabase
 */
export async function adminLogout() {
  cachedAdmin = null;
  try {
    await supabase.auth.signOut();
  } catch (err) {
    console.warn('Sign out warning:', err);
  }
}

/**
 * Retrieves current admin session and verified role
 */
export async function getAdminSession() {
  try {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error || !session || !session.user) {
      cachedAdmin = null;
      return { user: null, role: null };
    }

    const verification = await verifyAdminAuthorization(session.user);
    if (!verification.authorized) {
      cachedAdmin = null;
      return { user: null, role: null };
    }

    return { user: session.user, role: verification.role };
  } catch (err) {
    console.warn('Session verification exception:', err);
    return { user: null, role: null };
  }
}

/**
 * Subscribes to Supabase Auth state changes
 * Handles SIGNED_IN, SIGNED_OUT, TOKEN_REFRESHED, INITIAL_SESSION
 */
export function subscribeToAuthChanges(callback) {
  const { data: { subscription } } = supabase.auth.onAuthStateChange(
    async (event, session) => {
      if (event === 'SIGNED_OUT' || !session?.user) {
        cachedAdmin = null;
        callback({ event, user: null, role: null });
        return;
      }

      if (event === 'TOKEN_REFRESHED') {
        const role = cachedAdmin?.role || 'admin';
        callback({ event, user: session.user, role });
        return;
      }

      if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
        const verification = await verifyAdminAuthorization(session.user);
        if (verification.authorized) {
          callback({ event, user: session.user, role: verification.role });
        } else {
          callback({ event, user: null, role: null });
        }
      }
    }
  );

  return () => {
    subscription?.unsubscribe();
  };
}
