import { supabase } from '../lib/supabase';
import { dbError, assertRows } from './dbErrors';

/*
 * Live schema (verified 2026-10-19):
 *   coupons (id, code, description, discount_type, discount_value, minimum_order_amount,
 *            usage_limit, used_count, is_active, starts_at, expires_at, created_at, updated_at)
 * The storefront cart validates codes through the validate_coupon() database function and
 * counts a use through redeem_coupon() after the order is stored.
 */

function formatCoupon(row) {
  return {
    ...row,
    min_order_amount: Number(row.minimum_order_amount) || 0,
    discount_value: Number(row.discount_value) || 0,
    used_count: Number(row.used_count) || 0,
  };
}

export async function getCoupons() {
  const { data, error } = await supabase.from('coupons').select('*').order('created_at', { ascending: false });
  if (error) throw dbError('Could not load coupons', error);
  return (data || []).map(formatCoupon);
}

/**
 * Storefront coupon check. Visitors cannot read the coupons table, so this calls the
 * validate_coupon() database function (migration 20261019), which checks active status,
 * start/expiry dates, usage limit and minimum order, and computes the discount.
 * @returns {Promise<{ valid: boolean, message: string, code?: string, discount_type?: string,
 *   discount_value?: number, minimum_order_amount?: number, discount_amount?: number }>}
 */
export async function validateCouponCode(code, subtotal) {
  const clean = String(code || '').trim().toUpperCase();
  if (!clean) return { valid: false, message: 'Enter a promo code.' };

  const { data, error } = await supabase.rpc('validate_coupon', {
    p_code: clean,
    p_subtotal: Number(subtotal) || 0,
  });
  if (error) {
    console.error('Coupon validation failed:', error);
    return {
      valid: false,
      message:
        error.code === 'PGRST202'
          ? 'Promo codes are not available at the moment.'
          : 'The promo code could not be checked. Please try again.',
    };
  }
  return {
    valid: Boolean(data?.valid),
    message: data?.message || (data?.valid ? 'Promo code applied.' : 'Invalid promo code.'),
    code: data?.code,
    discount_type: data?.discount_type,
    discount_value: Number(data?.discount_value) || 0,
    minimum_order_amount: Number(data?.minimum_order_amount) || 0,
    discount_amount: Number(data?.discount_amount) || 0,
  };
}

/** Counts one use of the code for a just-placed order (see redeem_coupon() in the migration). */
export async function redeemCoupon(code, orderId) {
  const { data, error } = await supabase.rpc('redeem_coupon', { p_code: code, p_order_id: orderId });
  if (error) {
    console.error('Coupon redemption was not recorded:', error);
    return false;
  }
  return Boolean(data);
}

/** Same discount rule as validate_coupon(), used to keep the cart total in sync as it changes. */
export function computeCouponDiscount(coupon, subtotal) {
  if (!coupon) return 0;
  const sub = Math.max(0, Number(subtotal) || 0);
  if (coupon.minimum_order_amount && sub < coupon.minimum_order_amount) return 0;
  const value = Math.max(0, Number(coupon.discount_value) || 0);
  const discount = coupon.discount_type === 'fixed' ? Math.min(value, sub) : Math.round((sub * Math.min(value, 100)) / 100);
  return Math.max(0, Math.min(discount, sub));
}

export async function createCoupon(coupon) {
  const code = String(coupon.code || '').toUpperCase().trim();
  const value = Number(coupon.discount_value);
  const type = coupon.discount_type === 'fixed' ? 'fixed' : 'percentage';
  if (!code) throw new Error('Coupon code is required.');
  if (!(value > 0)) throw new Error('Discount value must be greater than 0.');
  if (type === 'percentage' && value > 100) throw new Error('A percentage discount cannot exceed 100.');

  const payload = {
    code,
    description: coupon.description || null,
    discount_type: type,
    discount_value: value,
    minimum_order_amount: Number(coupon.min_order_amount) || 0,
    usage_limit: coupon.usage_limit ? Number(coupon.usage_limit) : null,
    is_active: coupon.is_active !== undefined ? Boolean(coupon.is_active) : true,
    starts_at: coupon.starts_at || null,
    expires_at: coupon.expires_at || null,
  };

  const { data, error } = await supabase.from('coupons').insert([payload]).select().single();
  if (error || !data) throw dbError(`Coupon ${code} was not created`, error);
  return { data: formatCoupon(data), error: null };
}

export async function toggleCouponActive(id, is_active) {
  const { data, error } = await supabase
    .from('coupons')
    .update({ is_active, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('id');
  if (error) throw dbError('Coupon was not updated', error);
  assertRows(data, 'Coupon was not updated');
  return { success: true };
}

export async function deleteCoupon(id) {
  const { data, error } = await supabase.from('coupons').delete().eq('id', id).select('id');
  if (error) throw dbError('Coupon was not deleted', error);
  assertRows(data, 'Coupon was not deleted');
  return { success: true };
}
