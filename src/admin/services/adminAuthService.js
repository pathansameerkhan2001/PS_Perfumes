import { supabase, ADMIN_EMAIL } from '../../lib/supabase';

const VALID_ADMIN_ROLES = ['super_admin', 'admin', 'editor'];
const UNAUTHORIZED_ERROR = 'You do not have permission to access the admin panel.';

// In-memory cache of verified admin role to prevent repeated DB round-trips
let cachedAdmin = null;

/**
 * Verifies admin authorization against public.admin_users
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
    // 1. Query public.admin_users matching user_id = authUser.id
    let { data: adminRecord, error: adminErr } = await supabase
      .from('admin_users')
      .select('*')
      .eq('user_id', authUser.id)
      .maybeSingle();

    // Fallback: If user_id is not mapped or table uses email
    if (!adminRecord && !adminErr) {
      const { data: byEmail } = await supabase
        .from('admin_users')
        .select('*')
        .eq('email', (authUser.email || '').toLowerCase())
        .maybeSingle();
      if (byEmail) adminRecord = byEmail;
    }

    // Secondary schema fallback: Check public.profiles if admin_users is pending sync
    if (!adminRecord) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', authUser.id)
        .maybeSingle();

      if (profile && profile.role === 'admin') {
        adminRecord = {
          role: 'admin',
          is_active: true,
        };
      }
    }

    // Special allowance for master owner brandnix.in@gmail.com if database setup in progress
    if (!adminRecord && authUser.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
      adminRecord = {
        role: 'super_admin',
        is_active: true,
      };
    }

    if (!adminRecord) {
      return { authorized: false, role: null, error: UNAUTHORIZED_ERROR };
    }

    // Verify is_active = true
    const isActive =
      adminRecord.is_active === true ||
      adminRecord.status === 'active' ||
      (adminRecord.is_active === undefined && adminRecord.status === undefined);

    if (!isActive) {
      return { authorized: false, role: null, error: UNAUTHORIZED_ERROR };
    }

    // Verify role is super_admin OR admin OR editor
    const userRole = (adminRecord.role || '').toLowerCase();
    if (!VALID_ADMIN_ROLES.includes(userRole)) {
      return { authorized: false, role: null, error: UNAUTHORIZED_ERROR };
    }

    cachedAdmin = {
      userId: authUser.id,
      email: authUser.email,
      role: userRole,
    };

    return { authorized: true, role: userRole, error: null };
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

    // Role verification against public.admin_users
    const verification = await verifyAdminAuthorization(data.user);

    if (!verification.authorized) {
      // Immediately sign the user out if unauthorized
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
      await supabase.auth.signOut();
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
        // Keep cached role if userId is unchanged
        const role = cachedAdmin?.role || 'admin';
        callback({ event, user: session.user, role });
        return;
      }

      if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
        const verification = await verifyAdminAuthorization(session.user);
        if (verification.authorized) {
          callback({ event, user: session.user, role: verification.role });
        } else {
          await supabase.auth.signOut();
          cachedAdmin = null;
          callback({ event, user: null, role: null });
        }
      }
    }
  );

  return () => {
    subscription.unsubscribe();
  };
}
