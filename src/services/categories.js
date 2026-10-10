import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { isValidUUID } from './products';

const LOCAL_CATEGORIES_KEY = 'ps_db_categories';

export const INITIAL_CATEGORIES = [
  {
    id: 'cat-01',
    name: 'Attar',
    slug: 'attar',
    description: '100% pure concentrated fragrance oils, non-alcoholic and artisanal distilled.',
    image_url: '/assets/combo-attar-set.webp',
    display_order: 1,
    is_active: true,
  },
  {
    id: 'cat-02',
    name: 'Perfume',
    slug: 'perfume',
    description: 'Haute Parfumerie & Extrait de Parfum crafted for enduring sillage.',
    image_url: '/assets/prod-royal-amber.webp',
    display_order: 2,
    is_active: true,
  },
  {
    id: 'cat-03',
    name: 'Bakhoor',
    slug: 'bakhoor',
    description: 'Exquisite aromatic wood chips soaked in perfumed essential oils for traditional incense rituals.',
    image_url: '/assets/promo-banner.webp',
    display_order: 3,
    is_active: true,
  },
  {
    id: 'cat-04',
    name: 'Musky',
    slug: 'musky',
    description: 'Sensual white musk, royal deer musk accords, and intimate velvet undertones.',
    image_url: '/assets/cat-unisex.webp',
    display_order: 4,
    is_active: true,
  },
  {
    id: 'cat-05',
    name: 'Oud',
    slug: 'oud',
    description: 'Precious aged Cambodi, Hindi, and Assam agarwood essences of royal lineage.',
    image_url: '/assets/combo-oud-trio.webp',
    display_order: 5,
    is_active: true,
  },
  {
    id: 'cat-06',
    name: 'Floral',
    slug: 'floral',
    description: 'Enchanting Bulgarian rose damascena, jasmine sambac, and ethereal blossoms.',
    image_url: '/assets/cat-women.webp',
    display_order: 6,
    is_active: true,
  },
  {
    id: 'cat-07',
    name: 'Woody',
    slug: 'woody',
    description: 'Smoked cedar, Mysore sandalwood, vetiver, and midnight birch accords.',
    image_url: '/assets/prod-noir-absolu.webp',
    display_order: 7,
    is_active: true,
  },
];

function getLocalCategories() {
  try {
    const raw = localStorage.getItem(LOCAL_CATEGORIES_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}

  try {
    localStorage.setItem(LOCAL_CATEGORIES_KEY, JSON.stringify(INITIAL_CATEGORIES));
  } catch {}
  return INITIAL_CATEGORIES;
}

function saveLocalCategories(cats) {
  try {
    localStorage.setItem(LOCAL_CATEGORIES_KEY, JSON.stringify(cats));
  } catch {}
}

export async function getCategories(all = false) {
  if (isSupabaseConfigured && supabase) {
    try {
      let query = supabase.from('categories').select('*').order('display_order', { ascending: true });
      if (!all) query = query.eq('is_active', true);
      const { data, error } = await query;
      if (!error && data && data.length > 0) return data;
    } catch (e) {
      console.warn('Supabase getCategories fallback:', e);
    }
  }

  const list = getLocalCategories();
  return all ? list : list.filter((c) => c.is_active);
}

export async function createCategory(cat) {
  let createdRecord = null;

  if (isSupabaseConfigured && supabase) {
    try {
      const payload = {
        name: cat.name,
        slug: cat.slug || cat.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        description: cat.description || '',
        image_url: cat.image_url || '',
        display_order: Number(cat.display_order) || 1,
        is_active: cat.is_active !== undefined ? Boolean(cat.is_active) : true,
      };

      const { data, error } = await supabase.from('categories').insert([payload]).select().single();
      if (!error && data) {
        createdRecord = data;
        const list = getLocalCategories();
        saveLocalCategories([...list, data]);
        return { data, error: null };
      } else if (error) {
        console.error('Supabase createCategory error:', error.message);
        throw new Error(error.message);
      }
    } catch (e) {
      console.error('Supabase createCategory exception:', e);
      throw e;
    }
  }

  const newCat = createdRecord || {
    ...cat,
    id: `cat-${Date.now()}`,
    slug: cat.slug || cat.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    display_order: Number(cat.display_order) || 1,
    is_active: cat.is_active !== undefined ? Boolean(cat.is_active) : true,
    created_at: new Date().toISOString(),
  };

  const list = getLocalCategories();
  const updated = [...list, newCat];
  saveLocalCategories(updated);
  return { data: newCat, error: null };
}

export async function updateCategory(id, updates) {
  if (isSupabaseConfigured && supabase && isValidUUID(id)) {
    try {
      const payload = {};
      if (updates.name !== undefined) payload.name = updates.name;
      if (updates.slug !== undefined) payload.slug = updates.slug;
      if (updates.description !== undefined) payload.description = updates.description;
      if (updates.image_url !== undefined) payload.image_url = updates.image_url;
      if (updates.display_order !== undefined) payload.display_order = Number(updates.display_order) || 1;
      if (updates.is_active !== undefined) payload.is_active = Boolean(updates.is_active);
      payload.updated_at = new Date().toISOString();

      const { data, error } = await supabase.from('categories').update(payload).eq('id', id).select().single();
      if (!error && data) {
        const list = getLocalCategories();
        saveLocalCategories(list.map((c) => (c.id === id ? data : c)));
        return { data, error: null };
      }
      if (error) {
        throw new Error(error.message);
      }
    } catch (e) {
      console.error('Supabase updateCategory error:', e);
      throw e;
    }
  }

  const list = getLocalCategories();
  const updated = list.map((c) => (c.id === id ? { ...c, ...updates } : c));
  saveLocalCategories(updated);
  return { data: updated.find((c) => c.id === id), error: null };
}

export async function deleteCategory(id) {
  if (isSupabaseConfigured && supabase && isValidUUID(id)) {
    try {
      // Check if products are currently linked to this category to protect foreign key relationships
      const { count } = await supabase
        .from('products')
        .select('id', { count: 'exact', head: true })
        .eq('category_id', id);

      if (count && count > 0) {
        return {
          success: false,
          error: `Cannot delete: ${count} product(s) are currently assigned to this category. Please reassign them to another category first.`,
        };
      }

      const { error } = await supabase.from('categories').delete().eq('id', id);
      if (error) {
        return { success: false, error: error.message };
      }
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  const list = getLocalCategories();
  saveLocalCategories(list.filter((c) => c.id !== id));
  return { success: true };
}
