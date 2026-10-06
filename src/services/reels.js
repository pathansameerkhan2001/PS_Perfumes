import { supabase, isSupabaseConfigured } from '../lib/supabase';

const LOCAL_REELS_KEY = 'ps_db_reels';

export const INITIAL_REELS = [
  {
    id: 'reel-01',
    reel_id: 'DFX9302kd',
    instagram_url: 'https://www.instagram.com/ps_perfumes_kadapa/?hl=en',
    thumbnail_url: '/assets/reel-day-night.webp',
    caption: 'Day & Night — Aurum Luna Extrait de Parfum. Rich solar amber, sweet saffron & Cambodian oud.',
    display_order: 1,
    is_active: true,
  },
  {
    id: 'reel-02',
    reel_id: 'DFX9303ke',
    instagram_url: 'https://www.instagram.com/ps_perfumes_kadapa/?hl=en',
    thumbnail_url: '/assets/reel-runway.webp',
    caption: 'PS Special Oud Royale featured on the Red Carpet Fashion Runway. Aged 8 years in oak casks.',
    display_order: 2,
    is_active: true,
  },
  {
    id: 'reel-03',
    reel_id: 'DFX9304kf',
    instagram_url: 'https://www.instagram.com/ps_perfumes_kadapa/?hl=en',
    thumbnail_url: '/assets/reel-festive-gift.webp',
    caption: 'Luxury Attar Gift Set Coffret — 4 pure concentrated non-alcoholic roll-ons in royal packaging.',
    display_order: 3,
    is_active: true,
  },
  {
    id: 'reel-04',
    reel_id: 'DFX9305kg',
    instagram_url: 'https://www.instagram.com/ps_perfumes_kadapa/?hl=en',
    thumbnail_url: '/assets/reel-luxury-unboxing.webp',
    caption: 'Unboxing the Luxury Solid Wax Perfume Set with handcrafted gold slide tin flacons.',
    display_order: 4,
    is_active: true,
  },
  {
    id: 'reel-05',
    reel_id: 'DFX9306kh',
    instagram_url: 'https://www.instagram.com/ps_perfumes_kadapa/?hl=en',
    thumbnail_url: '/assets/reel-lifestyle-model.webp',
    caption: 'Timeless Elegance & Sillage: Noir Absolu & Velvet Oud aura for royal evening galas.',
    display_order: 5,
    is_active: true,
  },
];

function getLocalReels() {
  try {
    const raw = localStorage.getItem(LOCAL_REELS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}

  try {
    localStorage.setItem(LOCAL_REELS_KEY, JSON.stringify(INITIAL_REELS));
  } catch {}
  return INITIAL_REELS;
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
      if (!all) query = query.eq('is_active', true);
      const { data, error } = await query;
      if (!error && data && data.length > 0) return data;
    } catch {}
  }

  const list = getLocalReels();
  return all ? list : list.filter((r) => r.is_active);
}

export async function createReel(reel) {
  const newReel = {
    ...reel,
    id: reel.id || `reel-${Date.now()}`,
    instagram_url: reel.instagram_url || 'https://www.instagram.com/ps_perfumes_kadapa/?hl=en',
    display_order: Number(reel.display_order) || 1,
    is_active: reel.is_active !== undefined ? reel.is_active : true,
    created_at: new Date().toISOString(),
  };

  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase.from('instagram_reels').insert([newReel]).select().single();
      if (!error && data) {
        const list = getLocalReels();
        saveLocalReels([...list, data]);
        return { data, error: null };
      }
    } catch {}
  }

  const list = getLocalReels();
  const updated = [...list, newReel];
  saveLocalReels(updated);
  return { data: newReel, error: null };
}

export async function updateReel(id, updates) {
  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase.from('instagram_reels').update(updates).eq('id', id).select().single();
      if (!error && data) {
        const list = getLocalReels();
        saveLocalReels(list.map((r) => (r.id === id ? data : r)));
        return { data, error: null };
      }
    } catch {}
  }

  const list = getLocalReels();
  const updated = list.map((r) => (r.id === id ? { ...r, ...updates } : r));
  saveLocalReels(updated);
  return { data: updated.find((r) => r.id === id), error: null };
}

export async function deleteReel(id) {
  if (isSupabaseConfigured && supabase) {
    try {
      await supabase.from('instagram_reels').delete().eq('id', id);
    } catch {}
  }

  const list = getLocalReels();
  saveLocalReels(list.filter((r) => r.id !== id));
  return { success: true };
}
