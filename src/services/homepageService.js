import { supabase } from '../lib/supabase';
import { getPublicImageUrl } from '../lib/storage';
import { getProducts } from './products';

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
    resolvedImage = '/assets/prod-royal-amber.webp';
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

  const categoryName = item.categories?.name || item.category || 'Perfume';
  const categorySlug = item.categories?.slug || (categoryName || '').toLowerCase().trim();

  return {
    id: item.id,
    name: item.name,
    slug: item.slug || item.id,
    brand: item.brand || 'PS PERFUMES',
    category: categoryName,
    category_slug: categorySlug,
    main_image: resolvedImage,
    main_image_url: resolvedImage,
    image: resolvedImage,
    price: salePrice || price || 1499,
    compare_at_price: salePrice ? price : (item.compare_at_price ? Number(item.compare_at_price) : Math.round((price || 1499) * 1.3)),
    is_featured: Boolean(item.is_featured || item.featured),
    is_bestseller: Boolean(item.is_bestseller || item.bestseller),
    featured: Boolean(item.is_featured || item.featured),
    bestseller: Boolean(item.is_bestseller || item.bestseller),
    variants: activeVariants.map((v) => ({
      id: v.id,
      product_id: v.product_id,
      bottle_type: v.bottle_type || 'Glass Bottle',
      size_ml: v.size_ml || '50 ml',
      price: Number(v.price) || 0,
      sale_price: v.sale_price ? Number(v.sale_price) : null,
      stock: Number(v.stock_quantity !== undefined ? v.stock_quantity : v.stock) || 0,
      stock_quantity: Number(v.stock_quantity !== undefined ? v.stock_quantity : v.stock) || 0,
      is_active: v.is_active !== false && v.active !== false,
    })),
  };
}

/**
 * Fetch Featured Products (is_featured = true AND is_active = true)
 * Falls back to active newest products if no items specifically flagged
 */
export async function getFeaturedProducts(limit = 8) {
  try {
    if (supabase) {
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
            is_active
          )
        `)
        .eq('is_active', true)
        .eq('is_featured', true)
        .order('display_order', { ascending: true })
        .order('created_at', { ascending: false })
        .limit(limit);

      if (!error && Array.isArray(data) && data.length > 0) {
        return data.map(formatHomepageProduct);
      }

      // Fallback: active products if none flagged as featured
      const { data: activeData, error: activeErr } = await supabase
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
            is_active
          )
        `)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (!activeErr && Array.isArray(activeData) && activeData.length > 0) {
        return activeData.map(formatHomepageProduct);
      }
    }
  } catch (err) {
    if (import.meta.env.DEV) console.warn('getFeaturedProducts error:', err);
  }

  // Final fallback to catalog products
  const prods = await getProducts({ status: 'active', limit });
  return prods.map(formatHomepageProduct);
}

/**
 * Fetch Best Selling Products:
 * 1. Primary logic: Rank using actual completed sales (orders & order_items) if sales exist.
 * 2. Fallback logic: If zero orders/sales exist, query products with is_bestseller = true AND is_active = true.
 * 3. Fallback: Query all active products.
 */
export async function getBestSellingProducts(limit = 8) {
  try {
    if (supabase) {
      // 1. Check if real sales data exists in order_items
      const { data: orderItems, error: itemsErr } = await supabase
        .from('order_items')
        .select('product_id, quantity');

      if (!itemsErr && Array.isArray(orderItems) && orderItems.length > 0) {
        const salesTally = {};
        for (const item of orderItems) {
          if (!item.product_id) continue;
          salesTally[item.product_id] = (salesTally[item.product_id] || 0) + (Number(item.quantity) || 1);
        }

        const sortedProductIds = Object.keys(salesTally)
          .sort((a, b) => salesTally[b] - salesTally[a])
          .slice(0, limit);

        if (sortedProductIds.length > 0) {
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

      // 2. Query products table where is_bestseller = true AND is_active = true
      const { data: bestsellerProducts, error: bsErr } = await supabase
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
            is_active
          )
        `)
        .eq('is_active', true)
        .eq('is_bestseller', true)
        .order('display_order', { ascending: true })
        .order('created_at', { ascending: false })
        .limit(limit);

      if (!bsErr && Array.isArray(bestsellerProducts) && bestsellerProducts.length > 0) {
        return bestsellerProducts.map(formatHomepageProduct);
      }

      // 3. Fallback: active products ordered by display_order
      const { data: fallbackActive, error: fallErr } = await supabase
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
            is_active
          )
        `)
        .eq('is_active', true)
        .order('display_order', { ascending: true })
        .limit(limit);

      if (!fallErr && Array.isArray(fallbackActive) && fallbackActive.length > 0) {
        return fallbackActive.map(formatHomepageProduct);
      }
    }
  } catch (err) {
    if (import.meta.env.DEV) console.warn('getBestSellingProducts error:', err);
  }

  // Fallback to catalog products
  const prods = await getProducts({ status: 'active', limit });
  return prods.map(formatHomepageProduct);
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

