import { supabase } from '../lib/supabase';
import { dbError, assertRows } from './dbErrors';

/*
 * Shipping by delivery PIN code (migration proposed-11-shipping). The database prices shipping when
 * the order is placed; the quote here is only what the checkout page shows first.
 *   shipping_config   (id, mode 'legacy'|'pincode', fallback_allowed, fallback_charge,
 *                      free_shipping_rule 'none'|'subtotal_threshold', free_shipping_threshold)
 *   shipping_zones    (id, name, charge, is_active, notes)
 *   shipping_pincodes (id, pincode, is_serviceable, charge, zone_id, is_active, notes)
 * Until the migration is installed (PGRST202) the standard rule from Store Settings applies.
 */

/**
 * @returns {Promise<null | { mode: 'legacy'|'pincode', ok: boolean, amount: number|null, message: string,
 *   needsPincode: boolean, freeShippingThreshold: number|null }>} null when not installed
 */
export async function getShippingQuote(pincode, subtotal) {
  const { data, error } = await supabase.rpc('get_shipping_quote', {
    p_pincode: pincode || null,
    p_subtotal: Number(subtotal) || 0,
  });
  if (error) {
    if (error.code === 'PGRST202') return null;
    throw dbError('The delivery charge could not be checked', error);
  }
  return {
    mode: data?.mode === 'pincode' ? 'pincode' : 'legacy',
    ok: Boolean(data?.ok),
    amount: data?.amount == null ? null : Number(data.amount),
    message: data?.message || '',
    needsPincode: Boolean(data?.needs_pincode),
    freeShippingThreshold: data?.free_shipping_threshold == null ? null : Number(data.free_shipping_threshold),
  };
}

// ---------------------------------------------------------------------------
// Admin → Shipping. Row-level security lets only administrators read or change these.
// ---------------------------------------------------------------------------

const toCharge = (value) => (value === '' || value == null ? null : Number(value));

export async function getShippingConfig() {
  const { data, error } = await supabase.from('shipping_config').select('*').eq('id', true).maybeSingle();
  if (error) throw dbError('Could not load the shipping settings', error);
  return data;
}

/** Only the given fields change. The database refuses an incomplete or undeliverable setup. */
export async function updateShippingConfig(changes) {
  const { data, error } = await supabase.from('shipping_config').update(changes).eq('id', true).select('id');
  if (error) throw dbError('Shipping settings were not saved', error);
  assertRows(data, 'Shipping settings were not saved');
}

export async function getShippingZones() {
  const { data, error } = await supabase.from('shipping_zones').select('*').order('name');
  if (error) throw dbError('Could not load delivery zones', error);
  return data || [];
}

export async function saveShippingZone({ id, name, charge, is_active, notes }) {
  const row = { name: String(name || '').trim(), charge: toCharge(charge), is_active: Boolean(is_active), notes: notes || null };
  const query = id
    ? supabase.from('shipping_zones').update(row).eq('id', id).select('id')
    : supabase.from('shipping_zones').insert([row]).select('id');
  const { data, error } = await query;
  if (error) throw dbError('Delivery zone was not saved', error);
  assertRows(data, 'Delivery zone was not saved');
}

export async function deleteShippingZone(id) {
  const { data, error } = await supabase.from('shipping_zones').delete().eq('id', id).select('id');
  if (error) {
    if (error.code === '23503') throw new Error('This zone still has PIN codes. Move or remove them first.');
    throw dbError('Delivery zone was not deleted', error);
  }
  assertRows(data, 'Delivery zone was not deleted');
}

export async function getShippingPincodes() {
  const { data, error } = await supabase.from('shipping_pincodes').select('*').order('pincode');
  if (error) throw dbError('Could not load PIN codes', error);
  return data || [];
}

export async function saveShippingPincode({ id, pincode, is_serviceable, charge, zone_id, is_active, notes }) {
  const row = {
    pincode: String(pincode || '').trim(),
    is_serviceable: Boolean(is_serviceable),
    charge: toCharge(charge),
    zone_id: zone_id || null,
    is_active: Boolean(is_active),
    notes: notes || null,
  };
  const query = id
    ? supabase.from('shipping_pincodes').update(row).eq('id', id).select('id')
    : supabase.from('shipping_pincodes').insert([row]).select('id');
  const { data, error } = await query;
  if (error) {
    if (error.code === '23505') throw new Error(`PIN code ${row.pincode} is already listed.`);
    throw dbError('PIN code was not saved', error);
  }
  assertRows(data, 'PIN code was not saved');
}

export async function deleteShippingPincode(id) {
  const { data, error } = await supabase.from('shipping_pincodes').delete().eq('id', id).select('id');
  if (error) throw dbError('PIN code was not deleted', error);
  assertRows(data, 'PIN code was not deleted');
}
