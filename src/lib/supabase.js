import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl) {
  throw new Error('Missing VITE_SUPABASE_URL');
}

if (!supabasePublishableKey) {
  throw new Error('Missing VITE_SUPABASE_PUBLISHABLE_KEY');
}

// Host of the configured project, shown in connection error messages (public information)
export const SUPABASE_HOST = (() => {
  try {
    const parsed = new URL(supabaseUrl);
    if (parsed.protocol !== 'https:' && !import.meta.env.DEV) throw new Error('not https');
    return parsed.host;
  } catch {
    throw new Error(`VITE_SUPABASE_URL is not a valid https URL: "${supabaseUrl}"`);
  }
})();

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
// Bucket ids are case-sensitive. The new project uses "Ps-perfumes-media"; the old project
// used "ps-perfumes" (kept as the default so a build without the variable behaves as before).
export const STORAGE_BUCKET = (import.meta.env.VITE_SUPABASE_STORAGE_BUCKET || 'ps-perfumes').trim();
export const ADMIN_EMAIL = import.meta.env.VITE_ADMIN_EMAIL || 'brandnix.in@gmail.com';
