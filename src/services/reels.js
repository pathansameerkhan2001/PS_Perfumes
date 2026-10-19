import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { isValidUUID } from './products';
import { dbError, assertRows } from './dbErrors';

const LOCAL_REELS_KEY = 'ps_db_reels';

export const INITIAL_REELS = [
  {
    id: 'reel-01',
    instagram_url: 'https://www.instagram.com/ps_perfumes_kadapa/?hl=en',
    thumbnail_url: '/assets/reel-day-night.webp',
    caption: 'Day & Night — Aurum Luna Extrait de Parfum. Rich solar amber, sweet saffron & Cambodian oud.',
    title: 'Day & Night — Aurum Luna Extrait de Parfum. Rich solar amber, sweet saffron & Cambodian oud.',
    display_order: 1,
    is_active: true,
  },
  {
    id: 'reel-02',
    instagram_url: 'https://www.instagram.com/ps_perfumes_kadapa/?hl=en',
    thumbnail_url: '/assets/reel-runway.webp',
    caption: 'PS Special Oud Royale featured on the Red Carpet Fashion Runway. Aged 8 years in oak casks.',
    title: 'PS Special Oud Royale featured on the Red Carpet Fashion Runway. Aged 8 years in oak casks.',
    display_order: 2,
    is_active: true,
  },
  {
    id: 'reel-03',
    instagram_url: 'https://www.instagram.com/ps_perfumes_kadapa/?hl=en',
    thumbnail_url: '/assets/reel-festive-gift.webp',
    caption: 'Luxury Attar Gift Set Coffret — 4 pure concentrated non-alcoholic roll-ons in royal packaging.',
    title: 'Luxury Attar Gift Set Coffret — 4 pure concentrated non-alcoholic roll-ons in royal packaging.',
    display_order: 3,
    is_active: true,
  },
  {
    id: 'reel-04',
    instagram_url: 'https://www.instagram.com/ps_perfumes_kadapa/?hl=en',
    thumbnail_url: '/assets/reel-luxury-unboxing.webp',
    caption: 'Unboxing the Luxury Solid Wax Perfume Set with handcrafted gold slide tin flacons.',
    title: 'Unboxing the Luxury Solid Wax Perfume Set with handcrafted gold slide tin flacons.',
    display_order: 4,
    is_active: true,
  },
  {
    id: 'reel-05',
    instagram_url: 'https://www.instagram.com/ps_perfumes_kadapa/?hl=en',
    thumbnail_url: '/assets/reel-lifestyle-model.webp',
    caption: 'Timeless Elegance & Sillage: Noir Absolu & Velvet Oud aura for royal evening galas.',
    title: 'Timeless Elegance & Sillage: Noir Absolu & Velvet Oud aura for royal evening galas.',
    display_order: 5,
    is_active: true,
  },
];

function formatReel(row) {
  const captionText = row.title || row.caption || '';
  return {
    id: row.id,
    title: captionText,
    caption: captionText,
    instagram_url: row.instagram_url || '',
    thumbnail_url: row.thumbnail_url || '',
    thumbnail_path: row.thumbnail_path || '',
    display_order: Number(row.display_order) || 1,
    is_active: row.is_active !== false,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function getLocalReels() {
  try {
    const raw = localStorage.getItem(LOCAL_REELS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map((r) => formatReel(r));
      }
    }
  } catch {}

  const initial = INITIAL_REELS.map((r) => formatReel(r));
  try {
    localStorage.setItem(LOCAL_REELS_KEY, JSON.stringify(initial));
  } catch {}
  return initial;
}

function saveLocalReels(reels) {
  try {
    localStorage.setItem(LOCAL_REELS_KEY, JSON.stringify(reels));
  } catch {}
}

export async function getReels(all = false) {
  if (isSupabaseConfigured && supabase) {
    let query = supabase.from('instagram_reels').select('*').order('display_order', { ascending: true });
    if (!all) {
      query = query.eq('is_active', true);
    }
    const { data, error } = await query;
    if (error) throw dbError('Could not load Instagram reels', error);
    // The database answered: show its real state, never demo reels
    return (data || []).map((r) => formatReel(r));
  }

  const list = getLocalReels();
  return all ? list : list.filter((r) => r.is_active);
}

function toReelRow(reel) {
  const row = {};
  if (reel.caption !== undefined || reel.title !== undefined) row.title = reel.caption ?? reel.title ?? '';
  if (reel.instagram_url !== undefined) row.instagram_url = reel.instagram_url;
  if (reel.thumbnail_url !== undefined) row.thumbnail_url = reel.thumbnail_url || null;
  if (reel.thumbnail_path !== undefined) row.thumbnail_path = reel.thumbnail_path || null;
  if (reel.display_order !== undefined) row.display_order = Number(reel.display_order) || 1;
  if (reel.is_active !== undefined) row.is_active = Boolean(reel.is_active);
  return row;
}

export async function createReel(reel) {
  if (isSupabaseConfigured && supabase) {
    const payload = { display_order: 1, is_active: true, ...toReelRow(reel) };
    if (!payload.instagram_url) throw new Error('An Instagram URL is required.');
    if (!payload.thumbnail_url) throw new Error('A thumbnail image is required.');
    const { data, error } = await supabase.from('instagram_reels').insert([payload]).select().single();
    if (error || !data) throw dbError('Reel was not created', error);
    return { data: formatReel(data), error: null };
  }

  const newReel = formatReel({ ...reel, id: `reel-${Date.now()}`, created_at: new Date().toISOString() });
  saveLocalReels([...getLocalReels(), newReel]);
  return { data: newReel, error: null };
}

export async function updateReel(id, updates) {
  if (isSupabaseConfigured && supabase) {
    if (!isValidUUID(id)) throw new Error('This reel is not a database record. Reload the page.');
    const dbUpdates = { ...toReelRow(updates), updated_at: new Date().toISOString() };
    const { data, error } = await supabase.from('instagram_reels').update(dbUpdates).eq('id', id).select();
    if (error) throw dbError('Reel was not updated', error);
    assertRows(data, 'Reel was not updated');
    return { data: formatReel(data[0]), error: null };
  }

  const list = getLocalReels();
  const updated = list.map((r) => (r.id === id ? formatReel({ ...r, ...updates }) : r));
  saveLocalReels(updated);
  return { data: updated.find((r) => r.id === id), error: null };
}

export async function deleteReel(id) {
  if (isSupabaseConfigured && supabase) {
    if (!isValidUUID(id)) throw new Error('This reel is not a database record. Reload the page.');
    const { data, error } = await supabase.from('instagram_reels').delete().eq('id', id).select('id');
    if (error) throw dbError('Reel was not deleted', error);
    assertRows(data, 'Reel was not deleted');
    return { success: true };
  }

  saveLocalReels(getLocalReels().filter((r) => r.id !== id));
  return { success: true };
}
