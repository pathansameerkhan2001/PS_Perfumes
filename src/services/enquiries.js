import { supabase } from '../lib/supabase';
import { dbError, assertRows } from './dbErrors';

/*
 * The live database (verified 2026-10-19) has NO contact_enquiries table, so contact-form
 * submissions cannot be stored yet. submitEnquiry() therefore reports the failure honestly
 * (the Contact page then shows the e-mail / WhatsApp fallback message) instead of pretending
 * the message was sent. Creating the table is a schema decision for the store owner.
 * The insert below does not request the row back, so it will work for anonymous visitors
 * once a table with an anonymous INSERT policy exists.
 */

/**
 * True when the contact_enquiries table exists. Visitors cannot read it (insert-only),
 * but PostgREST answers PGRST205 only when the table itself is missing.
 */
export async function isEnquiryStorageAvailable() {
  const { error } = await supabase.from('contact_enquiries').select('id').limit(0);
  if (error && (error.code === 'PGRST205' || error.code === '42P01')) return false;
  return true;
}

export async function getEnquiries() {
  const { data, error } = await supabase
    .from('contact_enquiries')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw dbError('Could not load enquiries', error);
  return data || [];
}

export async function submitEnquiry(enquiry) {
  const row = {
    name: enquiry.name,
    email: enquiry.email,
    phone: enquiry.phone || null,
    subject: enquiry.subject || null,
    message: enquiry.message,
  };
  const { error } = await supabase.from('contact_enquiries').insert([row]);
  if (error) {
    console.error('Enquiry could not be stored:', error);
    throw dbError('Enquiry was not sent', error);
  }
  return { data: row, error: null };
}

export async function updateEnquiryStatus(id, status) {
  const { data, error } = await supabase.from('contact_enquiries').update({ status }).eq('id', id).select('id');
  if (error) throw dbError('Enquiry was not updated', error);
  assertRows(data, 'Enquiry was not updated');
  return { success: true };
}
