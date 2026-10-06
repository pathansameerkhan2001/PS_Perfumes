import { supabase, isSupabaseConfigured } from '../lib/supabase';

const LOCAL_COUPONS_KEY = 'ps_db_coupons';

export const INITIAL_COUPONS = [
  {
    id: 'cp-01',
    code: 'PS10',
    discount_type: 'percentage',
    discount_value: 10,
    min_order_amount: 999,
    max_discount_amount: 500,
    usage_limit: 1000,
    used_count: 84,
    is_active: true,
  },
  {
    id: 'cp-02',
    code: 'WELCOME20',
    discount_type: 'percentage',
    discount_value: 20,
    min_order_amount: 1499,
    max_discount_amount: 600,
    usage_limit: 500,
    used_count: 142,
    is_active: true,
  },
  {
    id: 'cp-03',
    code: 'ROYAL100',
    discount_type: 'fixed',
    discount_value: 100,
    min_order_amount: 999,
    max_discount_amount: 100,
    usage_limit: 200,
    used_count: 18,
    is_active: true,
  },
];

function getLocalCoupons() {
  try {
    const raw = localStorage.getItem(LOCAL_COUPONS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}

  try {
    localStorage.setItem(LOCAL_COUPONS_KEY, JSON.stringify(INITIAL_COUPONS));
  } catch {}
  return INITIAL_COUPONS;
}

function saveLocalCoupons(coupons) {
  try {
    localStorage.setItem(LOCAL_COUPONS_KEY, JSON.stringify(coupons));
  } catch {}
}

export async function getCoupons() {
  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase.from('coupons').select('*').order('created_at', { ascending: false });
      if (!error && data && data.length > 0) return data;
    } catch {}
  }
  return getLocalCoupons();
}

export async function validateCoupon(code, subtotal) {
  const clean = code.trim().toUpperCase();
  const list = await getCoupons();
  const coupon = list.find((c) => c.code.toUpperCase() === clean && c.is_active);

  if (!coupon) {
    return { valid: false, message: 'Invalid or inactive promo code.' };
  }

  if (coupon.min_order_amount && subtotal < Number(coupon.min_order_amount)) {
    return {
      valid: false,
      message: `Minimum order amount of ₹${coupon.min_order_amount} required for this code.`,
    };
  }

  let discount = 0;
  if (coupon.discount_type === 'percentage') {
    discount = Math.round((subtotal * Number(coupon.discount_value)) / 100);
    if (coupon.max_discount_amount && discount > Number(coupon.max_discount_amount)) {
      discount = Number(coupon.max_discount_amount);
    }
  } else {
    discount = Number(coupon.discount_value);
  }

  return {
    valid: true,
    coupon,
    discount,
    message: `Promo code ${coupon.code} applied!`,
  };
}

export async function createCoupon(coupon) {
  const newCoupon = {
    ...coupon,
    id: coupon.id || `cp-${Date.now()}`,
    code: coupon.code.toUpperCase().trim(),
    discount_value: Number(coupon.discount_value) || 10,
    min_order_amount: Number(coupon.min_order_amount) || 0,
    max_discount_amount: coupon.max_discount_amount ? Number(coupon.max_discount_amount) : null,
    is_active: coupon.is_active !== undefined ? coupon.is_active : true,
    created_at: new Date().toISOString(),
  };

  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase.from('coupons').insert([newCoupon]).select().single();
      if (!error && data) {
        const list = getLocalCoupons();
        saveLocalCoupons([data, ...list]);
        return { data, error: null };
      }
    } catch {}
  }

  const list = getLocalCoupons();
  saveLocalCoupons([newCoupon, ...list]);
  return { data: newCoupon, error: null };
}

export async function toggleCouponActive(id, is_active) {
  if (isSupabaseConfigured && supabase) {
    try {
      await supabase.from('coupons').update({ is_active }).eq('id', id);
    } catch {}
  }

  const list = getLocalCoupons();
  saveLocalCoupons(list.map((c) => (c.id === id ? { ...c, is_active } : c)));
  return { success: true };
}

export async function deleteCoupon(id) {
  if (isSupabaseConfigured && supabase) {
    try {
      await supabase.from('coupons').delete().eq('id', id);
    } catch {}
  }

  const list = getLocalCoupons();
  saveLocalCoupons(list.filter((c) => c.id !== id));
  return { success: true };
}
