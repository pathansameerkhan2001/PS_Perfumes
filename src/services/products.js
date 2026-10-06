import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { PRODUCTS } from '../data/products';

const LOCAL_PRODUCTS_KEY = 'ps_db_products';

// Helper to convert catalog item to standard schema
function formatProduct(p) {
  const slug = p.slug || p.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  return {
    id: p.id,
    name: p.name,
    slug: slug,
    category: p.category || 'Perfume',
    subcategory: p.subcategory || (p.subcategories?.[0] || ''),
    description: p.description || '',
    short_description: p.short_description || p.description?.slice(0, 140) + '...' || '',
    price: Number(p.price) || 999,
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
    sizes: p.sizes || p.sizeOptions || ['50ml', '100ml'],
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
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
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
  } = options;

  if (isSupabaseConfigured && supabase) {
    try {
      let query = supabase.from('products').select('*');

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

      const { data, error } = await query;
      if (!error && data && data.length > 0) {
        return data;
      }
    } catch (e) {
      console.warn('Supabase getProducts fallback to local store:', e);
    }
  }

  // Fallback to local store
  let list = getLocalProducts();

  if (!allStatuses && status) {
    list = list.filter((p) => p.status === status);
  }
  if (category && category !== 'ALL') {
    list = list.filter((p) =>
      p.category?.toLowerCase() === category.toLowerCase() ||
      p.subcategory?.toLowerCase() === category.toLowerCase()
    );
  }
  if (featured !== undefined) {
    list = list.filter((p) => Boolean(p.featured) === Boolean(featured));
  }
  if (new_arrival !== undefined) {
    list = list.filter((p) => Boolean(p.new_arrival) === Boolean(new_arrival));
  }
  if (bestseller !== undefined) {
    list = list.filter((p) => Boolean(p.bestseller) === Boolean(bestseller));
  }
  if (search) {
    const s = search.toLowerCase();
    list = list.filter(
      (p) =>
        p.name.toLowerCase().includes(s) ||
        p.description?.toLowerCase().includes(s) ||
        p.category?.toLowerCase().includes(s)
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

  return list;
}

/**
 * Fetch product by slug
 */
export async function getProductBySlug(slug) {
  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('slug', slug)
        .single();
      if (!error && data) return data;
    } catch {}
  }

  const list = getLocalProducts();
  return list.find((p) => p.slug === slug || p.id === slug) || null;
}

/**
 * Fetch product by ID
 */
export async function getProductById(id) {
  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('id', id)
        .single();
      if (!error && data) return data;
    } catch {}
  }

  const list = getLocalProducts();
  return list.find((p) => p.id === id) || null;
}

/**
 * Create a new product
 */
export async function createProduct(productData) {
  const formatted = formatProduct({
    ...productData,
    id: productData.id || `ps-${Date.now()}`,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase
        .from('products')
        .insert([formatted])
        .select()
        .single();
      if (!error && data) {
        // Also sync local
        const list = getLocalProducts();
        saveLocalProducts([data, ...list]);
        return { data, error: null };
      }
    } catch (e) {
      console.warn('Supabase createProduct failed:', e);
    }
  }

  // Local store
  const list = getLocalProducts();
  const updated = [formatted, ...list];
  saveLocalProducts(updated);
  return { data: formatted, error: null };
}

/**
 * Update an existing product
 */
export async function updateProduct(id, productData) {
  const updatePayload = {
    ...productData,
    updated_at: new Date().toISOString(),
  };

  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase
        .from('products')
        .update(updatePayload)
        .eq('id', id)
        .select()
        .single();
      if (!error && data) {
        const list = getLocalProducts();
        const updated = list.map((p) => (p.id === id ? data : p));
        saveLocalProducts(updated);
        return { data, error: null };
      }
    } catch (e) {
      console.warn('Supabase updateProduct failed:', e);
    }
  }

  // Local store
  const list = getLocalProducts();
  const updated = list.map((p) => (p.id === id ? { ...p, ...updatePayload } : p));
  saveLocalProducts(updated);
  const found = updated.find((p) => p.id === id);
  return { data: found, error: null };
}

/**
 * Delete a product
 */
export async function deleteProduct(id) {
  if (isSupabaseConfigured && supabase) {
    try {
      const { error } = await supabase.from('products').delete().eq('id', id);
      if (!error) {
        const list = getLocalProducts();
        saveLocalProducts(list.filter((p) => p.id !== id));
        return { success: true, error: null };
      }
    } catch (e) {
      console.warn('Supabase deleteProduct failed:', e);
    }
  }

  const list = getLocalProducts();
  saveLocalProducts(list.filter((p) => p.id !== id));
  return { success: true, error: null };
}
