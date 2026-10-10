import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { REVIEWS } from '../data/reviews';

const LOCAL_REVIEWS_KEY = 'ps_db_reviews';

function getLocalReviews() {
  try {
    const raw = localStorage.getItem(LOCAL_REVIEWS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}

  const initial = REVIEWS.map((r, i) => ({
    id: `rev-${i + 1}`,
    product_name: r.productName,
    customer_name: r.author,
    location: r.location,
    rating: r.rating || 5,
    title: r.title,
    comment: r.comment,
    status: 'approved',
    created_at: new Date(Date.now() - i * 86400000 * 3).toISOString(),
  }));

  try {
    localStorage.setItem(LOCAL_REVIEWS_KEY, JSON.stringify(initial));
  } catch {}
  return initial;
}

function saveLocalReviews(revs) {
  try {
    localStorage.setItem(LOCAL_REVIEWS_KEY, JSON.stringify(revs));
  } catch {}
}

export async function getReviews(all = false) {
  if (isSupabaseConfigured && supabase) {
    try {
      let query = supabase.from('reviews').select('*').order('created_at', { ascending: false });
      if (!all) query = query.eq('status', 'approved');
      const { data, error } = await query;
      if (!error && data && data.length > 0) return data;
    } catch {}
  }

  const list = getLocalReviews();
  return all ? list : list.filter((r) => r.status === 'approved');
}

export async function updateReviewStatus(id, status) {
  if (isSupabaseConfigured && supabase) {
    try {
      await supabase.from('reviews').update({ status }).eq('id', id);
    } catch {}
  }

  const list = getLocalReviews();
  const updated = list.map((r) => (r.id === id ? { ...r, status } : r));
  saveLocalReviews(updated);
  return { success: true };
}

export async function deleteReview(id) {
  if (isSupabaseConfigured && supabase) {
    try {
      await supabase.from('reviews').delete().eq('id', id);
    } catch {}
  }

  const list = getLocalReviews();
  saveLocalReviews(list.filter((r) => r.id !== id));
  return { success: true };
}

export async function createReview(review) {
  let createdRecord = null;

  if (isSupabaseConfigured && supabase) {
    try {
      const payload = {
        customer_name: review.customer_name || 'Verified Patron',
        customer_email: review.customer_email || null,
        rating: Math.max(1, Math.min(5, Number(review.rating) || 5)),
        title: review.title || '',
        comment: review.comment || '',
        status: review.status || 'pending',
      };
      if (review.product_id) payload.product_id = review.product_id;

      const { data, error } = await supabase.from('reviews').insert([payload]).select().single();
      if (!error && data) createdRecord = data;
    } catch {}
  }

  const newRev = createdRecord || {
    ...review,
    id: `rev-${Date.now()}`,
    status: review.status || 'pending',
    created_at: new Date().toISOString(),
  };

  const list = getLocalReviews();
  saveLocalReviews([newRev, ...list]);
  return { data: newRev, error: null };
}
