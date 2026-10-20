import { supabase } from '../lib/supabase';
import { dbError } from './dbErrors';

/*
 * Live schema (verified 2026-10-19): admin_users (id, user_id, role, is_active, created_at, updated_at)
 * E-mail addresses live in auth.users, which the browser cannot read, so this module uses the
 * SECURITY DEFINER functions created by supabase/migrations/20261019_admin_media_and_product_delete.sql.
 * Granting access requires an existing Supabase Auth user (Dashboard → Authentication → Add user):
 * the browser cannot create Auth users without the secret key, by design.
 */

export const ADMIN_ROLES = ['super_admin', 'admin', 'editor'];

function rpcError(action, error) {
  if (error?.code === 'PGRST202') {
    return new Error(
      `${action}: the admin-user database functions are not installed. Run supabase/new-project/02_auth_functions_rls.sql in the Supabase SQL Editor (see supabase/new-project/README.md).`
    );
  }
  return dbError(action, error);
}

function normalizeAdminUser(u) {
  return {
    ...u,
    email: u.email || '(no Auth account)',
    full_name: u.email ? u.email.split('@')[0] : 'Unknown user',
    status: u.is_active === false ? 'suspended' : 'active',
    role: (u.role || 'admin').toLowerCase(),
  };
}

export async function getAdminUsers() {
  const { data, error } = await supabase.rpc('admin_list_admin_users');
  if (error) throw rpcError('Could not load admin users', error);
  return (data || []).map(normalizeAdminUser);
}

export async function createAdminUser({ email, role }) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!cleanEmail) throw new Error('E-mail is required.');
  if (!ADMIN_ROLES.includes(role)) throw new Error('Choose a valid role.');
  const { error } = await supabase.rpc('admin_grant_admin', { p_email: cleanEmail, p_role: role });
  if (error) throw rpcError(`Admin access was not granted to ${cleanEmail}`, error);
  return true;
}

export async function updateAdminUser(id, updates) {
  const params = {
    p_admin_id: id,
    p_role: updates.role ?? null,
    p_is_active: updates.status !== undefined ? updates.status === 'active' : updates.is_active ?? null,
  };
  const { error } = await supabase.rpc('admin_update_admin', params);
  if (error) throw rpcError('Admin user was not updated', error);
  return true;
}

export async function deleteAdminUser(id) {
  const { error } = await supabase.rpc('admin_revoke_admin', { p_admin_id: id });
  if (error) throw rpcError('Admin access was not revoked', error);
  return true;
}
