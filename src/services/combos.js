import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { isValidUUID } from './products';
import comboAttarSet from '../assets/combo-attar-set.webp';
import comboAttar12Pcs from '../assets/combo-attar-12pcs.webp';
import comboOudTrio from '../assets/combo-oud-trio.webp';
import comboSolidPerfume from '../assets/combo-solid-perfume.webp';
import promoBanner from '../assets/promo-banner.webp';
import prodRoyalAmber from '../assets/prod-royal-amber.webp';
import prodNoirAbsolu from '../assets/prod-noir-absolu.webp';

const LOCAL_COMBOS_KEY = 'ps_db_combos';

export const INITIAL_COMBOS = [
  {
    id: 'combo-01',
    name: 'Premium Oud Collection',
    slug: 'premium-oud-collection',
    category: 'Combo Pack',
    description: 'A perfect combination of our signature Oud, Musky, and Bakhoor fragrances in bespoke artisanal flacons.',
    image_url: promoBanner,
    combo_price: 2499,
    original_price: 3199,
    discount: 22,
    stock: 25,
    bestseller: true,
    featured: true,
    is_active: true,
    display_order: 1,
    rating: 5.0,
    review_count: 156,
    items: [
      {
        product_name: 'Oud Royal',
        bottle_type: 'Glass Bottle',
        size_ml: '50 ml',
        quantity: 1,
        subtitle: 'Premium quality glass flacon with 18k gold detailing',
        image: prodRoyalAmber,
      },
      {
        product_name: 'Musky Noir',
        bottle_type: 'PVC Bottle',
        size_ml: '50 ml',
        quantity: 1,
        subtitle: 'Travel-safe luxury flacon for daily wear',
        image: prodNoirAbsolu,
      },
      {
        product_name: 'Bakhoor Classic',
        bottle_type: 'Glass Bottle',
        size_ml: '50 ml',
        quantity: 1,
        subtitle: 'Pure royal agarwood incense extraction',
        image: promoBanner,
      },
    ],
  },
  {
    id: 'combo-02',
    name: 'PS Attar Gift Set (Pack of 4)',
    slug: 'ps-attar-gift-set-pack-of-4',
    category: 'Combo Pack',
    description: 'Four royal concentrated non-alcoholic roll-ons in a luxury gold coffret.',
    image_url: comboAttarSet,
    combo_price: 549,
    original_price: 996,
    discount: 45,
    stock: 40,
    bestseller: true,
    featured: false,
    is_active: true,
    display_order: 2,
    rating: 4.9,
    review_count: 82,
    items: [
      {
        product_name: 'White London Attar',
        bottle_type: 'Glass Bottle',
        size_ml: '6 ml',
        quantity: 1,
        subtitle: 'Pure concentrated attar roll-on',
        image: comboAttarSet,
      },
      {
        product_name: 'Dehn Al Oud Attar',
        bottle_type: 'Glass Bottle',
        size_ml: '6 ml',
        quantity: 1,
        subtitle: 'Traditional wood-distilled extraction',
        image: comboAttarSet,
      },
      {
        product_name: 'Musk Rijali Attar',
        bottle_type: 'Glass Bottle',
        size_ml: '6 ml',
        quantity: 1,
        subtitle: 'Powdery soft royal deer musk note',
        image: comboAttarSet,
      },
      {
        product_name: 'Mogra Floral Attar',
        bottle_type: 'Glass Bottle',
        size_ml: '6 ml',
        quantity: 1,
        subtitle: 'Fresh blooming night jasmine extract',
        image: comboAttarSet,
      },
    ],
  },
  {
    id: 'combo-03',
    name: 'Hashmi Oud & White Oud Trio',
    slug: 'hashmi-oud-white-oud-trio',
    category: 'Combo Pack',
    description: 'Three timeless agarwood extractions, hand-distilled in vintage brass cauldrons.',
    image_url: comboOudTrio,
    combo_price: 549,
    original_price: 747,
    discount: 26,
    stock: 18,
    bestseller: false,
    featured: true,
    is_active: true,
    display_order: 3,
    rating: 5.0,
    review_count: 24,
    items: [
      {
        product_name: 'Hashmi Oud',
        bottle_type: 'Glass Bottle',
        size_ml: '50 ml',
        quantity: 1,
        subtitle: 'Spiced ambergris and Hindi agarwood',
        image: comboOudTrio,
      },
      {
        product_name: 'Ameer Al Oud',
        bottle_type: 'Glass Bottle',
        size_ml: '50 ml',
        quantity: 1,
        subtitle: 'Smoky caramel and Cambodian oud wood',
        image: comboOudTrio,
      },
      {
        product_name: 'White Oud',
        bottle_type: 'PVC Bottle',
        size_ml: '50 ml',
        quantity: 1,
        subtitle: 'Silken clean musk and white oud',
        image: comboOudTrio,
      },
    ],
  },
  {
    id: 'combo-04',
    name: 'Luxury Solid Wax Perfume Set',
    slug: 'luxury-solid-wax-perfume-set',
    category: 'Combo Pack',
    description: 'Four handcrafted pocket-sized solid wax perfumes in luxury pastel sliding tins.',
    image_url: comboSolidPerfume,
    combo_price: 1050,
    original_price: 2000,
    discount: 47,
    stock: 15,
    bestseller: false,
    featured: false,
    is_active: true,
    display_order: 4,
    rating: 4.8,
    review_count: 19,
    items: [
      {
        product_name: 'Jasmin Étoilé Wax',
        bottle_type: 'Metal Tin',
        size_ml: '10g',
        quantity: 1,
        subtitle: 'Natural beeswax with pure night jasmine',
        image: comboSolidPerfume,
      },
      {
        product_name: 'Néroli Doux Wax',
        bottle_type: 'Metal Tin',
        size_ml: '10g',
        quantity: 1,
        subtitle: 'Sweet orange blossom and citrus note',
        image: comboSolidPerfume,
      },
      {
        product_name: 'Cèdre Royal Wax',
        bottle_type: 'Metal Tin',
        size_ml: '10g',
        quantity: 1,
        subtitle: 'Smoked cedarwood and earthy patchouli',
        image: comboSolidPerfume,
      },
      {
        product_name: 'Rose Velours Wax',
        bottle_type: 'Metal Tin',
        size_ml: '10g',
        quantity: 1,
        subtitle: 'Velvet damask rose with honeyed amber',
        image: comboSolidPerfume,
      },
    ],
  },
  {
    id: 'combo-05',
    name: 'Imperial 12 Attar Master Collection',
    slug: 'imperial-12-attar-master-collection',
    category: 'Combo Pack',
    description: 'Complete olfactory wardrobe featuring twelve pure attar flacons in an imperial velvet coffret.',
    image_url: comboAttar12Pcs,
    combo_price: 1899,
    original_price: 3600,
    discount: 47,
    stock: 12,
    bestseller: true,
    featured: true,
    is_active: true,
    display_order: 5,
    rating: 5.0,
    review_count: 47,
    items: [
      {
        product_name: '12-Piece Artisanal Attar Set',
        bottle_type: 'Glass Bottle',
        size_ml: '12 x 3 ml',
        quantity: 1,
        subtitle: 'Full spectrum from floral, musky, to deep smoky agarwood',
        image: comboAttar12Pcs,
      },
    ],
  },
];

function getLocalCombos() {
  try {
    const raw = localStorage.getItem(LOCAL_COMBOS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (e) {
    console.error('Error reading local combos', e);
  }
  try {
    localStorage.setItem(LOCAL_COMBOS_KEY, JSON.stringify(INITIAL_COMBOS));
  } catch {}
  return INITIAL_COMBOS;
}

function saveLocalCombos(combos) {
  try {
    localStorage.setItem(LOCAL_COMBOS_KEY, JSON.stringify(combos));
  } catch (e) {
    console.error('Error saving local combos', e);
  }
}

export async function getCombos(options = {}) {
  const { bestseller, featured, activeOnly = true } = options;

  if (isSupabaseConfigured && supabase) {
    try {
      let query = supabase.from('combos').select('*, combo_items(*)').order('display_order', { ascending: true });
      if (activeOnly) query = query.eq('is_active', true);
      if (bestseller !== undefined) query = query.eq('bestseller', bestseller);
      if (featured !== undefined) query = query.eq('featured', featured);

      const { data, error } = await query;
      if (!error && Array.isArray(data) && data.length > 0) {
        return data.map((c) => ({
          ...c,
          items: c.combo_items || [],
        }));
      }
    } catch (e) {
      console.warn('Falling back to local combos:', e);
    }
  }

  let list = getLocalCombos();
  if (activeOnly) list = list.filter((c) => c.is_active !== false);
  if (bestseller !== undefined) list = list.filter((c) => Boolean(c.bestseller) === bestseller);
  if (featured !== undefined) list = list.filter((c) => Boolean(c.featured) === featured);
  return list;
}

export async function getComboBySlug(slug) {
  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase
        .from('combos')
        .select('*, combo_items(*)')
        .eq('slug', slug)
        .single();
      if (!error && data) {
        return {
          ...data,
          items: data.combo_items || [],
        };
      }
    } catch (e) {
      console.warn('Supabase getComboBySlug error, falling back:', e);
    }
  }

  const list = getLocalCombos();
  return list.find((c) => c.slug === slug || c.id === slug) || null;
}

export async function getComboById(id) {
  return getComboBySlug(id);
}

export async function createCombo(comboData) {
  const autoSlug =
    comboData.slug ||
    comboData.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

  let createdCombo = null;

  if (isSupabaseConfigured && supabase) {
    try {
      const { items, ...mainData } = comboData;
      const payload = {
        name: mainData.name,
        slug: autoSlug,
        category: mainData.category || 'Combo Pack',
        description: mainData.description || '',
        image_url: mainData.image_url || '',
        combo_price: Number(mainData.combo_price) || 0,
        original_price: Number(mainData.original_price) || 0,
        discount: Number(mainData.discount) || 0,
        stock: Number(mainData.stock) || 10,
        bestseller: Boolean(mainData.bestseller),
        featured: Boolean(mainData.featured),
        is_active: mainData.active !== undefined ? Boolean(mainData.active) : true,
      };

      const { data, error } = await supabase.from('combos').insert([payload]).select().single();
      if (!error && data) {
        createdCombo = data;
        if (items && items.length > 0) {
          const itemRows = items.map((it) => ({
            combo_id: data.id,
            product_name: it.product_name,
            bottle_type: it.bottle_type || 'Glass Bottle',
            size_ml: it.size_ml || '50 ml',
            quantity: Number(it.quantity) || 1,
            product_image: it.image || it.product_image || '',
          }));
          await supabase.from('combo_items').insert(itemRows);
        }
      } else if (error) {
        console.warn('Supabase createCombo note:', error.message);
      }
    } catch (e) {
      console.warn('Supabase createCombo error, saved locally:', e);
    }
  }

  const newCombo = createdCombo ? { ...createdCombo, items: comboData.items || [] } : {
    id: `combo-${Date.now()}`,
    slug: autoSlug,
    ...comboData,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const list = getLocalCombos();
  list.unshift(newCombo);
  saveLocalCombos(list);
  return newCombo;
}

export async function updateCombo(id, updates) {
  if (isSupabaseConfigured && supabase && isValidUUID(id)) {
    try {
      const { items, ...mainUpdates } = updates;
      const payload = {};
      if (mainUpdates.name !== undefined) payload.name = mainUpdates.name;
      if (mainUpdates.slug !== undefined) payload.slug = mainUpdates.slug;
      if (mainUpdates.category !== undefined) payload.category = mainUpdates.category;
      if (mainUpdates.description !== undefined) payload.description = mainUpdates.description;
      if (mainUpdates.image_url !== undefined) payload.image_url = mainUpdates.image_url;
      if (mainUpdates.combo_price !== undefined) payload.combo_price = Number(mainUpdates.combo_price);
      if (mainUpdates.original_price !== undefined) payload.original_price = Number(mainUpdates.original_price);
      if (mainUpdates.discount !== undefined) payload.discount = Number(mainUpdates.discount);
      if (mainUpdates.stock !== undefined) payload.stock = Number(mainUpdates.stock);
      if (mainUpdates.bestseller !== undefined) payload.bestseller = Boolean(mainUpdates.bestseller);
      if (mainUpdates.featured !== undefined) payload.featured = Boolean(mainUpdates.featured);
      if (mainUpdates.active !== undefined) payload.is_active = Boolean(mainUpdates.active);
      if (mainUpdates.is_active !== undefined) payload.is_active = Boolean(mainUpdates.is_active);
      payload.updated_at = new Date().toISOString();

      await supabase.from('combos').update(payload).eq('id', id);

      if (items && Array.isArray(items)) {
        await supabase.from('combo_items').delete().eq('combo_id', id);
        const itemRows = items.map((it) => ({
          combo_id: id,
          product_name: it.product_name,
          bottle_type: it.bottle_type || 'Glass Bottle',
          size_ml: it.size_ml || '50 ml',
          quantity: Number(it.quantity) || 1,
          product_image: it.image || it.product_image || '',
        }));
        await supabase.from('combo_items').insert(itemRows);
      }
    } catch (e) {
      console.warn('Supabase updateCombo error:', e);
    }
  }

  const list = getLocalCombos();
  const idx = list.findIndex((c) => c.id === id);
  if (idx > -1) {
    list[idx] = { ...list[idx], ...updates, updated_at: new Date().toISOString() };
    saveLocalCombos(list);
    return list[idx];
  }
  return null;
}

export async function deleteCombo(id) {
  if (isSupabaseConfigured && supabase && isValidUUID(id)) {
    try {
      await supabase.from('combo_items').delete().eq('combo_id', id);
      await supabase.from('combos').delete().eq('id', id);
    } catch (e) {
      console.warn('Supabase deleteCombo error:', e);
    }
  }

  const list = getLocalCombos();
  const filtered = list.filter((c) => c.id !== id);
  saveLocalCombos(filtered);
  return true;
}
