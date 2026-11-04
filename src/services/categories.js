import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { isValidUUID } from './products';
import { cachedRequest, invalidateCached } from '../lib/requestCache';

const LOCAL_CATEGORIES_KEY = 'ps_db_categories';
// Storefront category reads share one cached request; admin reads (all = true) never use it
const CATEGORIES_CACHE_PREFIX = 'categories:';

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
    const load = async () => {
      let query = supabase.from('categories').select('*').order('display_order', { ascending: true });
      if (!all) query = query.eq('is_active', true);
      const { data, error } = await query;
      if (error) throw new Error(`Could not load categories: ${error.message}`);
      // The database answered: real categories only, never demo data
      return data || [];
    };
    // Header, footer, menu and category pages all ask for the active list: one request serves them
    return all ? load() : cachedRequest(`${CATEGORIES_CACHE_PREFIX}active`, load);
  }

  const list = getLocalCategories();
  return all ? list : list.filter((c) => c.is_active);
}

/**
 * Main categories, each with its subcategories, in display order.
 *
 * Works before and after Migration 12: without categories.parent_id (hasTree = false) every
 * category is a main category with no subcategories, exactly as the storefront behaved before.
 * A subcategory whose main category is not in rows (inactive, so hidden from visitors) is dropped.
 */
export function buildCategoryTree(rows) {
  const list = (rows || []).filter((r) => r && r.id && r.slug);
  const hasTree = list.some((r) => Object.prototype.hasOwnProperty.call(r, 'parent_id'));
  const byOrder = (a, b) =>
    (a.display_order || 0) - (b.display_order || 0) || String(a.name || '').localeCompare(String(b.name || ''));

  const mains = list
    .filter((r) => !hasTree || !r.parent_id)
    .sort(byOrder)
    .map((r) => ({ ...r, children: [] }));
  if (hasTree) {
    const mainById = new Map(mains.map((m) => [m.id, m]));
    list
      .filter((r) => r.parent_id)
      .sort(byOrder)
      .forEach((r) => mainById.get(r.parent_id)?.children.push(r));
  }
  return { hasTree, mains };
}

/*
 * Categories the storefront never lists as one of its main shopping categories: combo sets have
 * their own link (the homepage combo section) and fragrance creams belong under Body Care
 * (Migration 12). Their products stay reachable through the shop and search. A subcategory with
 * one of these slugs is not affected.
 */
export const NOT_MAIN_CATEGORY_SLUGS = ['combo-packs', 'fragrance-creams'];

/** The storefront's active category tree (shares the cached categories request). */
export async function getStorefrontCategoryTree() {
  const tree = buildCategoryTree(await getCategories(false));
  return {
    ...tree,
    mains: tree.mains.filter((m) => !NOT_MAIN_CATEGORY_SLUGS.includes(String(m.slug).toLowerCase())),
  };
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
        image_path: cat.image_path || null,
        display_order: Number(cat.display_order) || 1,
        is_active: cat.is_active !== undefined ? Boolean(cat.is_active) : true,
      };
      // Only sent when the database has subcategories (Migration 12): '' or null = main category
      if (cat.parent_id !== undefined) payload.parent_id = isValidUUID(cat.parent_id) ? cat.parent_id : null;

      const { data, error } = await supabase.from('categories').insert([payload]).select().single();
      if (!error && data) {
        invalidateCached(CATEGORIES_CACHE_PREFIX);
        createdRecord = data;
        const list = getLocalCategories();
        saveLocalCategories([...list, data]);
        return { data, error: null };
      } else if (error) {
        console.error('Supabase createCategory error:', error.message);
        // categories.slug is UNIQUE: explain duplicates instead of showing the raw constraint error
        if (error.code === '23505') {
          throw new Error(`A category with the slug "${payload.slug}" already exists. Edit the existing category instead of adding it again.`);
        }
        if (error.code === '42501') {
          throw new Error('This account is not allowed to create categories (database permission denied).');
        }
        throw new Error(`${error.message}${error.code ? ` (code ${error.code})` : ''}`);
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
      if (updates.image_path !== undefined) payload.image_path = updates.image_path || null;
      if (updates.display_order !== undefined) payload.display_order = Number(updates.display_order) || 1;
      if (updates.is_active !== undefined) payload.is_active = Boolean(updates.is_active);
      // Only sent when the database has subcategories (Migration 12); its trigger keeps two levels
      if (updates.parent_id !== undefined) payload.parent_id = isValidUUID(updates.parent_id) ? updates.parent_id : null;
      payload.updated_at = new Date().toISOString();

      const { data, error } = await supabase.from('categories').update(payload).eq('id', id).select();
      if (error) {
        throw new Error(error.message);
      }
      if (!data || data.length === 0) {
        throw new Error('No row was changed (missing record or no permission).');
      }
      invalidateCached(CATEGORIES_CACHE_PREFIX);
      return { data: data[0], error: null };
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
      const { count, error: countErr } = await supabase
        .from('products')
        .select('id', { count: 'exact', head: true })
        .eq('category_id', id);
      // Without a reliable count, do not delete: products would silently lose their category
      if (countErr) {
        return { success: false, error: `Could not check which products use this category: ${countErr.message}` };
      }

      if (count && count > 0) {
        return {
          success: false,
          error: `Cannot delete: ${count} product(s) are currently assigned to this category. Please reassign them to another category first.`,
        };
      }

      // A main category with subcategories cannot be deleted (parent_id is ON DELETE RESTRICT);
      // before Migration 12 the column does not exist and this check is skipped
      const { count: subCount, error: subErr } = await supabase
        .from('categories')
        .select('id', { count: 'exact', head: true })
        .eq('parent_id', id);
      if (!subErr && subCount > 0) {
        return {
          success: false,
          error: `Cannot delete: this category has ${subCount} subcategor${subCount === 1 ? 'y' : 'ies'}. Delete or move them first.`,
        };
      }

      const { data: deleted, error } = await supabase.from('categories').delete().eq('id', id).select('id');
      if (error) {
        return { success: false, error: error.message };
      }
      if (!deleted || deleted.length === 0) {
        return { success: false, error: 'Category was not deleted: no row changed (missing record or no permission).' };
      }
      invalidateCached(CATEGORIES_CACHE_PREFIX);
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  const list = getLocalCategories();
  saveLocalCategories(list.filter((c) => c.id !== id));
  return { success: true };
}
