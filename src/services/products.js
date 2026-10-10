import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { getPublicImageUrl } from '../lib/storage';
import { PRODUCTS } from '../data/products';

const LOCAL_PRODUCTS_KEY = 'ps_db_products';

export const STANDARD_SIZES = ['30 ml', '50 ml', '100 ml'];
export const STANDARD_BOTTLE_TYPES = ['Glass Bottle', 'PVC Bottle'];

/**
 * Validates whether an ID string is a valid PostgreSQL UUID
 * @param {string} id 
 * @returns {boolean}
 */
export function isValidUUID(id) {
  if (!id || typeof id !== 'string') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}

/**
 * Resolves a category name or slug to its Supabase UUID
 */
async function resolveCategoryId(categoryNameOrSlug) {
  if (!categoryNameOrSlug) return null;
  if (isValidUUID(categoryNameOrSlug)) {
    return categoryNameOrSlug;
  }
  if (!isSupabaseConfigured || !supabase) return null;

  try {
    const clean = String(categoryNameOrSlug).toLowerCase().trim();
    const { data } = await supabase.from('categories').select('id, name, slug');
    if (data && data.length > 0) {
      const match = data.find(
        (c) => c.slug?.toLowerCase() === clean || c.name?.toLowerCase() === clean
      );
      if (match) return match.id;
      // Fallback: return the first category ID so FK constraint is satisfied
      return data[0].id;
    }
  } catch (e) {
    if (import.meta.env.DEV) console.warn('Category resolution notice:', e);
  }
  return null;
}

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
      sku: `PS-${String(p.id).slice(0, 8).toUpperCase()}-GL-${sizeNum}`,
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
      sku: `PS-${String(p.id).slice(0, 8).toUpperCase()}-PV-${sizeNum}`,
      active: true,
      is_active: true,
    });
  });

  return variants;
}

// Helper to convert catalog item or DB row to standard schema with variants
export function formatProduct(p) {
  const slug = p.slug || (p.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const rawVariants = p.variants && p.variants.length > 0 
    ? p.variants 
    : (p.product_variants && p.product_variants.length > 0 ? p.product_variants : generateDefaultVariants(p));

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

  // Parse notes and extra images stored in fragrance_notes JSON
  let notesMetadata = {};
  if (p.fragrance_notes && typeof p.fragrance_notes === 'object' && !Array.isArray(p.fragrance_notes)) {
    notesMetadata = p.fragrance_notes;
  } else if (typeof p.fragrance_notes === 'string') {
    try {
      notesMetadata = JSON.parse(p.fragrance_notes);
    } catch {
      notesMetadata = {};
    }
  }

  const glassImage = p.glass_image || notesMetadata.glass_image || resolvedImage;
  const pvcImage = p.pvc_image || notesMetadata.pvc_image || resolvedImage;
  const galleryImages = p.gallery_images || notesMetadata.gallery_images || (p.secondaryImage ? [p.secondaryImage] : []);

  // Calculate pricing from variants if available
  const lowestVariantPrice = formattedVariants.length > 0
    ? Math.min(...formattedVariants.map((v) => v.sale_price || v.price).filter(Boolean))
    : (Number(p.price) || 1499);

  const totalStock = formattedVariants.length > 0
    ? formattedVariants.reduce((sum, v) => sum + (v.stock_quantity || 0), 0)
    : (Number(p.stock) || 30);

  const categoryName = p.categories?.name || p.category || 'Perfume';

  return {
    ...p,
    id: p.id,
    name: p.name,
    slug,
    category: categoryName,
    category_id: p.category_id || p.categories?.id || null,
    price: p.price ? Number(p.price) : lowestVariantPrice,
    compare_at_price: p.compare_at_price ? Number(p.compare_at_price) : Math.round(lowestVariantPrice * 1.3),
    stock: totalStock,
    stock_quantity: totalStock,
    status: p.is_active === false || p.status === 'draft' ? 'draft' : 'active',
    active: p.is_active !== false && p.status !== 'draft',
    is_active: p.is_active !== false && p.status !== 'draft',
    featured: Boolean(p.is_featured || p.featured),
    is_featured: Boolean(p.is_featured || p.featured),
    bestseller: Boolean(p.is_bestseller || p.bestseller),
    is_bestseller: Boolean(p.is_bestseller || p.bestseller),
    new_arrival: Boolean(p.is_new_arrival || p.new_arrival),
    is_new_arrival: Boolean(p.is_new_arrival || p.new_arrival),
    main_image: resolvedImage,
    image: resolvedImage,
    glass_image: glassImage,
    pvc_image: pvcImage,
    gallery_images: galleryImages,
    top_notes: notesMetadata.top || p.top_notes || p.topNotes || [],
    heart_notes: notesMetadata.heart || p.heart_notes || p.heartNotes || [],
    base_notes: notesMetadata.base || p.base_notes || p.baseNotes || [],
    ingredients: p.ingredients || 'Alcohol Denat., Parfum (Fragrance), Aqua (Water), Limonene, Linalool, Coumarin, Citronellol.',
    variants: formattedVariants,
    product_variants: formattedVariants,
  };
}

function getLocalProducts() {
  try {
    const raw = localStorage.getItem(LOCAL_PRODUCTS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map((p) => formatProduct(p));
      }
    }
  } catch (e) {
    console.error('Error reading local products', e);
  }

  // Initialize with catalog products
  const formattedCatalog = PRODUCTS.map((p) => formatProduct(p));
  try {
    localStorage.setItem(LOCAL_PRODUCTS_KEY, JSON.stringify(formattedCatalog));
  } catch {}
  return formattedCatalog;
}

function saveLocalProducts(products) {
  try {
    localStorage.setItem(LOCAL_PRODUCTS_KEY, JSON.stringify(products));
  } catch (e) {
    console.error('Error saving local products', e);
  }
}

/**
 * Fetch all products with filter & sort options
 */
export async function getProducts(options = {}) {
  const {
    category,
    status,
    allStatuses = false,
    featured,
    new_arrival,
    bestseller,
    search,
    sort = 'display_order',
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
        fragrance_notes,
        ingredients,
        created_at,
        updated_at,
        categories (
          id,
          name,
          slug
        ),
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
      if (!error && Array.isArray(data) && data.length > 0) {
        return data.map((item) => formatProduct(item));
      }
    } catch (e) {
      if (import.meta.env.DEV) console.warn('Supabase getProducts note:', e);
    }
  }

  // Fallback to local catalog products
  let list = getLocalProducts();

  if (!allStatuses && status) {
    list = list.filter((p) => p.status === status);
  }
  if (category && category !== 'ALL') {
    const term = category.toLowerCase();
    list = list.filter(
      (p) =>
        p.category?.toLowerCase().includes(term) ||
        (p.subcategory && p.subcategory.toLowerCase().includes(term))
    );
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
        p.description?.toLowerCase().includes(q) ||
        p.category?.toLowerCase().includes(q)
    );
  }

  if (sort === 'price-low') {
    list.sort((a, b) => a.price - b.price);
  } else if (sort === 'price-high') {
    list.sort((a, b) => b.price - a.price);
  } else if (sort === 'newest') {
    list.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
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
      const isUUID = isValidUUID(slugOrId);
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
          fragrance_notes,
          ingredients,
          created_at,
          updated_at,
          categories (
            id,
            name,
            slug
          ),
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
      if (import.meta.env.DEV) console.warn('Supabase getProductBySlug note:', e);
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
 * Create a new product with variants in Supabase database
 */
export async function createProduct(productData) {
  const autoSlug =
    productData.slug ||
    productData.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');

  let createdProduct = null;

  if (isSupabaseConfigured && supabase) {
    try {
      const categoryId = await resolveCategoryId(productData.category_id || productData.category);

      const notesMetadata = {
        top: Array.isArray(productData.top_notes)
          ? productData.top_notes
          : typeof productData.top_notes === 'string'
          ? productData.top_notes.split(',').map((s) => s.trim()).filter(Boolean)
          : [],
        heart: Array.isArray(productData.heart_notes)
          ? productData.heart_notes
          : typeof productData.heart_notes === 'string'
          ? productData.heart_notes.split(',').map((s) => s.trim()).filter(Boolean)
          : [],
        base: Array.isArray(productData.base_notes)
          ? productData.base_notes
          : typeof productData.base_notes === 'string'
          ? productData.base_notes.split(',').map((s) => s.trim()).filter(Boolean)
          : [],
        glass_image: productData.glass_image || null,
        pvc_image: productData.pvc_image || null,
        gallery_images: Array.isArray(productData.gallery_images) ? productData.gallery_images : [],
      };

      const primaryImage =
        productData.main_image ||
        productData.main_image_url ||
        productData.glass_image ||
        '/assets/prod-royal-amber.webp';

      // Insert product with verified Supabase schema columns
      const dbProduct = {
        name: productData.name,
        slug: autoSlug,
        brand: productData.brand || 'PS PERFUMES',
        description: productData.description || '',
        short_description: productData.short_description || '',
        main_image_url: primaryImage,
        main_image_path: productData.main_image_path || null,
        category_id: categoryId,
        fragrance_notes: notesMetadata,
        ingredients: productData.ingredients || null,
        is_active:
          productData.active !== undefined
            ? Boolean(productData.active)
            : productData.is_active !== undefined
            ? Boolean(productData.is_active)
            : productData.status === 'active',
        is_featured: Boolean(productData.featured || productData.is_featured),
        is_bestseller: Boolean(productData.bestseller || productData.is_bestseller),
        is_new_arrival: Boolean(productData.new_arrival || productData.is_new_arrival),
        display_order: Number(productData.display_order) || 0,
      };

      const { data, error } = await supabase.from('products').insert([dbProduct]).select().single();
      if (!error && data) {
        createdProduct = data;

        // Insert variants into product_variants using the real UUID
        if (productData.variants && productData.variants.length > 0) {
          const varRows = productData.variants.map((v) => ({
            product_id: data.id,
            bottle_type: v.bottle_type || 'Glass Bottle',
            size_ml: v.size_ml || '50 ml',
            price: Number(v.price) || 999,
            sale_price: v.sale_price ? Number(v.sale_price) : null,
            stock_quantity: Number(v.stock !== undefined ? v.stock : v.stock_quantity) || 10,
            sku: v.sku || null,
            is_active: v.active !== false && v.is_active !== false,
          }));

          const { error: varErr } = await supabase.from('product_variants').insert(varRows);
          if (varErr) {
            console.error('Error inserting variants into Supabase:', varErr);
          }
        }

        const formatted = formatProduct({ ...data, variants: productData.variants });
        // Also sync local storage
        const list = getLocalProducts();
        saveLocalProducts([formatted, ...list]);
        return formatted;
      }
      if (error) {
        console.error('Supabase createProduct insert error:', error.message);
        throw new Error(error.message);
      }
    } catch (e) {
      console.error('Supabase createProduct exception:', e);
      throw e;
    }
  }

  // Local storage fallback if Supabase not configured
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
 * Update existing product with variants in Supabase database
 */
export async function updateProduct(id, updates) {
  if (isSupabaseConfigured && supabase && isValidUUID(id)) {
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
      if (updates.ingredients !== undefined) dbUpdates.ingredients = updates.ingredients;

      if (updates.category !== undefined || updates.category_id !== undefined) {
        const catId = await resolveCategoryId(updates.category_id || updates.category);
        if (catId) dbUpdates.category_id = catId;
      }

      if (
        updates.glass_image !== undefined ||
        updates.pvc_image !== undefined ||
        updates.top_notes !== undefined ||
        updates.heart_notes !== undefined ||
        updates.base_notes !== undefined ||
        updates.gallery_images !== undefined
      ) {
        dbUpdates.fragrance_notes = {
          top: Array.isArray(updates.top_notes)
            ? updates.top_notes
            : typeof updates.top_notes === 'string'
            ? updates.top_notes.split(',').map((s) => s.trim()).filter(Boolean)
            : [],
          heart: Array.isArray(updates.heart_notes)
            ? updates.heart_notes
            : typeof updates.heart_notes === 'string'
            ? updates.heart_notes.split(',').map((s) => s.trim()).filter(Boolean)
            : [],
          base: Array.isArray(updates.base_notes)
            ? updates.base_notes
            : typeof updates.base_notes === 'string'
            ? updates.base_notes.split(',').map((s) => s.trim()).filter(Boolean)
            : [],
          glass_image: updates.glass_image || null,
          pvc_image: updates.pvc_image || null,
          gallery_images: Array.isArray(updates.gallery_images) ? updates.gallery_images : [],
        };
      }

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

      const { error: updateErr } = await supabase.from('products').update(dbUpdates).eq('id', id);
      if (updateErr) {
        throw new Error(updateErr.message);
      }

      // Upsert / update variants
      if (updates.variants && updates.variants.length > 0) {
        const { data: existingVariants } = await supabase
          .from('product_variants')
          .select('id, bottle_type, size_ml')
          .eq('product_id', id);

        for (const v of updates.variants) {
          const match = existingVariants?.find(
            (ev) =>
              ev.bottle_type?.toLowerCase() === v.bottle_type?.toLowerCase() &&
              ev.size_ml === v.size_ml
          );

          if (match) {
            await supabase
              .from('product_variants')
              .update({
                price: Number(v.price) || 0,
                sale_price: v.sale_price ? Number(v.sale_price) : null,
                stock_quantity: Number(v.stock !== undefined ? v.stock : v.stock_quantity) || 0,
                sku: v.sku || null,
                is_active: v.active !== false && v.is_active !== false,
                updated_at: new Date().toISOString(),
              })
              .eq('id', match.id);
          } else {
            await supabase.from('product_variants').insert([{
              product_id: id,
              bottle_type: v.bottle_type || 'Glass Bottle',
              size_ml: v.size_ml || '50 ml',
              price: Number(v.price) || 999,
              sale_price: v.sale_price ? Number(v.sale_price) : null,
              stock_quantity: Number(v.stock !== undefined ? v.stock : v.stock_quantity) || 10,
              sku: v.sku || null,
              is_active: v.active !== false && v.is_active !== false,
            }]);
          }
        }
      }
    } catch (e) {
      console.error('Supabase updateProduct error:', e);
      throw e;
    }
  }

  // Update local storage fallback
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
 * Delete a product from Supabase database
 */
export async function deleteProduct(id) {
  if (isSupabaseConfigured && supabase && isValidUUID(id)) {
    try {
      // Check if product is referenced in historical orders
      const { count } = await supabase
        .from('order_items')
        .select('id', { count: 'exact', head: true })
        .eq('product_id', id);

      if (count && count > 0) {
        // Soft-delete / deactivate to preserve patron order history
        await supabase
          .from('products')
          .update({ is_active: false, updated_at: new Date().toISOString() })
          .eq('id', id);
        const list = getLocalProducts();
        const filtered = list.filter((p) => p.id !== id);
        saveLocalProducts(filtered);
        return { success: true, archived: true };
      }

      // Safe to delete variants first then product
      await supabase.from('product_variants').delete().eq('product_id', id);
      const { error } = await supabase.from('products').delete().eq('id', id);
      if (error) {
        throw new Error(error.message);
      }
    } catch (e) {
      console.error('Supabase deleteProduct error:', e);
      throw e;
    }
  }

  const list = getLocalProducts();
  const filtered = list.filter((p) => p.id !== id);
  saveLocalProducts(filtered);
  return { success: true };
}
