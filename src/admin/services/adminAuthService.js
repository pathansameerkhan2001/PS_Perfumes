import { supabase } from '../../lib/supabase';

const VALID_ADMIN_ROLES = ['super_admin', 'admin', 'editor'];
const UNAUTHORIZED_ERROR = 'You do not have permission to access the admin panel.';

// In-memory cache of verified admin role to prevent repeated DB round-trips
let cachedAdmin = null;

/**
 * Verifies admin authorization with the database, which is the only authority:
 *   1. public.is_admin() must return true for the signed-in user's JWT. It checks for an active
 *      public.admin_users row (or a server-set app_metadata.role) — the same rule every RLS
 *      and Storage policy uses, so the panel never admits someone the database would reject.
 *   2. The role shown in the panel comes from the user's own admin_users row.
 * No e-mail address, VITE_* variable or user_metadata grants access: the browser can be edited,
 * the database cannot.
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
    const { data: isAdmin, error: rpcErr } = await supabase.rpc('is_admin');
    if (rpcErr) {
      console.error('is_admin() check failed:', rpcErr);
      return {
        authorized: false,
        role: null,
        error: `The administrator check could not be completed (${rpcErr.message || 'database error'}). Please try again or contact the site owner.`,
      };
    }
    if (isAdmin !== true) {
      return { authorized: false, role: null, error: UNAUTHORIZED_ERROR };
    }

    // Role for the UI only (authorization already decided above). RLS lets a user read their own row.
    let role = null;
    const { data: adminRecord, error: adminErr } = await supabase
      .from('admin_users')
      .select('role, is_active')
      .eq('user_id', authUser.id)
      .maybeSingle();
    if (adminErr && import.meta.env.DEV) console.warn('admin_users role lookup notice:', adminErr.message);
    if (adminRecord && adminRecord.is_active !== false) {
      role = (adminRecord.role || '').toLowerCase();
    }
    if (!VALID_ADMIN_ROLES.includes(role)) {
      // is_admin() also accepts a server-set app_metadata role
      const appRole = (authUser.app_metadata?.role || '').toLowerCase();
      role = VALID_ADMIN_ROLES.includes(appRole) ? appRole : 'admin';
    }

    cachedAdmin = { userId: authUser.id, email: authUser.email, role };
    return { authorized: true, role, error: null };
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
    (event, session) => {
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
        // Verification calls the database. Awaiting Supabase calls inside this callback can
        // deadlock the auth client, so it runs after the callback has returned.
        setTimeout(async () => {
          const verification = await verifyAdminAuthorization(session.user);
          if (verification.authorized) {
            callback({ event, user: session.user, role: verification.role });
          } else {
            callback({ event, user: null, role: null });
          }
        }, 0);
      }
    }
  );

  return () => {
    subscription?.unsubscribe();
  };
}
