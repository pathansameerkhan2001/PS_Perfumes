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
 * @param {{ productId?: string, featuredOnly?: boolean, featuredFirst?: boolean, limit?: number }} [options]
 *   featuredFirst: reviews the admin marked "Featured" come first (homepage)
 */
export async function getReviews(all = false, options = {}) {
  const { productId, featuredOnly, featuredFirst, limit } = options;
  let query = supabase.from('reviews').select('*');
  if (featuredFirst) query = query.order('is_featured', { ascending: false });
  query = query.order('created_at', { ascending: false });
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

function toReviewRow(review) {
  const row = {};
  if (review.customer_name !== undefined) row.customer_name = String(review.customer_name || '').trim();
  if (review.rating !== undefined) row.rating = Math.max(1, Math.min(5, Math.round(Number(review.rating) || 5)));
  if (review.title !== undefined) row.title = String(review.title || '').trim() || null;
  if (review.comment !== undefined || review.review_text !== undefined) {
    row.review_text = String(review.comment ?? review.review_text ?? '').trim();
  }
  if (review.product_id !== undefined) row.product_id = review.product_id || null;
  if (review.is_approved !== undefined) row.is_approved = Boolean(review.is_approved);
  if (review.is_featured !== undefined) row.is_featured = Boolean(review.is_featured);
  return row;
}

function validateReviewRow(row) {
  if (row.customer_name !== undefined && !row.customer_name) throw new Error('Customer name (or approved initials) is required.');
  if (row.review_text !== undefined && !row.review_text) throw new Error('Review text is required.');
}

/**
 * Admin → Reviews: add a review supplied by a customer (e.g. received on WhatsApp).
 * Only administrators pass the database policy; visitors cannot insert or edit reviews.
 */
export async function adminCreateReview(review) {
  const row = { is_approved: false, is_featured: false, ...toReviewRow(review) };
  if (!row.customer_name || !row.review_text) {
    throw new Error('Customer name and review text are required.');
  }
  const { data, error } = await supabase.from('reviews').insert([row]).select('id');
  if (error) throw dbError('Review was not saved', error);
  assertRows(data, 'Review was not saved');
  return { success: true };
}

/** Admin → Reviews: edit text, rating, name, product, approval or featured flag. */
export async function adminUpdateReview(id, updates) {
  const row = toReviewRow(updates);
  validateReviewRow(row);
  const { data, error } = await supabase
    .from('reviews')
    .update({ ...row, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('id');
  if (error) throw dbError('Review was not updated', error);
  assertRows(data, 'Review was not updated');
  return { success: true };
}
