import { supabase, isSupabaseConfigured } from '../lib/supabase';

const LOCAL_SETTINGS_KEY = 'ps_db_site_settings';

export const INITIAL_SETTINGS = {
  brand_name: 'PS PERFUMES',
  tagline: 'Haute Parfumerie & Luxury Fragrances',
  logo_url: '/assets/ps-perfumes-logo.webp',
  contact_email: 'brandnix.in@gmail.com',
  phone: '+91 94949 51600',
  address: 'Kadapa, Andhra Pradesh, India – 516001',
  city: 'Kadapa',
  state: 'Andhra Pradesh',
  pincode: '516001',
  instagram_url: 'https://www.instagram.com/ps_perfumes_kadapa/?hl=en',
  google_maps_url: 'https://share.google/b0yildKJKTaGc365J',
  whatsapp_url: 'https://wa.me/919494951600',
  free_shipping_threshold: 999,
  standard_shipping_fee: 99,
  currency: 'INR',
  currency_symbol: '₹',
  store_status: 'open',
  website_url: 'https://psperfumes.com',
};

function getLocalSettings() {
  try {
    const raw = localStorage.getItem(LOCAL_SETTINGS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return INITIAL_SETTINGS;
}

function saveLocalSettings(settings) {
  try {
    localStorage.setItem(LOCAL_SETTINGS_KEY, JSON.stringify(settings));
  } catch {}
}

export async function getSiteSettings() {
  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase.from('site_settings').select('*').limit(1).maybeSingle();
      if (!error && data) return data;
    } catch {}
  }
  return getLocalSettings();
}

export async function updateSiteSettings(settingsUpdates) {
  const merged = { ...getLocalSettings(), ...settingsUpdates, updated_at: new Date().toISOString() };

  if (isSupabaseConfigured && supabase) {
    try {
      const { data: existing } = await supabase.from('site_settings').select('id').limit(1).maybeSingle();
      if (existing?.id) {
        await supabase.from('site_settings').update(merged).eq('id', existing.id);
      } else {
        await supabase.from('site_settings').insert([merged]);
      }
    } catch {}
  }

  saveLocalSettings(merged);
  return { data: merged, error: null };
}
