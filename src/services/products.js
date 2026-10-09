import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { getPublicImageUrl } from '../lib/storage';
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
      stock_quantity: config.stock,
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
      stock_quantity: config.stock,
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
  const rawVariants = p.variants && p.variants.length > 0 ? p.variants : (p.product_variants && p.product_variants.length > 0 ? p.product_variants : generateDefaultVariants(p));

  const formattedVariants = rawVariants.map((v) => ({
    ...v,
    stock: v.stock_quantity !== undefined ? Number(v.stock_quantity) : (Number(v.stock) || 0),
    stock_quantity: v.stock_quantity !== undefined ? Number(v.stock_quantity) : (Number(v.stock) || 0),
    is_active: v.is_active !== false && v.active !== false,
    active: v.is_active !== false && v.active !== false,
    price: Number(v.price) || 0,
    sale_price: v.sale_price ? Number(v.sale_price) : null,
  }));

  let resolvedImage = p.main_image || p.image;
  if (p.main_image_url) {
    resolvedImage = getPublicImageUrl(p.main_image_url);
  } else if (p.main_image_path) {
    resolvedImage = getPublicImageUrl(p.main_image_path);
  }
  if (!resolvedImage) {
    resolvedImage = '/assets/prod-royal-amber.webp';
  }

  const isActive = p.is_active !== undefined ? Boolean(p.is_active) : (p.status ? p.status === 'active' : true);
  const isFeatured = Boolean(p.is_featured ?? p.featured);
  const isBestseller = Boolean(p.is_bestseller ?? p.bestseller);
  const isNewArrival = Boolean(p.is_new_arrival ?? p.new_arrival);

  const firstVar = formattedVariants[0];
  const derivedPrice = firstVar ? (firstVar.sale_price || firstVar.price) : 999;
  const displayPrice = Number(p.price) || derivedPrice;

  return {
    id: p.id,
    name: p.name,
    slug: slug,
    brand: p.brand || 'PS PERFUMES',
    category: p.category || 'Perfume',
    subcategory: p.subcategory || (p.subcategories?.[0] || ''),
    description: p.description || '',
    short_description: p.short_description || p.description?.slice(0, 140) + '...' || '',
    price: displayPrice,
    sale_price: p.sale_price ? Number(p.sale_price) : null,
    compare_at_price: p.compare_at_price ? Number(p.compare_at_price) : null,
    sku: p.sku || `PS-${p.id.toUpperCase()}`,
    stock: p.stock !== undefined ? p.stock : (formattedVariants.reduce((sum, v) => sum + v.stock, 0)),
    status: isActive ? 'active' : 'draft',
    is_active: isActive,
    active: isActive,
    featured: isFeatured,
    is_featured: isFeatured,
    new_arrival: isNewArrival,
    is_new_arrival: isNewArrival,
    bestseller: isBestseller,
    is_bestseller: isBestseller,
    rating: Number(p.rating) || 5.0,
    review_count: Number(p.reviewCount || p.review_count) || 28,
    main_image: resolvedImage,
    main_image_url: resolvedImage,
    image: resolvedImage,
    gallery_images: p.gallery_images || (p.secondaryImage ? [p.secondaryImage] : []),
    bottle_types: p.bottle_types || STANDARD_BOTTLE_TYPES,
    sizes: p.sizes || STANDARD_SIZES,
    variants: formattedVariants,
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
      let query = supabase.from('products').select(`
        id,
        name,
        slug,
        brand,
        description,
        short_description,
        category_id,
        main_image_path,
        main_image_url,
        is_featured,
        is_bestseller,
        is_new_arrival,
        is_active,
        display_order,
        created_at,
        updated_at,
        product_variants (
          id,
          product_id,
          bottle_type,
          size_ml,
          price,
          sale_price,
          stock_quantity,
          is_active,
          sku
        )
      `);

      if (!allStatuses && status) {
        query = query.eq('is_active', status === 'active');
      }
      if (featured !== undefined) {
        query = query.eq('is_featured', featured);
      }
      if (new_arrival !== undefined) {
        query = query.eq('is_new_arrival', new_arrival);
      }
      if (bestseller !== undefined) {
        query = query.eq('is_bestseller', bestseller);
      }
      if (search) {
        query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%`);
      }

      if (sort === 'newest') {
        query = query.order('created_at', { ascending: false });
      } else {
        query = query.order('display_order', { ascending: true }).order('created_at', { ascending: false });
      }

      if (limit) {
        query = query.limit(limit);
      }

      const { data, error } = await query;
      if (!error && Array.isArray(data)) {
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
  if (options.category && options.category !== 'ALL') {
    const term = options.category.toLowerCase();
    list = list.filter((p) => p.category?.toLowerCase().includes(term) || (p.subcategory && p.subcategory.toLowerCase().includes(term)));
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
        .select(`
          id,
          name,
          slug,
          brand,
          description,
          short_description,
          category_id,
          main_image_path,
          main_image_url,
          is_featured,
          is_bestseller,
          is_new_arrival,
          is_active,
          display_order,
          created_at,
          updated_at,
          product_variants (
            id,
            product_id,
            bottle_type,
            size_ml,
            price,
            sale_price,
            stock_quantity,
            is_active,
            sku
          )
        `)
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
  const autoSlug = productData.slug || productData.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

  if (isSupabaseConfigured && supabase) {
    try {
      const dbProduct = {
        name: productData.name,
        slug: autoSlug,
        brand: productData.brand || 'PS PERFUMES',
        description: productData.description || '',
        short_description: productData.short_description || '',
        main_image_url: productData.main_image || productData.main_image_url || null,
        main_image_path: productData.main_image_path || null,
        is_active: productData.active !== undefined ? Boolean(productData.active) : (productData.is_active !== undefined ? Boolean(productData.is_active) : productData.status === 'active'),
        is_featured: Boolean(productData.featured || productData.is_featured),
        is_bestseller: Boolean(productData.bestseller || productData.is_bestseller),
        is_new_arrival: Boolean(productData.new_arrival || productData.is_new_arrival),
        display_order: Number(productData.display_order) || 0,
      };

      const { data, error } = await supabase.from('products').insert([dbProduct]).select().single();
      if (!error && data) {
        if (productData.variants && productData.variants.length > 0) {
          const varRows = productData.variants.map((v) => ({
            product_id: data.id,
            bottle_type: v.bottle_type || 'Glass Bottle',
            size_ml: v.size_ml || '50ml',
            price: Number(v.price) || 999,
            sale_price: v.sale_price ? Number(v.sale_price) : null,
            stock_quantity: Number(v.stock || v.stock_quantity) || 10,
            sku: v.sku || null,
            is_active: v.active !== false && v.is_active !== false,
          }));
          await supabase.from('product_variants').insert(varRows);
        }
        return formatProduct({ ...data, variants: productData.variants });
      }
    } catch (e) {
      console.warn('Supabase createProduct error, saved to local store:', e);
    }
  }

  const id = `ps-${Date.now().toString(36)}`;
  const newProd = formatProduct({
    ...productData,
    id,
    slug: autoSlug,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

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
      const dbUpdates = {};
      if (updates.name !== undefined) dbUpdates.name = updates.name;
      if (updates.slug !== undefined) dbUpdates.slug = updates.slug;
      if (updates.brand !== undefined) dbUpdates.brand = updates.brand;
      if (updates.description !== undefined) dbUpdates.description = updates.description;
      if (updates.short_description !== undefined) dbUpdates.short_description = updates.short_description;
      if (updates.main_image !== undefined) dbUpdates.main_image_url = updates.main_image;
      if (updates.main_image_url !== undefined) dbUpdates.main_image_url = updates.main_image_url;
      if (updates.main_image_path !== undefined) dbUpdates.main_image_path = updates.main_image_path;
      if (updates.is_active !== undefined) dbUpdates.is_active = updates.is_active;
      else if (updates.active !== undefined) dbUpdates.is_active = updates.active;
      else if (updates.status !== undefined) dbUpdates.is_active = updates.status === 'active';
      if (updates.is_featured !== undefined) dbUpdates.is_featured = updates.is_featured;
      else if (updates.featured !== undefined) dbUpdates.is_featured = updates.featured;
      if (updates.is_bestseller !== undefined) dbUpdates.is_bestseller = updates.is_bestseller;
      else if (updates.bestseller !== undefined) dbUpdates.is_bestseller = updates.bestseller;
      if (updates.is_new_arrival !== undefined) dbUpdates.is_new_arrival = updates.is_new_arrival;
      else if (updates.new_arrival !== undefined) dbUpdates.is_new_arrival = updates.new_arrival;
      if (updates.display_order !== undefined) dbUpdates.display_order = updates.display_order;
      dbUpdates.updated_at = new Date().toISOString();

      await supabase.from('products').update(dbUpdates).eq('id', id);

      if (updates.variants && updates.variants.length > 0) {
        for (const v of updates.variants) {
          if (v.id && !v.id.startsWith('var-')) {
            await supabase
              .from('product_variants')
              .update({
                price: Number(v.price) || 0,
                sale_price: v.sale_price ? Number(v.sale_price) : null,
                stock_quantity: Number(v.stock || v.stock_quantity) || 0,
                is_active: v.active !== false && v.is_active !== false,
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
