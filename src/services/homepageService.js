import { supabase } from '../lib/supabase';
import { getPublicImageUrl } from '../lib/storage';
import { cachedRequest } from '../lib/requestCache';

/**
 * PS PERFUMES — High Performance Homepage Service
 * Strictly fetches only required card fields with zero N+1 queries.
 */

function formatHomepageProduct(item) {
  if (!item) return null;

  // Resolve image from Supabase Storage path or URL (bucket: ps-perfumes)
  let resolvedImage = '';
  if (item.main_image_url) {
    resolvedImage = getPublicImageUrl(item.main_image_url);
  } else if (item.main_image_path) {
    resolvedImage = getPublicImageUrl(item.main_image_path);
  } else if (item.main_image) {
    resolvedImage = getPublicImageUrl(item.main_image);
  }
  if (!resolvedImage) {
    resolvedImage = '/assets/ps-perfumes-logo.webp';
  }

  // Active variants
  const rawVariants = Array.isArray(item.product_variants)
    ? item.product_variants
    : Array.isArray(item.variants)
    ? item.variants
    : [];
  const activeVariants = rawVariants.filter((v) => v.is_active !== false && v.active !== false);

  // Price from lowest active variant
  let price = Number(item.price) || 0;
  let salePrice = item.sale_price ? Number(item.sale_price) : null;
  if (activeVariants.length > 0) {
    const sorted = [...activeVariants].sort(
      (a, b) => (Number(a.sale_price || a.price) || 0) - (Number(b.sale_price || b.price) || 0)
    );
    const lowest = sorted[0];
    price = Number(lowest.price) || 0;
    salePrice = lowest.sale_price ? Number(lowest.sale_price) : null;
  }

  // Product type saved by Admin → Products (Home Fragrance options), in fragrance_notes metadata
  let productType = null;
  let sampleEligible = false;
  try {
    const meta = typeof item.fragrance_notes === 'string' ? JSON.parse(item.fragrance_notes) : item.fragrance_notes;
    if (meta && typeof meta === 'object' && !Array.isArray(meta)) {
      productType = meta.product_type || null;
      sampleEligible = meta.sample_eligible === true;
    }
  } catch {
    productType = null;
  }

  const categoryName = item.categories?.name || item.category || 'Perfume';
  const categorySlug = item.categories?.slug || (categoryName || '').toLowerCase().trim();

  return {
    id: item.id,
    name: item.name,
    slug: item.slug || item.id,
    brand: item.brand || 'PS PERFUMES',
    category: categoryName,
    category_slug: categorySlug,
    product_type: productType,
    sample_eligible: sampleEligible,
    main_image: resolvedImage,
    main_image_url: resolvedImage,
    image: resolvedImage,
    // Real variant prices only: a strike-through price appears only for a genuine sale price
    price: salePrice || price || 0,
    compare_at_price: salePrice && salePrice < price ? price : null,
    is_featured: Boolean(item.is_featured || item.featured),
    is_bestseller: Boolean(item.is_bestseller || item.bestseller),
    featured: Boolean(item.is_featured || item.featured),
    bestseller: Boolean(item.is_bestseller || item.bestseller),
    // Admin → Products "New Arrival" flag (drives the NEW label; never set for fallback products)
    new_arrival: Boolean(item.is_new_arrival || item.new_arrival),
    is_new_arrival: Boolean(item.is_new_arrival || item.new_arrival),
    variants: activeVariants.map((v) => ({
      id: v.id,
      product_id: v.product_id,
      bottle_type: v.bottle_type || '',
      size_ml: v.size_ml || '',
      price: Number(v.price) || 0,
      sale_price: v.sale_price ? Number(v.sale_price) : null,
      stock: Number(v.stock_quantity !== undefined ? v.stock_quantity : v.stock) || 0,
      stock_quantity: Number(v.stock_quantity !== undefined ? v.stock_quantity : v.stock) || 0,
      is_active: v.is_active !== false && v.active !== false,
    })),
  };
}

// Card fields only (no N+1): product, its category and its variants
const SECTION_SELECT = `
  id,
  name,
  slug,
  brand,
  main_image_path,
  main_image_url,
  is_featured,
  is_bestseller,
  is_new_arrival,
  is_active,
  display_order,
  created_at,
  fragrance_notes,
  categories ( id, name, slug ),
  product_variants ( id, product_id, bottle_type, size_ml, price, sale_price, stock_quantity, is_active )
`;

/**
 * Products the admin explicitly flagged for one homepage section, nothing else.
 *
 * Rule (owner request, November 2026): a homepage section shows ONLY active products whose
 * flag is switched on in Admin → Products (Featured / Best Seller / New Arrival), in the display
 * order set there (newest first among equal positions). There is deliberately no fallback to
 * other active products, sales rankings, demo data or fixed ids: when nothing is flagged the
 * list is empty and the homepage leaves the section out.
 */
async function getFlaggedProducts(flagColumn, limit) {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from('products')
      .select(SECTION_SELECT)
      .eq('is_active', true)
      .eq(flagColumn, true)
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data || []).map(formatHomepageProduct).filter(Boolean);
  } catch (err) {
    console.error(`Could not load homepage products (${flagColumn}):`, err?.message || err);
    return [];
  }
}

/** Featured Products section: only products flagged "Featured Product". */
export function getFeaturedProducts(limit = 8) {
  return getFlaggedProducts('is_featured', limit);
}

/** New Arrivals section: only products flagged "New Arrival". */
export function getNewArrivalProducts(limit = 8) {
  return getFlaggedProducts('is_new_arrival', limit);
}

/** Best Sellers section: only products flagged "Best Seller". */
export function getBestSellingProducts(limit = 8) {
  return getFlaggedProducts('is_bestseller', limit);
}

/**
 * Fetch Homepage Categories (Attar, Perfume, Bakhoor, etc.)
 */
export async function getHomepageCategories() {
  try {
    if (supabase) {
      const { data, error } = await supabase
        .from('categories')
        .select('id, name, slug, image_url, display_order, is_active')
        .eq('is_active', true)
        .order('display_order', { ascending: true });

      if (!error && Array.isArray(data) && data.length > 0) {
        return data;
      }
    }
  } catch (err) {
    if (import.meta.env.DEV) console.warn('getHomepageCategories error:', err);
  }
  return [];
}

export const HOMEPAGE_PRODUCTS_CACHE_KEY = 'home:product-sections';

/**
 * Parallel fetcher for Best Sellers and Featured Products.
 * Shared through the storefront request cache, so returning to the homepage within a minute
 * shows the sections at once without new requests (cleared by product writes in this tab).
 */
export function getHomepageProductSections() {
  return cachedRequest(HOMEPAGE_PRODUCTS_CACHE_KEY, async () => {
    const [bestSellers, featuredProducts, newArrivals] = await Promise.all([
      getBestSellingProducts(),
      getFeaturedProducts(),
      getNewArrivalProducts(),
    ]);
    return { bestSellers, featuredProducts, newArrivals };
  });
}

