import { supabase } from '../lib/supabase';
import { dbError, assertRows } from './dbErrors';

/*
 * Live schema (verified 2026-10-19):
 *   reviews (id, product_id, customer_name, rating, title, review_text,
 *            is_approved, is_featured, created_at, updated_at)
 * The admin UI works with status 'approved' | 'pending'; it maps to is_approved.
 */

function formatReview(row, productNames) {
  return {
    ...row,
    comment: row.review_text || '',
    status: row.is_approved ? 'approved' : 'pending',
    product_name: productNames.get(row.product_id) || '',
    featured: Boolean(row.is_featured),
  };
}

async function loadProductNames(rows) {
  const ids = [...new Set(rows.map((r) => r.product_id).filter(Boolean))];
  const names = new Map();
  if (ids.length === 0) return names;
  const { data, error } = await supabase.from('products').select('id, name').in('id', ids);
  if (error) throw dbError('Could not load review products', error);
  (data || []).forEach((p) => names.set(p.id, p.name));
  return names;
}

/**
 * @param {boolean} all - true for admin (every review), false for storefront (approved only)
 * @param {{ productId?: string, featuredOnly?: boolean, limit?: number }} [options]
 */
export async function getReviews(all = false, options = {}) {
  const { productId, featuredOnly, limit } = options;
  let query = supabase.from('reviews').select('*').order('created_at', { ascending: false });
  if (!all) query = query.eq('is_approved', true);
  if (productId) query = query.eq('product_id', productId);
  if (featuredOnly) query = query.eq('is_featured', true);
  if (limit) query = query.limit(limit);

  const { data, error } = await query;
  if (error) throw dbError('Could not load reviews', error);
  const rows = data || [];
  const names = await loadProductNames(rows);
  return rows.map((r) => formatReview(r, names));
}

export async function updateReviewStatus(id, status) {
  const { data, error } = await supabase
    .from('reviews')
    .update({ is_approved: status === 'approved', updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('id');
  if (error) throw dbError('Review was not updated', error);
  assertRows(data, 'Review was not updated');
  return { success: true };
}

export async function deleteReview(id) {
  const { data, error } = await supabase.from('reviews').delete().eq('id', id).select('id');
  if (error) throw dbError('Review was not deleted', error);
  assertRows(data, 'Review was not deleted');
  return { success: true };
}

export async function createReview(review) {
  const payload = {
    customer_name: review.customer_name || 'Customer',
    rating: Math.max(1, Math.min(5, Number(review.rating) || 5)),
    title: review.title || '',
    review_text: review.comment || review.review_text || '',
    is_approved: false,
  };
  if (review.product_id) payload.product_id = review.product_id;

  const { data, error } = await supabase.from('reviews').insert([payload]).select().single();
  if (error || !data) throw dbError('Review was not submitted', error);
  return { data: formatReview(data, new Map()), error: null };
}
