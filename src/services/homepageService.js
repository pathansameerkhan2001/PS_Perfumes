import { supabase } from '../lib/supabase';
import { getPublicImageUrl } from '../lib/storage';

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
        display_order,
        created_at,
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
      .eq('is_active', true)
      .eq('is_featured', true)
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: false })
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
 * Fetch Best Selling Products:
 * 1. Primary logic: Rank using actual completed sales (orders & order_items) if sales exist.
 * 2. Fallback logic: If zero orders/sales exist, query products with is_bestseller = true AND is_active = true.
 * This ensures the homepage displays best sellers even before the first customer order.
 */
export async function getBestSellingProducts(limit = 8) {
  try {
    // 1. Check if real sales data exists in order_items
    const { data: orderItems, error: itemsErr } = await supabase
      .from('order_items')
      .select('product_id, quantity');

    if (!itemsErr && Array.isArray(orderItems) && orderItems.length > 0) {
      // Aggregate sales tally per product
      const salesTally = {};
      for (const item of orderItems) {
        if (!item.product_id) continue;
        salesTally[item.product_id] = (salesTally[item.product_id] || 0) + (Number(item.quantity) || 1);
      }

      const sortedProductIds = Object.keys(salesTally)
        .sort((a, b) => salesTally[b] - salesTally[a])
        .slice(0, limit);

      if (sortedProductIds.length > 0) {
        // Single-pass relational query for sales-ranked products (NO N+1)
        const { data: salesProducts, error: prodErr } = await supabase
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
            display_order,
            created_at,
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

        if (!prodErr && Array.isArray(salesProducts) && salesProducts.length > 0) {
          const prodMap = new Map(salesProducts.map((p) => [p.id, p]));
          const orderedProducts = [];
          for (const id of sortedProductIds) {
            const prod = prodMap.get(id);
            if (prod) {
              orderedProducts.push(formatHomepageProduct(prod));
            }
          }
          if (orderedProducts.length > 0) {
            return orderedProducts;
          }
        }
      }
    }

    // 2. Fallback: Query products table where is_bestseller = true AND is_active = true
    const { data: fallbackProducts, error: fallbackErr } = await supabase
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
        display_order,
        created_at,
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
      .eq('is_active', true)
      .eq('is_bestseller', true)
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: false })
      .limit(limit);

    if (fallbackErr) {
      if (import.meta.env.DEV) console.warn('getBestSellingProducts fallback note:', fallbackErr.message);
      return [];
    }

    return (fallbackProducts || []).map(formatHomepageProduct);
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
