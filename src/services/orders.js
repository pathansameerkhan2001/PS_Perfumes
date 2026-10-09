import { supabase, isSupabaseConfigured } from '../lib/supabase';

const LOCAL_ORDERS_KEY = 'ps_db_orders';

export const INITIAL_ORDERS = [
  {
    id: 'ord-01',
    order_number: 'PS-892401',
    customer_name: 'Dr. Sameer Khan',
    email: 'brandnix.in@gmail.com',
    phone: '+91 94949 51600',
    shipping_address: {
      address: '7/242 Luxury Enclave, Near RTC Bus Stand',
      city: 'Kadapa',
      state: 'Andhra Pradesh',
      pincode: '516001',
      landmark: 'Opposite Royal Palace',
    },
    subtotal: 2998,
    shipping_fee: 0,
    discount: 299,
    total: 2699,
    payment_method: 'UPI / Online Payment',
    payment_status: 'paid',
    order_status: 'processing',
    created_at: new Date(Date.now() - 3600000 * 5).toISOString(),
    items: [
      {
        id: 'item-01',
        product_id: 'ps-01',
        product_name: 'Royal Amber Extrait',
        quantity: 1,
        price: 1499,
        total: 1499,
        size: '100ml',
        product_image: '/assets/prod-royal-amber.webp',
      },
      {
        id: 'item-02',
        product_id: 'ps-02',
        product_name: 'Noir Absolu',
        quantity: 1,
        price: 1499,
        total: 1499,
        size: '100ml',
        product_image: '/assets/prod-noir-absolu.webp',
      },
    ],
  },
  {
    id: 'ord-02',
    order_number: 'PS-892398',
    customer_name: 'Ayesha Rahman',
    email: 'ayesha.r@gmail.com',
    phone: '+91 98845 12040',
    shipping_address: {
      address: 'Plot 42, Jubilee Hills Road 10',
      city: 'Hyderabad',
      state: 'Telangana',
      pincode: '500033',
      landmark: 'Near Apollo Cradle',
    },
    subtotal: 1499,
    shipping_fee: 0,
    discount: 0,
    total: 1499,
    payment_method: 'Cash On Delivery (COD)',
    payment_status: 'pending',
    order_status: 'confirmed',
    created_at: new Date(Date.now() - 86400000).toISOString(),
    items: [
      {
        id: 'item-03',
        product_id: 'combo-01',
        product_name: 'PS Attar Gift Set (Pack of 4)',
        quantity: 1,
        price: 1499,
        total: 1499,
        size: '4 x 12ml Roll-on',
        product_image: '/assets/combo-attar-set.webp',
      },
    ],
  },
];

function getLocalOrders() {
  try {
    const raw = localStorage.getItem(LOCAL_ORDERS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}

  try {
    localStorage.setItem(LOCAL_ORDERS_KEY, JSON.stringify(INITIAL_ORDERS));
  } catch {}
  return INITIAL_ORDERS;
}

function saveLocalOrders(orders) {
  try {
    localStorage.setItem(LOCAL_ORDERS_KEY, JSON.stringify(orders));
  } catch {}
}

export async function getOrders() {
  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('*, order_items(*)')
        .order('created_at', { ascending: false });

      if (!error && data && data.length > 0) {
        return data.map((ord) => ({
          ...ord,
          items: ord.order_items || [],
        }));
      }
    } catch (e) {
      console.warn('Supabase getOrders error:', e);
    }
  }

  return getLocalOrders();
}

export async function getOrderByNumber(orderNumber) {
  if (!orderNumber) return null;
  const clean = orderNumber.trim();
  const cleanUpper = clean.toUpperCase();

  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('*, order_items(*)')
        .ilike('order_number', cleanUpper)
        .maybeSingle();

      if (!error && data) {
        return {
          ...data,
          items: data.order_items || [],
        };
      }
    } catch (e) {
      console.warn('Supabase getOrderByNumber error:', e);
    }
  }

  const local = getLocalOrders();
  return (
    local.find(
      (o) =>
        o.order_number?.toUpperCase() === cleanUpper ||
        o.id?.toUpperCase() === cleanUpper ||
        o.email?.toLowerCase() === clean.toLowerCase() ||
        o.phone?.replace(/[^0-9]/g, '') === clean.replace(/[^0-9]/g, '')
    ) || null
  );
}

export async function createOrder(orderPayload) {
  const orderNumber = `PS-${Math.floor(100000 + Math.random() * 900000)}`;
  const orderId = `ord-${Date.now()}`;
  const now = new Date().toISOString();

  const newOrder = {
    id: orderId,
    order_number: orderNumber,
    customer_name: `${orderPayload.firstName || ''} ${orderPayload.lastName || ''}`.trim(),
    email: orderPayload.email,
    phone: orderPayload.phone,
    shipping_address: {
      address: orderPayload.address,
      city: orderPayload.city,
      state: orderPayload.state,
      pincode: orderPayload.pincode,
      landmark: orderPayload.landmark || '',
    },
    subtotal: orderPayload.subtotal,
    shipping_fee: orderPayload.shipping || 0,
    discount: orderPayload.discountAmount || 0,
    total: orderPayload.total,
    payment_method: orderPayload.paymentMethod || 'COD',
    payment_status: orderPayload.paymentMethod === 'ONLINE' ? 'paid' : 'pending',
    order_status: 'pending',
    created_at: now,
    items: (orderPayload.items || []).map((it, idx) => ({
      id: `item-${Date.now()}-${idx}`,
      product_id: it.product?.id,
      product_name: it.product?.name,
      quantity: it.quantity,
      price: it.product?.price,
      total: it.product?.price * it.quantity,
      size: it.size || '100ml',
      product_image: it.product?.main_image || it.product?.image,
    })),
  };

  if (isSupabaseConfigured && supabase) {
    try {
      const { data: ord, error: ordErr } = await supabase
        .from('orders')
        .insert([{
          order_number: newOrder.order_number,
          customer_name: newOrder.customer_name,
          email: newOrder.email,
          phone: newOrder.phone,
          shipping_address: newOrder.shipping_address,
          subtotal: newOrder.subtotal,
          shipping_fee: newOrder.shipping_fee,
          discount: newOrder.discount,
          total: newOrder.total,
          payment_method: newOrder.payment_method,
          payment_status: newOrder.payment_status,
          order_status: newOrder.order_status,
        }])
        .select()
        .single();

      if (!ordErr && ord) {
        const orderItems = newOrder.items.map((it) => ({
          order_id: ord.id,
          product_id: it.product_id,
          product_name: it.product_name,
          quantity: it.quantity,
          price: it.price,
          total: it.total,
          size: it.size,
          product_image: it.product_image,
        }));
        await supabase.from('order_items').insert(orderItems);
        newOrder.id = ord.id;
      }
    } catch (e) {
      console.warn('Supabase order creation fallback:', e);
    }
  }

  // Update local storage
  const list = getLocalOrders();
  saveLocalOrders([newOrder, ...list]);
  return { order: newOrder, error: null };
}

export async function updateOrderStatus(orderId, status) {
  if (isSupabaseConfigured && supabase) {
    try {
      await supabase.from('orders').update({ order_status: status }).eq('id', orderId);
    } catch {}
  }

  const list = getLocalOrders();
  const updated = list.map((o) => (o.id === orderId ? { ...o, order_status: status } : o));
  saveLocalOrders(updated);
  return { success: true };
}
