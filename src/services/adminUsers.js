import { supabase, isSupabaseConfigured, ADMIN_EMAIL } from '../lib/supabase';

const LOCAL_ADMIN_USERS_KEY = 'ps_db_admin_users';

export const INITIAL_ADMIN_USERS = [
  {
    id: 'admin-01',
    email: ADMIN_EMAIL || 'brandnix.in@gmail.com',
    full_name: 'Master Parfumeur / Super Admin',
    role: 'Super Admin',
    status: 'active',
    last_login: new Date().toISOString(),
    created_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'admin-02',
    email: 'atelier@psperfumes.in',
    full_name: 'Kadapa Atelier Operations',
    role: 'Store Manager',
    status: 'active',
    last_login: '2026-10-06T14:22:00Z',
    created_at: '2026-03-15T00:00:00Z',
  },
  {
    id: 'admin-03',
    email: 'inventory@psperfumes.in',
    full_name: 'Fragrance Vault Custodian',
    role: 'Inventory Specialist',
    status: 'active',
    last_login: '2026-10-05T09:12:00Z',
    created_at: '2026-05-10T00:00:00Z',
  },
];

function getLocalAdminUsers() {
  try {
    const raw = localStorage.getItem(LOCAL_ADMIN_USERS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (e) {
    console.error('Error reading local admin users', e);
  }
  try {
    localStorage.setItem(LOCAL_ADMIN_USERS_KEY, JSON.stringify(INITIAL_ADMIN_USERS));
  } catch {}
  return INITIAL_ADMIN_USERS;
}

function saveLocalAdminUsers(users) {
  try {
    localStorage.setItem(LOCAL_ADMIN_USERS_KEY, JSON.stringify(users));
  } catch (e) {
    console.error('Error saving local admin users', e);
  }
}

export async function getAdminUsers() {
  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase.from('admin_users').select('*').order('created_at', { ascending: false });
      if (!error && Array.isArray(data) && data.length > 0) {
        return data;
      }
    } catch (e) {
      console.warn('Supabase getAdminUsers error, fallback:', e);
    }
  }

  return getLocalAdminUsers();
}

export async function createAdminUser(userData) {
  const newUser = {
    id: `admin-${Date.now()}`,
    ...userData,
    status: userData.status || 'active',
    created_at: new Date().toISOString(),
  };

  if (isSupabaseConfigured && supabase) {
    try {
      await supabase.from('admin_users').insert([newUser]);
    } catch (e) {
      console.warn('Supabase createAdminUser error:', e);
    }
  }

  const list = getLocalAdminUsers();
  list.unshift(newUser);
  saveLocalAdminUsers(list);
  return newUser;
}

export async function updateAdminUser(id, updates) {
  if (isSupabaseConfigured && supabase) {
    try {
      await supabase.from('admin_users').update(updates).eq('id', id);
    } catch (e) {
      console.warn('Supabase updateAdminUser error:', e);
    }
  }

  const list = getLocalAdminUsers();
  const idx = list.findIndex((u) => u.id === id);
  if (idx > -1) {
    list[idx] = { ...list[idx], ...updates };
    saveLocalAdminUsers(list);
    return list[idx];
  }
  return null;
}

export async function deleteAdminUser(id) {
  if (isSupabaseConfigured && supabase) {
    try {
      await supabase.from('admin_users').delete().eq('id', id);
    } catch (e) {
      console.warn('Supabase deleteAdminUser error:', e);
    }
  }

  const list = getLocalAdminUsers();
  const filtered = list.filter((u) => u.id !== id);
  saveLocalAdminUsers(filtered);
  return true;
}
