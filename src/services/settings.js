import { supabase } from '../lib/supabase';
import { dbError } from './dbErrors';

/*
 * Live schema (verified 2026-10-19): settings are key/value rows
 *   store_settings (id, setting_key, setting_value, created_at, updated_at)
 * There is no site_settings table. Each field below is stored under its own setting_key.
 * Values are written as text and converted back to numbers for numeric fields.
 */

// Defaults shown until a value is saved in the database (real business contact details)
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
  free_shipping_threshold: 1500, // matches the cart rule used before this setting is saved
  standard_shipping_fee: 99,
  currency: 'INR',
  currency_symbol: '₹',
  store_status: 'open',
  website_url: 'https://psperfumes.com',
};

const SETTING_KEYS = Object.keys(INITIAL_SETTINGS);
const NUMERIC_KEYS = new Set(['free_shipping_threshold', 'standard_shipping_fee']);

function decodeValue(key, raw) {
  let value = raw;
  // jsonb columns may return a JSON string; text columns return plain text
  if (value && typeof value === 'object' && 'value' in value) value = value.value;
  if (NUMERIC_KEYS.has(key)) {
    const n = Number(value);
    return Number.isFinite(n) ? n : INITIAL_SETTINGS[key];
  }
  return value === null || value === undefined ? '' : String(value);
}

/**
 * Returns all settings: stored values override the defaults.
 * `_storedKeys` lists the keys that actually exist in the database.
 */
export async function getSiteSettings() {
  const { data, error } = await supabase
    .from('store_settings')
    .select('setting_key, setting_value')
    .in('setting_key', SETTING_KEYS);
  if (error) throw dbError('Could not load store settings', error);

  const merged = { ...INITIAL_SETTINGS };
  const storedKeys = [];
  (data || []).forEach((row) => {
    if (SETTING_KEYS.includes(row.setting_key)) {
      merged[row.setting_key] = decodeValue(row.setting_key, row.setting_value);
      storedKeys.push(row.setting_key);
    }
  });
  return { ...merged, _storedKeys: storedKeys };
}

/** Saves every known setting; updates existing keys and inserts missing ones. */
export async function updateSiteSettings(settingsUpdates) {
  const { data: existing, error: readErr } = await supabase
    .from('store_settings')
    .select('id, setting_key')
    .in('setting_key', SETTING_KEYS);
  if (readErr) throw dbError('Could not read store settings', readErr);

  const idByKey = new Map((existing || []).map((r) => [r.setting_key, r.id]));
  const now = new Date().toISOString();
  const inserts = [];

  for (const key of SETTING_KEYS) {
    if (settingsUpdates[key] === undefined) continue;
    const value = String(settingsUpdates[key] ?? '');
    const id = idByKey.get(key);
    if (id) {
      const { data, error } = await supabase
        .from('store_settings')
        .update({ setting_value: value, updated_at: now })
        .eq('id', id)
        .select('id');
      if (error) throw dbError(`Setting "${key}" was not saved`, error);
      if (!data || data.length === 0) {
        throw new Error(`Setting "${key}" was not saved: no row changed (permission denied?).`);
      }
    } else {
      inserts.push({ setting_key: key, setting_value: value });
    }
  }

  if (inserts.length > 0) {
    const { data, error } = await supabase.from('store_settings').insert(inserts).select('id');
    if (error) throw dbError('New settings were not saved', error);
    if ((data || []).length !== inserts.length) {
      throw new Error('Some new settings were not saved (permission denied?).');
    }
  }

  return { data: await getSiteSettings(), error: null };
}
