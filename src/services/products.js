import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { PRODUCTS } from '../data/products';

const LOCAL_PRODUCTS_KEY = 'ps_db_products';

export const STANDARD_SIZES = ['30 ml', '50 ml', '100 ml'];
export const STANDARD_BOTTLE_TYPES = ['Glass Bottle', 'PVC Bottle'];

/**
 * Generate standard variant matrix for a product if variants don't exist
 */
export function generateDefaultVariants(p) {
  const basePrice = Number(p.price) || 1499;
  const baseCompare = Number(p.compare_at_price || p.originalPrice) || Math.round(basePrice * 1.33);

  const glassRatios = {
    '30 ml': { price: basePrice, compare: baseCompare, stock: 20 },
    '50 ml': { price: Math.round(basePrice * 1.467), compare: Math.round(baseCompare * 1.467), stock: 15 },
    '100 ml': { price: Math.round(basePrice * 2.2), compare: Math.round(baseCompare * 2.2), stock: 8 },
  };

  const pvcRatios = {
    '30 ml': { price: Math.round(basePrice * 0.6), compare: Math.round(baseCompare * 0.6), stock: 40 },
    '50 ml': { price: Math.round(basePrice * 0.867), compare: Math.round(baseCompare * 0.867), stock: 25 },
    '100 ml': { price: Math.round(basePrice * 1.267), compare: Math.round(baseCompare * 1.267), stock: 12 },
  };

  const variants = [];

  // Glass Variants
  STANDARD_SIZES.forEach((sz) => {
    const config = glassRatios[sz];
    const sizeNum = sz.replace(/\D/g, '');
    variants.push({
      id: `var-${p.id}-glass-${sizeNum}`,
      product_id: p.id,
      bottle_type: 'Glass Bottle',
      size_ml: sz,
      price: config.price,
      sale_price: config.price,
      compare_at_price: config.compare,
      stock: config.stock,
      sku: `PS-${p.id.toUpperCase()}-GL-${sizeNum}`,
      active: true,
      is_active: true,
    });
  });

  // PVC Variants
  STANDARD_SIZES.forEach((sz) => {
    const config = pvcRatios[sz];
    const sizeNum = sz.replace(/\D/g, '');
    variants.push({
      id: `var-${p.id}-pvc-${sizeNum}`,
      product_id: p.id,
      bottle_type: 'PVC Bottle',
      size_ml: sz,
      price: config.price,
      sale_price: config.price,
      compare_at_price: config.compare,
      stock: config.stock,
      sku: `PS-${p.id.toUpperCase()}-PV-${sizeNum}`,
      active: true,
      is_active: true,
    });
  });

  return variants;
}

// Helper to convert catalog item to standard schema with variants
export function formatProduct(p) {
  const slug = p.slug || p.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const variants = p.variants && p.variants.length > 0 ? p.variants : (p.product_variants && p.product_variants.length > 0 ? p.product_variants : generateDefaultVariants(p));

  return {
    id: p.id,
    name: p.name,
    slug: slug,
    category: p.category || 'Perfume',
    subcategory: p.subcategory || (p.subcategories?.[0] || ''),
    description: p.description || '',
    short_description: p.short_description || p.description?.slice(0, 140) + '...' || '',
    price: Number(p.price) || (variants[0] ? variants[0].price : 999),
    sale_price: p.sale_price ? Number(p.sale_price) : (p.originalPrice ? Number(p.price) : null),
    compare_at_price: p.compare_at_price ? Number(p.compare_at_price) : (p.originalPrice ? Number(p.originalPrice) : null),
    sku: p.sku || `PS-${p.id.toUpperCase()}`,
    stock: p.stock !== undefined ? p.stock : (p.inStock ? 25 : 0),
    status: p.status || (p.inStock !== false ? 'active' : 'out_of_stock'),
    featured: Boolean(p.featured || p.isBestSeller),
    new_arrival: Boolean(p.new_arrival || p.isNewArrival),
    bestseller: Boolean(p.bestseller || p.isBestSeller),
    rating: Number(p.rating) || 5.0,
    review_count: Number(p.reviewCount || p.review_count) || 28,
    main_image: p.main_image || p.image || '/assets/prod-royal-amber.webp',
    gallery_images: p.gallery_images || (p.secondaryImage ? [p.secondaryImage] : []),
    bottle_types: p.bottle_types || STANDARD_BOTTLE_TYPES,
    sizes: p.sizes || STANDARD_SIZES,
    variants: variants,
    fragrance_notes: p.fragrance_notes || [],
    top_notes: p.top_notes || p.topNotes || [],
    heart_notes: p.heart_notes || p.heartNotes || [],
    base_notes: p.base_notes || p.baseNotes || [],
    ingredients: p.ingredients || 'Alcohol Denat., Parfum (Fragrance), Aqua (Water), Limonene, Linalool, Citronellol, Geraniol, Coumarin, Eugenol.',
    occasion: p.occasion || 'Evening & Royal Occasions',
    gender: p.gender || 'Unisex',
    tags: p.tags || ['luxury', 'extrait', 'artisanal'],
    created_at: p.created_at || new Date().toISOString(),
    updated_at: p.updated_at || new Date().toISOString(),
  };
}

// Initialize local store from catalog data if needed
function getLocalProducts() {
  try {
    const raw = localStorage.getItem(LOCAL_PRODUCTS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map((p) => ({
          ...p,
          variants: p.variants && p.variants.length > 0 ? p.variants : generateDefaultVariants(p),
        }));
      }
    }
  } catch (e) {
    console.error('Error reading local products', e);
  }

  // Seed from catalog data
  const initial = PRODUCTS.map(formatProduct);
  try {
    localStorage.setItem(LOCAL_PRODUCTS_KEY, JSON.stringify(initial));
  } catch {}
  return initial;
}

function saveLocalProducts(products) {
  try {
    localStorage.setItem(LOCAL_PRODUCTS_KEY, JSON.stringify(products));
  } catch (e) {
    console.error('Error saving local products', e);
  }
}

/**
 * Fetch products with optional filtering and sorting
 */
export async function getProducts(options = {}) {
  const {
    category,
    status = 'active',
    featured,
    new_arrival,
    bestseller,
    search,
    sort = 'featured',
    allStatuses = false,
    limit,
  } = options;

  if (isSupabaseConfigured && supabase) {
    try {
      let query = supabase.from('products').select('*, product_variants(*)');

      if (!allStatuses && status) {
        query = query.eq('status', status);
      }
      if (category && category !== 'ALL') {
        query = query.ilike('category', `%${category}%`);
      }
      if (featured !== undefined) {
        query = query.eq('featured', featured);
      }
      if (new_arrival !== undefined) {
        query = query.eq('new_arrival', new_arrival);
      }
      if (bestseller !== undefined) {
        query = query.eq('bestseller', bestseller);
      }
      if (search) {
        query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%,category.ilike.%${search}%`);
      }

      if (sort === 'price-low') {
        query = query.order('price', { ascending: true });
      } else if (sort === 'price-high') {
        query = query.order('price', { ascending: false });
      } else if (sort === 'rating') {
        query = query.order('rating', { ascending: false });
      } else if (sort === 'newest') {
        query = query.order('created_at', { ascending: false });
      } else {
        query = query.order('featured', { ascending: false }).order('created_at', { ascending: false });
      }

      if (limit) {
        query = query.limit(limit);
      }

      const { data, error } = await query;
      if (!error && Array.isArray(data) && data.length > 0) {
        return data.map((item) => formatProduct(item));
      }
    } catch (e) {
      console.warn('Supabase getProducts fallback to local store:', e);
    }
  }

  // Fallback to local products
  let list = getLocalProducts();

  if (!allStatuses && status) {
    list = list.filter((p) => p.status === status);
  }
  if (category && category !== 'ALL') {
    const term = category.toLowerCase();
    list = list.filter((p) => p.category.toLowerCase().includes(term) || (p.subcategory && p.subcategory.toLowerCase().includes(term)));
  }
  if (featured !== undefined) {
    list = list.filter((p) => Boolean(p.featured) === featured);
  }
  if (new_arrival !== undefined) {
    list = list.filter((p) => Boolean(p.new_arrival) === new_arrival);
  }
  if (bestseller !== undefined) {
    list = list.filter((p) => Boolean(p.bestseller) === bestseller);
  }
  if (search) {
    const q = search.toLowerCase();
    list = list.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q)
    );
  }

  if (sort === 'price-low') {
    list.sort((a, b) => a.price - b.price);
  } else if (sort === 'price-high') {
    list.sort((a, b) => b.price - a.price);
  } else if (sort === 'rating') {
    list.sort((a, b) => b.rating - a.rating);
  } else if (sort === 'newest') {
    list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }

  if (limit) {
    list = list.slice(0, limit);
  }

  return list;
}

/**
 * Fetch a single product by slug or id
 */
export async function getProductBySlug(slugOrId) {
  if (isSupabaseConfigured && supabase) {
    try {
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slugOrId);
      const query = supabase
        .from('products')
        .select('*, product_variants(*)')
        .or(isUUID ? `id.eq.${slugOrId},slug.eq.${slugOrId}` : `slug.eq.${slugOrId}`);

      const { data, error } = await query.maybeSingle();
      if (!error && data) {
        return formatProduct(data);
      }
    } catch (e) {
      console.warn('Supabase getProductBySlug fallback:', e);
    }
  }

  const list = getLocalProducts();
  const found = list.find((p) => p.slug === slugOrId || p.id === slugOrId);
  return found ? formatProduct(found) : null;
}

export async function getProductById(id) {
  return getProductBySlug(id);
}

/**
 * Create a new product with variants
 */
export async function createProduct(productData) {
  const id = `ps-${Date.now().toString(36)}`;
  const slug = productData.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

  const newProd = formatProduct({
    ...productData,
    id,
    slug,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  if (isSupabaseConfigured && supabase) {
    try {
      const { variants, ...dbMain } = newProd;
      const { data, error } = await supabase.from('products').insert([dbMain]).select().single();
      if (!error && data) {
        if (variants && variants.length > 0) {
          const varRows = variants.map((v) => ({
            product_id: data.id,
            bottle_type: v.bottle_type.toLowerCase().includes('glass') ? 'glass' : 'pvc',
            size_ml: v.size_ml,
            price: v.price,
            sale_price: v.sale_price || v.price,
            stock: v.stock || 10,
            sku: v.sku,
            is_active: v.active !== false,
          }));
          await supabase.from('product_variants').insert(varRows);
        }
      }
    } catch (e) {
      console.warn('Supabase createProduct error, saved to local store:', e);
    }
  }

  const list = getLocalProducts();
  list.unshift(newProd);
  saveLocalProducts(list);
  return newProd;
}

/**
 * Update existing product with variants
 */
export async function updateProduct(id, updates) {
  if (isSupabaseConfigured && supabase) {
    try {
      const { variants, ...dbUpdates } = updates;
      await supabase.from('products').update({ ...dbUpdates, updated_at: new Date().toISOString() }).eq('id', id);

      if (variants && variants.length > 0) {
        for (const v of variants) {
          if (v.id && !v.id.startsWith('var-temp')) {
            await supabase
              .from('product_variants')
              .update({
                price: v.price,
                stock: v.stock,
                sale_price: v.sale_price || v.price,
                is_active: v.active !== false,
              })
              .eq('id', v.id);
          }
        }
      }
    } catch (e) {
      console.warn('Supabase updateProduct error:', e);
    }
  }

  const list = getLocalProducts();
  const idx = list.findIndex((p) => p.id === id);
  if (idx > -1) {
    list[idx] = formatProduct({
      ...list[idx],
      ...updates,
      updated_at: new Date().toISOString(),
    });
    saveLocalProducts(list);
    return list[idx];
  }
  return null;
}

/**
 * Delete a product
 */
export async function deleteProduct(id) {
  if (isSupabaseConfigured && supabase) {
    try {
      await supabase.from('products').delete().eq('id', id);
    } catch (e) {
      console.warn('Supabase deleteProduct error:', e);
    }
  }

  const list = getLocalProducts();
  const filtered = list.filter((p) => p.id !== id);
  saveLocalProducts(filtered);
  return true;
}
