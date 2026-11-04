import { supabase } from '../lib/supabase';
import { dbError, assertRows } from './dbErrors';

/*
 * Contact-page enquiries (table contact_enquiries, proposed migration 13).
 * As of 2026-11-04 Production has no such table: the Contact page then offers e-mail /
 * Instagram / WhatsApp instead of the form, and Admin → Enquiries says storage is not set up.
 * Nothing is ever reported as sent unless the database stored it.
 * Visitors may only insert (no read back); admins read and set the status.
 */

export const ENQUIRY_STATUSES = ['unread', 'read', 'resolved'];

// Same limits as the table's checks, so a visitor gets a clear message instead of a refusal
const LIMITS = { name: 120, email: 200, phone: 30, subject: 200, message: 5000 };
const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const isMissingTable = (error) => error?.code === 'PGRST205' || error?.code === '42P01';

/** Error thrown when the contact_enquiries table does not exist (code: 'ENQUIRIES_NOT_SET_UP'). */
function notSetUpError() {
  const err = new Error('Contact-form storage is not set up: the contact_enquiries table does not exist yet.');
  err.code = 'ENQUIRIES_NOT_SET_UP';
  return err;
}

/**
 * True when the contact_enquiries table exists. Visitors cannot read it (insert-only),
 * but PostgREST answers PGRST205 only when the table itself is missing.
 */
export async function isEnquiryStorageAvailable() {
  const { error } = await supabase.from('contact_enquiries').select('id').limit(0);
  if (error && isMissingTable(error)) return false;
  return true;
}

// Characters with a meaning inside a PostgREST or() filter are replaced, so a search term can
// never add conditions to the query
const cleanSearch = (term) => String(term || '').replace(/[,()*%\\:"']/g, ' ').trim().slice(0, 80);

/**
 * One page of enquiries for Admin → Enquiries, newest first, with the count of each tab.
 * tab: 'all' | 'unread' | 'done' (read and resolved). Throws ENQUIRIES_NOT_SET_UP when the
 * table is missing, and a database error otherwise (never an empty list instead of an error).
 */
export async function getEnquiriesPage({ tab = 'all', search = '', status = '', page = 1, pageSize = 20 } = {}) {
  const term = cleanSearch(search);
  const applyFilters = (query, forTab) => {
    let q = query;
    if (forTab === 'unread') q = q.eq('status', 'unread');
    else if (forTab === 'done') q = q.in('status', ['read', 'resolved']);
    if (status && ENQUIRY_STATUSES.includes(status)) q = q.eq('status', status);
    if (term) {
      q = q.or(
        ['name', 'email', 'phone', 'subject', 'message'].map((col) => `${col}.ilike.%${term}%`).join(',')
      );
    }
    return q;
  };
  const from = (Math.max(1, page) - 1) * pageSize;

  const countFor = (forTab) =>
    applyFilters(supabase.from('contact_enquiries').select('id', { count: 'exact', head: true }), forTab);

  const [list, all, unread, done] = await Promise.all([
    applyFilters(
      supabase.from('contact_enquiries').select('*', { count: 'exact' }).order('created_at', { ascending: false }),
      tab
    ).range(from, from + pageSize - 1),
    countFor('all'),
    countFor('unread'),
    countFor('done'),
  ]);

  const failed = [list, all, unread, done].find((r) => r.error);
  if (failed) {
    if (isMissingTable(failed.error)) throw notSetUpError();
    throw dbError('Could not load enquiries', failed.error);
  }
  return {
    rows: list.data || [],
    total: list.count || 0,
    counts: { all: all.count || 0, unread: unread.count || 0, done: done.count || 0 },
  };
}

/** Checks a Contact-form message against the table's rules; returns an error message or ''. */
export function validateEnquiry(enquiry) {
  const name = String(enquiry.name || '').trim();
  const email = String(enquiry.email || '').trim();
  const message = String(enquiry.message || '').trim();
  if (!name || !email || !message) return 'Please complete all required fields.';
  if (!EMAIL_PATTERN.test(email)) return 'Please enter a valid email address.';
  for (const [field, max] of Object.entries(LIMITS)) {
    if (String(enquiry[field] || '').trim().length > max) {
      return `The ${field} is too long (at most ${max} characters).`;
    }
  }
  return '';
}

export async function submitEnquiry(enquiry) {
  const problem = validateEnquiry(enquiry);
  if (problem) throw new Error(problem);
  const clean = (v) => String(v || '').trim();
  const row = {
    name: clean(enquiry.name),
    email: clean(enquiry.email),
    phone: clean(enquiry.phone) || null,
    subject: clean(enquiry.subject) || null,
    message: clean(enquiry.message),
  };
  // No .select(): visitors may insert but not read the table back
  const { error } = await supabase.from('contact_enquiries').insert([row]);
  if (error) {
    console.error('Enquiry could not be stored:', error);
    if (isMissingTable(error)) throw notSetUpError();
    throw dbError('Enquiry was not sent', error);
  }
  return { data: row, error: null };
}

export async function updateEnquiryStatus(id, status) {
  if (!ENQUIRY_STATUSES.includes(status)) throw new Error(`Unknown enquiry status "${status}".`);
  const { data, error } = await supabase
    .from('contact_enquiries')
    .update({ status })
    .eq('id', id)
    .select('id, status, updated_at');
  if (error) throw dbError('Enquiry was not updated', error);
  assertRows(data, 'Enquiry was not updated');
  return { success: true, data: data[0] };
}
