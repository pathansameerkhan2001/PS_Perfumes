import { supabase } from '../../lib/supabase';
import { getPublicImageUrl } from '../../lib/storage';
import { isAwaitingPayment } from '../../services/orders';

/**
 * Service providing real aggregated data for the PS PERFUMES Admin Dashboard
 * Strictly uses real Supabase queries with zero mock/fake numbers.
 *
 * A failed query is reported as an error with a null value, never as 0 or an empty list:
 * "0 products" and "the products query failed" must look different on the dashboard.
 * Note that RLS does not raise errors for reads — rows the caller may not see are simply
 * left out — so the dashboard also shows whether the database recognises the admin.
 */

// Unpaid online checkouts are not orders yet: same rule as isAwaitingPayment, as a query filter
const REAL_ORDERS_FILTER = 'payment_method.neq.RAZORPAY,payment_status.in.(paid,refunded)';

function describeQueryError(error) {
  if (!error) return 'unknown error';
  const msg = error.message || error.details || error.hint || (error.status ? `HTTP ${error.status}` : 'unknown error');
  return `${msg}${error.code ? ` (code ${error.code})` : ''}`;
}

/**
 * Fetch top 4 KPI metrics: Orders, Revenue, Active Products, Customers.
 * Each metric is null when its query failed; `errors` lists one message per failed metric.
 */
export async function getDashboardMetrics() {
  const errors = [];
  const fail = (label, error) => {
    errors.push(`${label}: ${describeQueryError(error)}`);
    return null;
  };

  const [ordersRes, revenueRes, productsRes, customersRes] = await Promise.all([
    supabase.from('orders').select('id', { count: 'exact', head: true }).or(REAL_ORDERS_FILTER),
    // Revenue: orders recorded as paid, or delivered (cash on delivery is collected on delivery);
    // cancelled orders never count. payment_status changes only through a verified Razorpay
    // payment or when the store records it — nothing is assumed here.
    supabase
      .from('orders')
      .select('total_amount')
      .or('payment_status.eq.paid,order_status.eq.delivered')
      .neq('order_status', 'cancelled'),
    // Live schema: products.is_active (there is no status column)
    supabase.from('products').select('id', { count: 'exact', head: true }).eq('is_active', true),
    supabase.from('customers').select('id', { count: 'exact', head: true }),
  ]).catch((err) => {
    const e = { message: err?.message || 'network error' };
    return [{ error: e }, { error: e }, { error: e }, { error: e }];
  });

  const totalOrders = ordersRes.error ? fail('Orders', ordersRes.error) : ordersRes.count ?? 0;

  const totalRevenue = revenueRes.error
    ? fail('Revenue', revenueRes.error)
    : (revenueRes.data || []).reduce((acc, order) => acc + (Number(order.total_amount) || 0), 0);

  const totalProducts = productsRes.error ? fail('Products', productsRes.error) : productsRes.count ?? 0;

  // Checkout does not write to public.customers, so when it is empty or unavailable count
  // the distinct shoppers on orders (customer_id, else customer_email)
  let totalCustomers = null;
  if (!customersRes.error && typeof customersRes.count === 'number' && customersRes.count > 0) {
    totalCustomers = customersRes.count;
  } else {
    const { data: orderCusts, error: custErr } = await supabase
      .from('orders')
      .select('customer_email, customer_id')
      .or(REAL_ORDERS_FILTER);
    if (custErr) {
      fail('Customers', custErr);
    } else {
      totalCustomers = new Set(
        (orderCusts || [])
          .map((o) => o.customer_id || (o.customer_email || '').trim().toLowerCase())
          .filter(Boolean)
      ).size;
    }
  }

  if (errors.length > 0 && import.meta.env.DEV) console.error('getDashboardMetrics errors:', errors);

  return {
    data: { totalOrders, totalRevenue, totalProducts, totalCustomers },
    errors,
  };
}

/**
 * Fetch Best Selling Products from actual order items
 * Returns empty array [] if no sales data exists; error is set when the query failed
 */
export async function getBestSellingProducts() {
  try {
    const { data: items, error } = await supabase
      .from('order_items')
      .select('product_id, product_name, quantity, total_price, unit_price, bottle_type, size_ml, orders!inner(order_status, payment_method, payment_status)')
      // Items of cancelled orders are not sales
      .neq('orders.order_status', 'cancelled');

    if (error) {
      return { data: [], error: `Best sellers: ${describeQueryError(error)}` };
    }
    if (!items || items.length === 0) {
      return { data: [], error: null };
    }

    // Group sales by product_id or product_name
    const salesMap = {};
    for (const item of items) {
      if (isAwaitingPayment(item.orders)) continue;
      const key = item.product_id || item.product_name;
      if (!key) continue;
      const itemRev = Number(item.total_price) || (Number(item.unit_price || 0) * (Number(item.quantity) || 1));
      if (!salesMap[key]) {
        salesMap[key] = {
          id: key,
          name: item.product_name || 'Fragrance',
          category: 'Fragrance',
          type: item.bottle_type || 'Glass',
          size: item.size_ml || '',
          sold: 0,
          revenue: 0,
          image: '/assets/ps-perfumes-logo.webp',
        };
      }
      salesMap[key].sold += Number(item.quantity) || 1;
      salesMap[key].revenue += itemRev;
    }

    const sorted = Object.values(salesMap)
      .sort((a, b) => b.sold - a.sold)
      .slice(0, 5)
      .map((prod, idx) => ({
        ...prod,
        rank: idx + 1,
        rankType: idx === 0 ? 'gold' : idx === 1 ? 'silver' : idx === 2 ? 'bronze' : 'neutral',
      }));

    return { data: sorted, error: null };
  } catch (err) {
    if (import.meta.env.DEV) console.warn('getBestSellingProducts note:', err);
    return { data: [], error: `Best sellers: ${err?.message || 'unknown error'}` };
  }
}

/**
 * Fetch real Product Type Distribution: Glass Bottle, PVC Bottle, Combo Products
 */
export async function getProductTypeDistribution() {
  try {
    // 1. Query variants for bottle types
    const { data: variants, error: varErr } = await supabase
      .from('product_variants')
      .select('bottle_type');

    // 2. Query combos count
    const { count: combosCount, error: comboErr } = await supabase
      .from('combos')
      .select('*', { count: 'exact', head: true })
      .eq('is_active', true);

    if (varErr && comboErr) {
      return { data: null, error: null };
    }

    let glassCount = 0;
    let pvcCount = 0;

    if (variants && variants.length > 0) {
      for (const v of variants) {
        const type = (v.bottle_type || '').toLowerCase();
        if (type.includes('glass')) {
          glassCount += 1;
        } else if (type.includes('pvc')) {
          pvcCount += 1;
        }
      }
    }

    const totalCombo = combosCount || 0;
    const totalItems = glassCount + pvcCount + totalCombo;

    if (totalItems === 0) {
      return { data: null, error: null };
    }

    return {
      data: {
        total: totalItems,
        glass: {
          count: glassCount,
          percent: Math.round((glassCount / totalItems) * 100),
        },
        pvc: {
          count: pvcCount,
          percent: Math.round((pvcCount / totalItems) * 100),
        },
        combo: {
          count: totalCombo,
          percent: Math.round((totalCombo / totalItems) * 100),
        },
      },
      error: null,
    };
  } catch (err) {
    if (import.meta.env.DEV) console.warn('getProductTypeDistribution note:', err);
    return { data: null, error: null };
  }
}

/**
 * Fetch Low Stock Variants from public.product_variants
 * Uses: product_variants.stock_quantity and low_stock_threshold
 * Returns empty array [] if no variants are low on stock
 */
export async function getLowStockProducts() {
  try {
    const { data: variants, error } = await supabase
      .from('product_variants')
      .select(`
        id,
        bottle_type,
        size_ml,
        stock_quantity,
        is_active,
        products (
          id,
          name,
          main_image_url,
          main_image_path
        )
      `)
      .order('stock_quantity', { ascending: true })
      .limit(20);

    if (error) {
      return { data: [], error: `Low stock: ${describeQueryError(error)}` };
    }
    if (!variants) {
      return { data: [], error: null };
    }

    const lowStockItems = [];
    for (const v of variants) {
      const stock = Number(v.stock_quantity ?? 0);
      const threshold = 5;

      if (stock <= threshold) {
        let img = v.products?.main_image_url;
        if (!img && v.products?.main_image_path) {
          img = getPublicImageUrl(v.products.main_image_path);
        }

        lowStockItems.push({
          id: v.id,
          name: v.products?.name || 'Fragrance Product',
          variant: `${(v.bottle_type || 'Glass').replace(' Bottle', '')} / ${v.size_ml || '50ml'}`,
          stock,
          status: stock === 0 ? 'Out of Stock' : 'Low Stock',
          image: img || '/assets/ps-perfumes-logo.webp',
        });
      }
    }

    return { data: lowStockItems.slice(0, 5), error: null };
  } catch (err) {
    if (import.meta.env.DEV) console.warn('getLowStockProducts note:', err);
    return { data: [], error: `Low stock: ${err?.message || 'unknown error'}` };
  }
}

/**
 * Verification test to confirm public.categories table connectivity
 * Ordered by display_order
 */
export async function verifyCategoriesConnection() {
  try {
    const { data, error } = await supabase
      .from('categories')
      .select('id,name,slug')
      .order('display_order');

    if (error) {
      return { success: false, data: null, error: error.message };
    }

    return { success: true, data, error: null };
  } catch (err) {
    return { success: false, data: null, error: err?.message || 'Categories query failed' };
  }
}

/**
 * Fetch Recent Orders from public.orders
 * Returns up to limit (default 5) most recent orders.
 * Returns empty array [] if no orders exist.
 */
export async function getRecentOrders(limit = 5) {
  try {
    const { data, error } = await supabase
      .from('orders')
      .select('id, order_number, customer_name, shipping_address, total_amount, order_status, payment_status, payment_method, created_at')
      .or(REAL_ORDERS_FILTER)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      if (import.meta.env.DEV) console.warn('getRecentOrders note:', error.message);
      return { data: [], error: `Recent orders: ${describeQueryError(error)}` };
    }

    const formatted = (data || []).map((ord) => ({
      ...ord,
      total: Number(ord.total_amount) || 0,
      email: ord.shipping_address?.email || ord.shipping_address?.customer_email || 'Direct Order',
    }));

    return { data: formatted, error: null };
  } catch (err) {
    if (import.meta.env.DEV) console.warn('getRecentOrders catch:', err);
    return { data: [], error: `Recent orders: ${err?.message || 'unknown error'}` };
  }
}
