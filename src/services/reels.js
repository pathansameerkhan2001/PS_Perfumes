import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { isValidUUID } from './products';

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
    instagram_url: row.instagram_url || 'https://www.instagram.com/ps_perfumes_kadapa/?hl=en',
    thumbnail_url: row.thumbnail_url || '/assets/reel-day-night.webp',
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
    try {
      let query = supabase.from('instagram_reels').select('*').order('display_order', { ascending: true });
      if (!all) {
        query = query.eq('is_active', true);
      }
      const { data, error } = await query;
      if (!error && Array.isArray(data) && data.length > 0) {
        return data.map((r) => formatReel(r));
      }
    } catch (e) {
      console.warn('Supabase getReels note:', e);
    }
  }

  const list = getLocalReels();
  return all ? list : list.filter((r) => r.is_active);
}

export async function createReel(reel) {
  let createdRecord = null;

  if (isSupabaseConfigured && supabase) {
    try {
      const payload = {
        title: reel.caption || reel.title || 'PS Perfumes Luxury Reel',
        instagram_url: reel.instagram_url || 'https://www.instagram.com/ps_perfumes_kadapa/?hl=en',
        thumbnail_url: reel.thumbnail_url || '',
        display_order: Number(reel.display_order) || 1,
        is_active: reel.is_active !== undefined ? Boolean(reel.is_active) : true,
      };

      const { data, error } = await supabase.from('instagram_reels').insert([payload]).select().single();
      if (!error && data) {
        createdRecord = formatReel(data);
        const list = getLocalReels();
        saveLocalReels([...list, createdRecord]);
        return { data: createdRecord, error: null };
      } else if (error) {
        console.error('Supabase createReel error:', error.message);
        throw new Error(error.message);
      }
    } catch (e) {
      console.error('Supabase createReel exception:', e);
      throw e;
    }
  }

  const newReel = formatReel({
    ...reel,
    id: `reel-${Date.now()}`,
    created_at: new Date().toISOString(),
  });

  const list = getLocalReels();
  const updated = [...list, newReel];
  saveLocalReels(updated);
  return { data: newReel, error: null };
}

export async function updateReel(id, updates) {
  if (isSupabaseConfigured && supabase && isValidUUID(id)) {
    try {
      const dbUpdates = {};
      if (updates.caption !== undefined || updates.title !== undefined) {
        dbUpdates.title = updates.caption || updates.title;
      }
      if (updates.instagram_url !== undefined) {
        dbUpdates.instagram_url = updates.instagram_url;
      }
      if (updates.thumbnail_url !== undefined) {
        dbUpdates.thumbnail_url = updates.thumbnail_url;
      }
      if (updates.display_order !== undefined) {
        dbUpdates.display_order = Number(updates.display_order);
      }
      if (updates.is_active !== undefined) {
        dbUpdates.is_active = Boolean(updates.is_active);
      }
      dbUpdates.updated_at = new Date().toISOString();

      const { data, error } = await supabase.from('instagram_reels').update(dbUpdates).eq('id', id).select().single();
      if (!error && data) {
        const formatted = formatReel(data);
        const list = getLocalReels();
        saveLocalReels(list.map((r) => (r.id === id ? formatted : r)));
        return { data: formatted, error: null };
      }
      if (error) {
        throw new Error(error.message);
      }
    } catch (e) {
      console.error('Supabase updateReel error:', e);
      throw e;
    }
  }

  const list = getLocalReels();
  const updated = list.map((r) => (r.id === id ? formatReel({ ...r, ...updates }) : r));
  saveLocalReels(updated);
  return { data: updated.find((r) => r.id === id), error: null };
}

export async function deleteReel(id) {
  if (isSupabaseConfigured && supabase && isValidUUID(id)) {
    try {
      const { error } = await supabase.from('instagram_reels').delete().eq('id', id);
      if (error) {
        throw new Error(error.message);
      }
    } catch (e) {
      console.error('Supabase deleteReel error:', e);
      throw e;
    }
  }

  const list = getLocalReels();
  saveLocalReels(list.filter((r) => r.id !== id));
  return { success: true };
}
