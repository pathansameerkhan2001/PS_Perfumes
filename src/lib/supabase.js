import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl) {
  throw new Error('Missing VITE_SUPABASE_URL');
}

if (!supabasePublishableKey) {
  throw new Error('Missing VITE_SUPABASE_PUBLISHABLE_KEY');
}

export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

// Safe development validation (never logs actual key or secrets)
if (import.meta.env.DEV) {
  console.info('Supabase URL configured:', Boolean(supabaseUrl));
  console.info('Supabase publishable key configured:', Boolean(supabasePublishableKey));
}

export const isSupabaseConfigured = Boolean(supabaseUrl && supabasePublishableKey);
export const STORAGE_BUCKET = 'ps-perfumes';
export const ADMIN_EMAIL = import.meta.env.VITE_ADMIN_EMAIL || 'brandnix.in@gmail.com';
