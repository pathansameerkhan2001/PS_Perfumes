import { supabase, SUPABASE_HOST } from '../../lib/supabase';

const VALID_ADMIN_ROLES = ['super_admin', 'admin', 'editor'];
// Sign-in worked, but the database does not list this account as an administrator
const UNAUTHORIZED_ERROR =
  'Your sign-in was accepted, but this account is not registered as an active administrator in the database. Contact the site owner to be granted access.';

/** True when the request never got an HTTP response (DNS, offline, blocked, CORS). */
function isNetworkFailure(err) {
  if (!err) return false;
  const msg = String(err.message || err).toLowerCase();
  return (
    err.name === 'AuthRetryableFetchError' ||
    (err.name === 'TypeError' && msg.includes('fetch')) ||
    msg.includes('failed to fetch') ||
    msg.includes('networkerror') ||
    msg.includes('load failed') ||
    msg.includes('network request failed')
  );
}

const NETWORK_ERROR =
  `The sign-in server (${SUPABASE_HOST || 'not configured'}) could not be reached. ` +
  'If your internet connection works, the site is configured with a database address that is unavailable — ' +
  'the site owner must check the VITE_SUPABASE_URL setting and redeploy.';

/**
 * Turns a Supabase Auth / PostgREST error into a message that says which side failed:
 * network or configuration, credentials, account state, or rate limiting.
 */
function describeAuthError(err) {
  if (isNetworkFailure(err)) return NETWORK_ERROR;
  const code = err?.code || '';
  const msg = String(err?.message || '');
  const status = Number(err?.status) || 0;

  if (code === 'invalid_credentials' || /invalid login credentials/i.test(msg)) {
    return 'Incorrect email or password.';
  }
  if (code === 'email_not_confirmed' || /email not confirmed/i.test(msg)) {
    return 'This account’s email address has not been confirmed yet. Confirm it in Supabase → Authentication → Users.';
  }
  if (code === 'user_banned') return 'This account has been disabled.';
  if (status === 429 || code === 'over_request_rate_limit' || /rate limit/i.test(msg)) {
    return 'Too many sign-in attempts. Wait a few minutes and try again.';
  }
  if (/invalid api key|no api key|api key/i.test(msg) || status === 401) {
    return 'The site’s Supabase publishable key does not match its project URL (configuration error). The site owner must check VITE_SUPABASE_PUBLISHABLE_KEY and redeploy.';
  }
  return msg ? `Sign-in failed: ${msg}` : 'Sign-in failed for an unknown reason.';
}

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
      if (isNetworkFailure(rpcErr)) {
        return { authorized: false, role: null, error: NETWORK_ERROR };
      }
      return {
        authorized: false,
        role: null,
        error:
          rpcErr.code === 'PGRST202'
            ? 'Sign-in worked, but the database administrator check (is_admin) is not installed in this project yet. The site owner must finish the database setup (supabase/new-project/README.md).'
            : `Sign-in worked, but the administrator check could not be completed (${rpcErr.message || 'database error'}${rpcErr.code ? `, code ${rpcErr.code}` : ''}).`,
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
      // Logged without the password or keys: name, status and code identify the failure
      console.warn('Supabase sign-in error:', signInError.name, signInError.status, signInError.code || '', signInError.message);
      return { user: null, role: null, error: describeAuthError(signInError) };
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
      error: describeAuthError(err),
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
