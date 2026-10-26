import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { getPublicImageUrl, deleteStorageFiles } from '../lib/storage';
import { cachedRequest, invalidateCached } from '../lib/requestCache';
import { PRODUCTS } from '../data/products';

// requestCache keys: "products:" = storefront catalogue reads, "home:" = homepage sections
export const PRODUCTS_CACHE_PREFIX = 'products:';
export const HOME_CACHE_PREFIX = 'home:';

/** Call after any product write so this tab's storefront shows the change at once. */
export function invalidateProductCaches() {
  invalidateCached(PRODUCTS_CACHE_PREFIX, HOME_CACHE_PREFIX);
}

const LOCAL_PRODUCTS_KEY = 'ps_db_products';

export const STANDARD_SIZES = ['30 ml', '50 ml', '100 ml'];
export const ATTAR_SIZES = ['6 ml', '10 ml'];
export const STANDARD_BOTTLE_TYPES = ['Glass Bottle', 'PVC Bottle'];
export const ATTAR_BOTTLE_TYPES = ['Glass Bottle'];

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
export async function resolveCategoryId(categoryNameOrSlug) {
  if (!categoryNameOrSlug) return null;
  if (isValidUUID(categoryNameOrSlug)) {
    return categoryNameOrSlug;
  }
  if (!isSupabaseConfigured || !supabase) return null;

  const clean = String(categoryNameOrSlug).toLowerCase().trim();
  const { data, error } = await supabase.from('categories').select('id, name, slug');
  if (error) {
    throw new Error(`Could not load categories: ${error.message}`);
  }
  const match = (data || []).find(
    (c) => c.slug?.toLowerCase() === clean || c.name?.toLowerCase() === clean
  );
  if (!match) {
    throw new Error(`Category "${categoryNameOrSlug}" does not exist in the categories table. Create it under Admin → Categories or choose another category.`);
  }
  return match.id;
}

/**
 * Checks whether a given category string/slug represents an Attar
 */
export function isAttarCategory(categoryOrSlug) {
  if (!categoryOrSlug) return false;
  const clean = String(categoryOrSlug).toLowerCase().trim();
  return clean === 'attar' || clean.includes('attar');
}

/**
 * Generate standard variant matrix for a product if variants don't exist
 */
export function generateDefaultVariants(p) {
  const isAttar = isAttarCategory(p.category || p.categories?.slug || p.categories?.name);
  const basePrice = Number(p.price) || (isAttar ? 799 : 1499);
  const baseCompare = Number(p.compare_at_price || p.originalPrice) || Math.round(basePrice * 1.33);

  const variants = [];

  if (isAttar) {
    // Attars support 6 ml and 10 ml flacons in Glass Bottle
    const attarRatios = {
      '6 ml': { price: basePrice, compare: baseCompare, stock: 30 },
      '10 ml': { price: Math.round(basePrice * 1.5), compare: Math.round(baseCompare * 1.5), stock: 20 },
    };

    ATTAR_SIZES.forEach((sz) => {
      const config = attarRatios[sz];
      const sizeNum = sz.replace(/\D/g, '');
      variants.push({
        id: `var-${p.id}-attar-${sizeNum}`,
        product_id: p.id,
        bottle_type: 'Glass Bottle',
        size_ml: sz,
        price: config.price,
        sale_price: config.price,
        compare_at_price: config.compare,
        stock: config.stock,
        stock_quantity: config.stock,
        sku: `PS-${String(p.id).slice(0, 8).toUpperCase()}-AT-${sizeNum}`,
        active: true,
        is_active: true,
      });
    });

    return variants;
  }

  // Perfumes support 30 ml, 50 ml, 100 ml across Glass and PVC
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
  // Database rows always carry a product_variants array (possibly empty): use it as-is and
  // never invent variants or prices for them. Defaults are only for the offline demo catalogue.
  const rawVariants = p.variants && p.variants.length > 0
    ? p.variants
    : Array.isArray(p.product_variants)
    ? p.product_variants
    : generateDefaultVariants(p);

  const formattedVariants = rawVariants.map((v) => {
    const price = Number(v.price) || 0;
    const salePrice = v.sale_price ? Number(v.sale_price) : null;
    return {
      ...v,
      stock: v.stock_quantity !== undefined ? Number(v.stock_quantity) : (Number(v.stock) || 0),
      stock_quantity: v.stock_quantity !== undefined ? Number(v.stock_quantity) : (Number(v.stock) || 0),
      is_active: v.is_active !== false && v.active !== false,
      active: v.is_active !== false && v.active !== false,
      price,
      sale_price: salePrice,
      // A strike-through price is shown only for a real reduction (sale price below price)
      compare_at_price: salePrice && salePrice < price ? price : null,
    };
  });

  let resolvedImage = p.main_image || p.image;
  if (p.main_image_url) {
    resolvedImage = getPublicImageUrl(p.main_image_url);
  } else if (p.main_image_path) {
    resolvedImage = getPublicImageUrl(p.main_image_path);
  }
  if (!resolvedImage) {
    // Neutral brand placeholder for display only (never saved)
    resolvedImage = '/assets/ps-perfumes-logo.webp';
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

  // Pricing from the cheapest active variant (0 when the product has no priced variants)
  const pricedVariants = formattedVariants.filter((v) => v.is_active && (v.sale_price || v.price) > 0);
  const cheapestVariant = pricedVariants.reduce(
    (best, v) => (!best || (v.sale_price || v.price) < (best.sale_price || best.price) ? v : best),
    null
  );
  const lowestVariantPrice = cheapestVariant
    ? cheapestVariant.sale_price || cheapestVariant.price
    : Number(p.price) || 0;

  const totalStock = formattedVariants.length > 0
    ? formattedVariants.filter((v) => v.is_active).reduce((sum, v) => sum + (v.stock_quantity || 0), 0)
    : (Number(p.stock) || 0);

  const categoryName = p.categories?.name || p.category || notesMetadata.category_name || 'Perfume';
  const categorySlug = p.categories?.slug || (categoryName || '').toLowerCase().trim();

  return {
    ...p,
    id: p.id,
    name: p.name,
    slug,
    category: categoryName,
    category_slug: categorySlug,
    category_id: p.category_id || p.categories?.id || null,
    price: p.price ? Number(p.price) : lowestVariantPrice,
    compare_at_price: p.compare_at_price
      ? Number(p.compare_at_price)
      : cheapestVariant?.compare_at_price || null,
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
    main_image_url: resolvedImage,
    image: resolvedImage,
    glass_image: glassImage,
    pvc_image: pvcImage,
    gallery_images: galleryImages,
    top_notes: notesMetadata.top || p.top_notes || p.topNotes || [],
    heart_notes: notesMetadata.heart || p.heart_notes || p.heartNotes || [],
    base_notes: notesMetadata.base || p.base_notes || p.baseNotes || [],
    ingredients: p.ingredients || '',
    sku: p.sku || notesMetadata.sku || '',
    meta_title: p.meta_title || notesMetadata.meta_title || '',
    meta_description: p.meta_description || notesMetadata.meta_description || '',
    variants: formattedVariants,
    product_variants: formattedVariants,
    // Values actually stored in the database (no display fallbacks), used by the admin form
    stored_images: {
      main: p.main_image_url || p.main_image || p.image || '',
      main_path: p.main_image_path || '',
      glass: p.glass_image || notesMetadata.glass_image || '',
      glass_path: notesMetadata.glass_image_path || '',
      pvc: p.pvc_image || notesMetadata.pvc_image || '',
      pvc_path: notesMetadata.pvc_image_path || '',
    },
  };
}

function buildNotesMetadata(data) {
  const toList = (val) =>
    Array.isArray(val)
      ? val
      : typeof val === 'string'
      ? val.split(',').map((s) => s.trim()).filter(Boolean)
      : [];

  return {
    top: toList(data.top_notes),
    heart: toList(data.heart_notes),
    base: toList(data.base_notes),
    glass_image: data.glass_image || null,
    glass_image_path: data.glass_image_path || null,
    pvc_image: data.pvc_image || null,
    pvc_image_path: data.pvc_image_path || null,
    gallery_images: Array.isArray(data.gallery_images) ? data.gallery_images : [],
    category_name: data.category || 'Perfume',
    sku: data.sku || null,
    // SEO fields from Admin → Products → SEO (no dedicated columns exist in the live schema)
    meta_title: data.meta_title || null,
    meta_description: data.meta_description || null,
  };
}

function toVariantRow(v, productId, categoryForDefaults) {
  const isAttar = isAttarCategory(categoryForDefaults);
  return {
    product_id: productId,
    bottle_type: v.bottle_type || 'Glass Bottle',
    size_ml: v.size_ml || (isAttar ? '6 ml' : '50 ml'),
    price: Number(v.price) || 0,
    sale_price: v.sale_price ? Number(v.sale_price) : null,
    stock_quantity: Math.max(0, Number(v.stock !== undefined ? v.stock : v.stock_quantity) || 0),
    sku: v.sku || null,
    is_active: v.active !== false && v.is_active !== false,
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
    throwOnError = false,
  } = options;

  // Storefront queries (allStatuses = false) only ever show active products
  const effectiveStatus = allStatuses ? undefined : status || 'active';

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

      if (effectiveStatus) {
        query = query.eq('is_active', effectiveStatus === 'active');
      }
      if (featured !== undefined) {
        query = query.eq('is_featured', Boolean(featured));
      }
      if (new_arrival !== undefined) {
        query = query.eq('is_new_arrival', Boolean(new_arrival));
      }
      if (bestseller !== undefined) {
        query = query.eq('is_bestseller', Boolean(bestseller));
      }
      if (search) {
        // Characters that have meaning inside a PostgREST or() filter are replaced, so user
        // input can never add conditions to the query
        const term = String(search).replace(/[,()*%\\:"']/g, ' ').trim().slice(0, 80);
        if (term) query = query.or(`name.ilike.%${term}%,description.ilike.%${term}%`);
      }

      if (sort === 'newest') {
        query = query.order('created_at', { ascending: false });
      } else {
        query = query.order('display_order', { ascending: true }).order('created_at', { ascending: false });
      }

      if (limit) {
        query = query.limit(limit);
      }

      const runQuery = async () => {
        const { data: rows, error } = await query;
        if (error) {
          throw new Error(`Could not load products: ${error.message}${error.code ? ` (code ${error.code})` : ''}`);
        }
        return rows || [];
      };
      // Storefront reads share a short-lived cache (raw rows; formatted per call, so every caller
      // gets its own objects). Admin reads (allStatuses) always go to the database.
      const data = allStatuses
        ? await runQuery()
        : await cachedRequest(
            `${PRODUCTS_CACHE_PREFIX}${JSON.stringify([effectiveStatus, featured, new_arrival, bestseller, search, sort, limit])}`,
            runQuery
          );
      // The database answered: show its real state (even an empty list), never demo data.
      let list = (data || []).map((item) => formatProduct(item));
      if (category && category !== 'ALL') {
        const catTerm = category.toLowerCase().trim();
        list = list.filter(
          (p) =>
            p.category?.toLowerCase() === catTerm ||
            p.category_slug?.toLowerCase() === catTerm ||
            p.categories?.slug?.toLowerCase() === catTerm
        );
      }
      return list;
    } catch (e) {
      console.error('Supabase getProducts error:', e);
      if (throwOnError) throw e;
      return [];
    }
  }

  // Fallback to local catalog products (only reachable when Supabase is not configured)
  let list = getLocalProducts();

  if (effectiveStatus) {
    list = list.filter((p) => p.status === effectiveStatus);
  }
  if (category && category !== 'ALL') {
    const term = category.toLowerCase().trim();
    list = list.filter(
      (p) =>
        p.category?.toLowerCase().includes(term) ||
        p.category_slug?.toLowerCase().includes(term) ||
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
export async function getProductBySlug(slugOrId, { includeInactive = false } = {}) {
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
        // slug comes from the URL: compare with eq() so it cannot add filter conditions
        .eq(isUUID ? 'id' : 'slug', String(slugOrId || ''));

      const { data, error } = await query.maybeSingle();
      if (error) {
        throw new Error(`Could not load product: ${error.message}`);
      }
      if (!data) return null;
      if (!includeInactive && data.is_active === false) return null;
      return formatProduct(data);
    } catch (e) {
      console.error('Supabase getProductBySlug error:', e);
      if (includeInactive) throw e;
      return null;
    }
  }

  const list = getLocalProducts();
  const found = list.find((p) => p.slug === slugOrId || p.id === slugOrId);
  return found ? formatProduct(found) : null;
}

/** Admin lookup: returns inactive products too and surfaces errors. */
export async function getProductById(id) {
  return getProductBySlug(id, { includeInactive: true });
}


function describeDbError(error) {
  if (!error) return '';
  return `${error.message}${error.code ? ` (code ${error.code})` : ''}${error.details ? ` — ${error.details}` : ''}`;
}

function assertSupabaseRecordId(id) {
  if (!isValidUUID(id)) {
    throw new Error(`"${id}" is not a database product id. Reload the product list and try again.`);
  }
}

function validateVariants(variants) {
  if (!Array.isArray(variants) || variants.length === 0) {
    throw new Error('At least one bottle/size variant is required.');
  }
  const bad = variants.find((v) => !(Number(v.price) > 0));
  if (bad) {
    throw new Error(`Variant ${bad.bottle_type || ''} ${bad.size_ml || ''} needs a price greater than 0.`);
  }
}

/**
 * Create a new product with variants in Supabase database.
 * Throws with the real database error; nothing is reported as saved unless the
 * product row AND all variant rows were written.
 */
async function createProductRecord(productData) {
  const autoSlug =
    productData.slug ||
    productData.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');

  if (isSupabaseConfigured && supabase) {
    const isActive =
      productData.active !== undefined
        ? Boolean(productData.active)
        : productData.is_active !== undefined
        ? Boolean(productData.is_active)
        : productData.status === 'active';
    const primaryImage = productData.main_image || productData.main_image_url || null;
    // Only the bulk importer opts out of the image rule, and only for unpublished drafts
    if (!primaryImage && !(productData.allowMissingImage && !isActive)) {
      throw new Error('A primary campaign image is required.');
    }
    validateVariants(productData.variants);

    const categoryId = await resolveCategoryId(productData.category_id || productData.category);

    const dbProduct = {
      name: productData.name,
      slug: autoSlug,
      brand: productData.brand || 'PS PERFUMES',
      description: productData.description || '',
      short_description: productData.short_description || '',
      main_image_url: primaryImage,
      main_image_path: productData.main_image_path || null,
      category_id: categoryId,
      fragrance_notes: buildNotesMetadata(productData),
      ingredients: productData.ingredients || null,
      is_active: isActive,
      is_featured: Boolean(productData.featured || productData.is_featured),
      is_bestseller: Boolean(productData.bestseller || productData.is_bestseller),
      is_new_arrival: Boolean(productData.new_arrival || productData.is_new_arrival),
      display_order: Number(productData.display_order) || 0,
    };

    const { data, error } = await supabase.from('products').insert([dbProduct]).select().single();
    if (error || !data) {
      throw new Error(`Product was not saved: ${describeDbError(error) || 'no row returned'}`);
    }

    const varRows = productData.variants.map((v) => toVariantRow(v, data.id, productData.category));
    const { data: insertedVariants, error: varErr } = await supabase
      .from('product_variants')
      .insert(varRows)
      .select('id');

    if (varErr || (insertedVariants || []).length !== varRows.length) {
      // Do not leave a product without its variant matrix behind
      const { error: cleanupErr } = await supabase.from('products').delete().eq('id', data.id);
      throw new Error(
        `Variants were not saved, so the product was not created: ${describeDbError(varErr) || 'variant rows were not returned'}` +
          (cleanupErr ? `. Cleanup also failed (${cleanupErr.message}); delete product "${data.name}" manually.` : '')
      );
    }

    return formatProduct({ ...data, variants: productData.variants });
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
 * Update existing product with variants in Supabase database.
 * Throws with the real database error, including when RLS silently matches no rows.
 */
async function updateProductRecord(id, updates) {
  if (isSupabaseConfigured && supabase) {
    assertSupabaseRecordId(id);

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
      dbUpdates.category_id = await resolveCategoryId(updates.category_id || updates.category);
    }

    if (
      updates.glass_image !== undefined ||
      updates.pvc_image !== undefined ||
      updates.top_notes !== undefined ||
      updates.heart_notes !== undefined ||
      updates.base_notes !== undefined ||
      updates.gallery_images !== undefined ||
      updates.category !== undefined ||
      updates.sku !== undefined ||
      updates.meta_title !== undefined ||
      updates.meta_description !== undefined
    ) {
      dbUpdates.fragrance_notes = buildNotesMetadata(updates);
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

    const { data: updatedRows, error: updateErr } = await supabase
      .from('products')
      .update(dbUpdates)
      .eq('id', id)
      .select('id');
    if (updateErr) {
      throw new Error(`Product was not updated: ${describeDbError(updateErr)}`);
    }
    if (!updatedRows || updatedRows.length === 0) {
      throw new Error(
        'Product was not updated: no row was changed. Either it no longer exists or the database policies do not allow this account to edit products.'
      );
    }

    if (updates.variants && updates.variants.length > 0) {
      validateVariants(updates.variants);

      const { data: existingVariants, error: listErr } = await supabase
        .from('product_variants')
        .select('id, bottle_type, size_ml')
        .eq('product_id', id);
      if (listErr) {
        throw new Error(`Could not read existing variants: ${describeDbError(listErr)}`);
      }

      const normalizeSize = (s) => String(s || '').toLowerCase().replace(/\s+/g, '');
      const keptIds = new Set();

      for (const v of updates.variants) {
        const row = toVariantRow(v, id, updates.category);
        const match = (existingVariants || []).find(
          (ev) =>
            ev.bottle_type?.toLowerCase() === row.bottle_type.toLowerCase() &&
            normalizeSize(ev.size_ml) === normalizeSize(row.size_ml)
        );

        if (match) {
          keptIds.add(match.id);
          const { data: vRows, error: vErr } = await supabase
            .from('product_variants')
            .update({
              price: row.price,
              sale_price: row.sale_price,
              stock_quantity: row.stock_quantity,
              sku: row.sku,
              is_active: row.is_active,
              updated_at: new Date().toISOString(),
            })
            .eq('id', match.id)
            .select('id');
          if (vErr || !vRows || vRows.length === 0) {
            throw new Error(
              `Variant ${row.bottle_type} ${row.size_ml} was not updated: ${describeDbError(vErr) || 'no row changed (permission denied?)'}`
            );
          }
        } else {
          const { data: inserted, error: insErr } = await supabase
            .from('product_variants')
            .insert([row])
            .select('id')
            .single();
          if (insErr || !inserted) {
            throw new Error(
              `Variant ${row.bottle_type} ${row.size_ml} was not created: ${describeDbError(insErr) || 'no row returned'}`
            );
          }
          keptIds.add(inserted.id);
        }
      }

      // Variants no longer in the matrix: delete them, or deactivate if order history references them
      const retired = (existingVariants || []).filter((ev) => !keptIds.has(ev.id));
      for (const ev of retired) {
        const { data: delRows, error: delErr } = await supabase
          .from('product_variants')
          .delete()
          .eq('id', ev.id)
          .select('id');
        if (delErr || !delRows || delRows.length === 0) {
          const { error: deactErr } = await supabase
            .from('product_variants')
            .update({ is_active: false, updated_at: new Date().toISOString() })
            .eq('id', ev.id);
          if (deactErr) {
            throw new Error(
              `Retired variant ${ev.bottle_type} ${ev.size_ml} could not be removed or deactivated: ${describeDbError(delErr || deactErr)}`
            );
          }
        }
      }
    }

    return getProductById(id);
  }

  // Local storage fallback (Supabase not configured)
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
 * Delete a product safely through the admin_delete_product database function.
 * - Products referenced by order items, combos or reviews are archived (is_active = false),
 *   never deleted, so purchase history is preserved.
 * - Otherwise the product, its variants and product_images rows are deleted in one
 *   transaction, and uploaded images that no other record references are removed from Storage.
 * @returns {Promise<{ action: 'deleted' | 'archived', name: string, references: object, storage: object }>}
 */
async function deleteProductRecord(id) {
  if (!isSupabaseConfigured || !supabase) {
    const list = getLocalProducts();
    saveLocalProducts(list.filter((p) => p.id !== id));
    return { action: 'deleted', name: '', references: {}, storage: { removed: [], failed: [], error: null } };
  }

  assertSupabaseRecordId(id);

  const { data, error } = await supabase.rpc('admin_delete_product', { p_product_id: id });
  if (error) {
    if (error.code === 'PGRST202') {
      throw new Error(
        'The database function admin_delete_product is not installed. Run supabase/new-project/02_auth_functions_rls.sql in the Supabase SQL Editor (see supabase/new-project/README.md), then try again.'
      );
    }
    if (error.code === '42501') {
      throw new Error(`The database does not recognise this account as an administrator: ${error.message}`);
    }
    throw new Error(describeDbError(error));
  }

  const result = data || {};
  let storage = { removed: [], failed: [], error: null };
  if (result.action === 'deleted' && Array.isArray(result.storage_paths) && result.storage_paths.length > 0) {
    storage = await deleteStorageFiles(result.storage_paths);
  }

  return {
    action: result.action,
    name: result.name || '',
    references: {
      orderItems: Number(result.order_item_refs) || 0,
      comboItems: Number(result.combo_item_refs) || 0,
      reviews: Number(result.review_refs) || 0,
      reason: result.reason || '',
    },
    storage,
  };
}

/**
 * Set the stock of one product variant (Inventory page). Product visibility is not touched:
 * a variant with 0 stock simply shows as out of stock on the storefront.
 */
async function updateVariantStockRecord(variantId, stockQuantity) {
  assertSupabaseRecordId(variantId);
  const stock = Math.max(0, Math.floor(Number(stockQuantity) || 0));
  const { data, error } = await supabase
    .from('product_variants')
    .update({ stock_quantity: stock, updated_at: new Date().toISOString() })
    .eq('id', variantId)
    .select('id, stock_quantity');
  if (error) {
    throw new Error(`Stock was not updated: ${describeDbError(error)}`);
  }
  if (!data || data.length === 0) {
    throw new Error('Stock was not updated: no variant row was changed (missing record or no permission).');
  }
  return Number(data[0].stock_quantity) || 0;
}

// Every product write clears this tab's storefront caches once it has finished (whatever the
// outcome), so the shop and homepage show the saved state immediately
function clearingCachesAfter(write) {
  return async (...args) => {
    try {
      return await write(...args);
    } finally {
      invalidateProductCaches();
    }
  };
}

export const createProduct = clearingCachesAfter(createProductRecord);
export const updateProduct = clearingCachesAfter(updateProductRecord);
export const deleteProduct = clearingCachesAfter(deleteProductRecord);
export const updateVariantStock = clearingCachesAfter(updateVariantStockRecord);
