import { supabase } from '../lib/supabase';
import { getPublicImageUrl } from '../lib/storage';

/**
 * PS PERFUMES — High Performance Homepage Service
 * Strictly fetches only required card fields with zero N+1 queries.
 */

function formatHomepageProduct(item) {
  if (!item) return null;

  // Resolve image from Supabase Storage path or URL
  let resolvedImage = item.main_image_url;
  if (!resolvedImage && item.main_image_path) {
    resolvedImage = getPublicImageUrl(item.main_image_path);
  }
  if (!resolvedImage) {
    resolvedImage = '/assets/prod-royal-amber.webp';
  }

  // Active variants
  const rawVariants = Array.isArray(item.product_variants) ? item.product_variants : [];
  const activeVariants = rawVariants.filter((v) => v.is_active !== false);

  // Price from lowest/first active variant
  let price = 0;
  let salePrice = null;
  if (activeVariants.length > 0) {
    const defaultVar = activeVariants[0];
    price = Number(defaultVar.price) || 0;
    salePrice = defaultVar.sale_price ? Number(defaultVar.sale_price) : null;
  }

  return {
    id: item.id,
    name: item.name,
    slug: item.slug || item.id,
    brand: item.brand || 'PS PERFUMES',
    main_image: resolvedImage,
    main_image_url: resolvedImage,
    image: resolvedImage,
    price: salePrice || price,
    compare_at_price: salePrice ? price : null,
    is_featured: Boolean(item.is_featured),
    is_bestseller: Boolean(item.is_bestseller),
    featured: Boolean(item.is_featured),
    bestseller: Boolean(item.is_bestseller),
    variants: activeVariants.map((v) => ({
      id: v.id,
      product_id: v.product_id,
      bottle_type: v.bottle_type || 'Glass Bottle',
      size_ml: v.size_ml || '50ml',
      price: Number(v.price) || 0,
      sale_price: v.sale_price ? Number(v.sale_price) : null,
      stock_quantity: Number(v.stock_quantity) || 0,
      is_active: v.is_active !== false,
    })),
  };
}

/**
 * Fetch Featured Products (is_featured = true AND is_active = true)
 * Selects strictly required fields with single-pass relational variants
 */
export async function getFeaturedProducts(limit = 8) {
  try {
    const { data, error } = await supabase
      .from('products')
      .select(`
        id,
        name,
        slug,
        brand,
        main_image_path,
        main_image_url,
        is_featured,
        is_bestseller,
        is_active,
        product_variants (
          id,
          product_id,
          bottle_type,
          size_ml,
          price,
          sale_price,
          stock_quantity,
          is_active
        )
      `)
      .eq('is_featured', true)
      .eq('is_active', true)
      .limit(limit);

    if (error) {
      if (import.meta.env.DEV) console.warn('getFeaturedProducts note:', error.message);
      return [];
    }

    return (data || []).map(formatHomepageProduct);
  } catch (err) {
    if (import.meta.env.DEV) console.warn('getFeaturedProducts error:', err);
    return [];
  }
}

/**
 * Fetch Best Selling Products calculated from real sales (orders & order_items)
 * If no order records exist: returns empty array [] (UI renders "No sales data yet.")
 */
export async function getBestSellingProducts(limit = 8) {
  try {
    // 1. Query order items to calculate actual units sold
    const { data: orderItems, error: itemsErr } = await supabase
      .from('order_items')
      .select('product_id, quantity');

    if (itemsErr || !orderItems || orderItems.length === 0) {
      // No sales data in database
      return [];
    }

    // 2. Aggregate sales per product
    const salesTally = {};
    for (const item of orderItems) {
      if (!item.product_id) continue;
      salesTally[item.product_id] = (salesTally[item.product_id] || 0) + (Number(item.quantity) || 1);
    }

    const sortedProductIds = Object.keys(salesTally)
      .sort((a, b) => salesTally[b] - salesTally[a])
      .slice(0, limit);

    if (sortedProductIds.length === 0) {
      return [];
    }

    // 3. Batched relational query for top best-seller products (NO N+1)
    const { data: products, error: prodErr } = await supabase
      .from('products')
      .select(`
        id,
        name,
        slug,
        brand,
        main_image_path,
        main_image_url,
        is_featured,
        is_bestseller,
        is_active,
        product_variants (
          id,
          product_id,
          bottle_type,
          size_ml,
          price,
          sale_price,
          stock_quantity,
          is_active
        )
      `)
      .in('id', sortedProductIds)
      .eq('is_active', true);

    if (prodErr || !products) {
      return [];
    }

    // Sort products by sales rank
    const prodMap = new Map(products.map((p) => [p.id, p]));
    const orderedProducts = [];
    for (const id of sortedProductIds) {
      const prod = prodMap.get(id);
      if (prod) {
        orderedProducts.push(formatHomepageProduct(prod));
      }
    }

    return orderedProducts;
  } catch (err) {
    if (import.meta.env.DEV) console.warn('getBestSellingProducts error:', err);
    return [];
  }
}

/**
 * Fetch Homepage Categories (Attar, Perfume, Bakhoor, etc.)
 */
export async function getHomepageCategories() {
  try {
    const { data, error } = await supabase
      .from('categories')
      .select('id, name, slug, image_url, display_order')
      .order('display_order', { ascending: true });

    if (error) {
      if (import.meta.env.DEV) console.warn('getHomepageCategories note:', error.message);
      return [];
    }

    return data || [];
  } catch (err) {
    if (import.meta.env.DEV) console.warn('getHomepageCategories error:', err);
    return [];
  }
}

/**
 * Parallel fetcher for Best Sellers and Featured Products
 */
export async function getHomepageProductSections() {
  const [bestSellers, featuredProducts] = await Promise.all([
    getBestSellingProducts(),
    getFeaturedProducts(),
  ]);

  return { bestSellers, featuredProducts };
}
