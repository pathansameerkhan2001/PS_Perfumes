import { supabase } from '../lib/supabase';
import { isValidUUID } from './products';
import { getPublicImageUrl } from '../lib/storage';
import { dbError, assertRows } from './dbErrors';

/*
 * Live schema (verified 2026-10-19):
 *   combos      (id, name, slug, description, image_url, image_path, price, sale_price,
 *                stock_quantity, is_featured, is_active, display_order, created_at, updated_at)
 *   combo_items (id, combo_id, product_id, quantity, created_at)
 *
 * Pricing convention: `price` is the regular (original) price and `sale_price` the combo
 * price when it is lower. Combo items reference real products; bottle type and size are
 * not stored because the table has no columns for them.
 */

function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

/**
 * Whether a combo can be bought, and why not. A combo is purchasable only when it is active,
 * has a price, has stock, has at least one product, and every product still exists and is
 * active. (Visitors can only read active products, so a deactivated product shows as missing.)
 * Checkout re-checks this in the app; definitive enforcement is in place_order once
 * supabase/new-project/08_checkout_hardening.sql is applied.
 */
export function getComboAvailability(combo) {
  const items = combo?.items || [];
  const unavailableItems = items.filter((i) => !i.product_active).map((i) => i.product_name);
  let reason = null;
  if (combo?.is_active === false) reason = 'inactive';
  else if (!(Number(combo?.combo_price) > 0)) reason = 'no_price';
  else if (items.length === 0) reason = 'no_items';
  else if (unavailableItems.length > 0) reason = 'unavailable_items';
  else if (!(Number(combo?.stock_quantity) > 0)) reason = 'out_of_stock';

  const messages = {
    inactive: 'This combo is not active.',
    no_price: 'This combo has no price.',
    no_items: 'This combo has no products.',
    unavailable_items: `Contains unavailable product${unavailableItems.length > 1 ? 's' : ''}: ${unavailableItems.join(', ')}.`,
    out_of_stock: 'This combo is out of stock.',
  };
  return {
    purchasable: reason === null,
    reason,
    message: reason ? messages[reason] : '',
    unavailableItems,
  };
}

/** True for a combo as returned by getCombos / getComboById (not a product or a bag line). */
export function isComboRecord(item) {
  return Boolean(item) && item.combo_price !== undefined && Array.isArray(item.items);
}

/**
 * The bag product and its single "variant" for a combo, in the shape CartContext.addToCart
 * expects. Used by every place a combo can be added (homepage section, quick view, wishlist).
 */
export function toComboCartProduct(combo) {
  const price = Number(combo.combo_price) || 0;
  const original = Number(combo.original_price) || 0;
  const image = combo.image_url || combo.image || '';
  return {
    product: {
      id: combo.id,
      name: combo.name,
      price,
      compare_at_price: original > price ? original : null,
      image,
      main_image: image,
      category: 'Combo Pack',
      slug: combo.slug,
      // Used by the bag to cap quantities and refuse unavailable combos
      stock_quantity: Number(combo.stock_quantity) || 0,
      is_purchasable: Boolean(combo.is_purchasable),
    },
    variant: {
      id: `combo-var-${combo.id}`,
      bottle_type: 'Combo Collection',
      size_ml: 'Complete Set',
      price,
    },
  };
}

function formatCombo(row, items, productMap) {
  const price = Number(row.price) || 0;
  const sale = row.sale_price !== null && row.sale_price !== undefined ? Number(row.sale_price) : null;
  const hasSale = sale !== null && sale > 0 && sale < price;
  const comboPrice = hasSale ? sale : price;
  const originalPrice = hasSale ? price : null;

  const combo = {
    ...row,
    image_url: row.image_url ? getPublicImageUrl(row.image_url) : '',
    image_path: row.image_path || '',
    combo_price: comboPrice,
    original_price: originalPrice,
    discount: originalPrice ? Math.round(((originalPrice - comboPrice) / originalPrice) * 100) : null,
    stock: Number(row.stock_quantity) || 0,
    stock_quantity: Number(row.stock_quantity) || 0,
    featured: Boolean(row.is_featured),
    is_featured: Boolean(row.is_featured),
    is_active: row.is_active !== false,
    items: items.map((it) => {
      const p = productMap.get(it.product_id);
      return {
        id: it.id,
        product_id: it.product_id,
        quantity: Number(it.quantity) || 1,
        product_name: p?.name || 'Product unavailable',
        image: p?.image || '',
        product_active: Boolean(p?.is_active),
      };
    }),
  };
  const availability = getComboAvailability(combo);
  return {
    ...combo,
    is_purchasable: availability.purchasable,
    unavailable_reason: availability.reason,
    unavailable_message: availability.message,
  };
}

async function attachItems(rows) {
  if (rows.length === 0) return [];
  const comboIds = rows.map((r) => r.id);
  const { data: items, error: itemErr } = await supabase
    .from('combo_items')
    .select('id, combo_id, product_id, quantity, created_at')
    .in('combo_id', comboIds)
    .order('created_at', { ascending: true });
  if (itemErr) throw dbError('Could not load combo items', itemErr);

  const productIds = [...new Set((items || []).map((i) => i.product_id).filter(Boolean))];
  const productMap = new Map();
  if (productIds.length > 0) {
    const { data: prods, error: prodErr } = await supabase
      .from('products')
      .select('id, name, main_image_url, is_active')
      .in('id', productIds);
    if (prodErr) throw dbError('Could not load combo products', prodErr);
    (prods || []).forEach((p) =>
      productMap.set(p.id, { ...p, image: p.main_image_url ? getPublicImageUrl(p.main_image_url) : '' })
    );
  }

  return rows.map((row) =>
    formatCombo(row, (items || []).filter((i) => i.combo_id === row.id), productMap)
  );
}

export async function getCombos(options = {}) {
  const { featured, activeOnly = true } = options;
  let query = supabase.from('combos').select('*').order('display_order', { ascending: true });
  if (activeOnly) query = query.eq('is_active', true);
  if (featured !== undefined) query = query.eq('is_featured', Boolean(featured));

  const { data, error } = await query;
  if (error) throw dbError('Could not load combos', error);
  return attachItems(data || []);
}

export async function getComboBySlug(slugOrId) {
  const column = isValidUUID(slugOrId) ? 'id' : 'slug';
  const { data, error } = await supabase.from('combos').select('*').eq(column, slugOrId).maybeSingle();
  if (error) throw dbError('Could not load combo', error);
  if (!data) return null;
  const [combo] = await attachItems([data]);
  return combo;
}

export async function getComboById(id) {
  return getComboBySlug(id);
}

/** Convert the admin form (combo_price / original_price) to the live price columns. */
function toComboRow(comboData) {
  const row = {};
  if (comboData.name !== undefined) row.name = comboData.name.trim();
  if (comboData.slug !== undefined || comboData.name !== undefined) {
    row.slug = comboData.slug || slugify(comboData.name);
  }
  if (comboData.description !== undefined) row.description = comboData.description || '';
  if (comboData.image_url !== undefined) row.image_url = comboData.image_url || null;
  if (comboData.image_path !== undefined) row.image_path = comboData.image_path || null;

  if (comboData.combo_price !== undefined || comboData.original_price !== undefined) {
    const comboPrice = Number(comboData.combo_price) || 0;
    const original = Number(comboData.original_price) || 0;
    if (original > comboPrice) {
      row.price = original;
      row.sale_price = comboPrice;
    } else {
      row.price = comboPrice;
      row.sale_price = null;
    }
  }
  if (comboData.stock !== undefined) row.stock_quantity = Math.max(0, Number(comboData.stock) || 0);
  if (comboData.featured !== undefined) row.is_featured = Boolean(comboData.featured);
  if (comboData.is_active !== undefined) row.is_active = Boolean(comboData.is_active);
  else if (comboData.active !== undefined) row.is_active = Boolean(comboData.active);
  if (comboData.display_order !== undefined) row.display_order = Number(comboData.display_order) || 0;
  return row;
}

function validateItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('Add at least one product to the combo.');
  }
  const bad = items.find((it) => !isValidUUID(it.product_id));
  if (bad) {
    throw new Error(`"${bad.product_name || 'An item'}" is not a database product. Remove it and add it again.`);
  }
}

function toItemRows(comboId, items) {
  return items.map((it) => ({
    combo_id: comboId,
    product_id: it.product_id,
    quantity: Math.max(1, Number(it.quantity) || 1),
  }));
}

export async function createCombo(comboData) {
  const row = toComboRow(comboData);
  if (!row.name) throw new Error('Combo name is required.');
  if (!row.image_url) throw new Error('A combo image is required.');
  // The combo (selling) price itself must be set; an original price alone would show as ₹0
  if (!(Number(comboData.combo_price ?? row.price) > 0)) throw new Error('Combo price must be greater than 0.');
  validateItems(comboData.items);

  const { data, error } = await supabase
    .from('combos')
    .insert([{ is_active: true, display_order: 0, ...row }])
    .select()
    .single();
  if (error || !data) throw dbError('Combo was not created', error);

  const itemRows = toItemRows(data.id, comboData.items);
  const { data: inserted, error: itemErr } = await supabase.from('combo_items').insert(itemRows).select('id');
  if (itemErr || (inserted || []).length !== itemRows.length) {
    const { error: cleanupErr } = await supabase.from('combos').delete().eq('id', data.id);
    throw new Error(
      `Combo items were not saved, so the combo was not created: ${itemErr?.message || 'items not returned'}` +
        (cleanupErr ? `. Cleanup failed (${cleanupErr.message}); delete combo "${data.name}" manually.` : '')
    );
  }

  return getComboById(data.id);
}

export async function updateCombo(id, updates) {
  if (!isValidUUID(id)) throw new Error('This combo is not a database record. Reload the page.');

  const row = toComboRow(updates);
  if (
    (row.price !== undefined && !(Number(row.price) > 0)) ||
    (updates.combo_price !== undefined && !(Number(updates.combo_price) > 0))
  ) {
    throw new Error('Combo price must be greater than 0.');
  }
  const { data, error } = await supabase
    .from('combos')
    .update({ ...row, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('id');
  if (error) throw dbError('Combo was not updated', error);
  assertRows(data, 'Combo was not updated');

  if (Array.isArray(updates.items)) {
    validateItems(updates.items);
    const { data: oldItems, error: oldErr } = await supabase.from('combo_items').select('id').eq('combo_id', id);
    if (oldErr) throw dbError('Could not read existing combo items', oldErr);

    // Insert the new list first so a failure never leaves the combo empty
    const { data: inserted, error: insErr } = await supabase
      .from('combo_items')
      .insert(toItemRows(id, updates.items))
      .select('id');
    if (insErr || (inserted || []).length !== updates.items.length) {
      throw dbError('Combo items were not updated', insErr || { message: 'items not returned' });
    }

    const oldIds = (oldItems || []).map((i) => i.id);
    if (oldIds.length > 0) {
      const { error: delErr } = await supabase.from('combo_items').delete().in('id', oldIds);
      if (delErr) {
        // Roll back the new rows so the combo keeps its previous contents
        await supabase.from('combo_items').delete().in('id', inserted.map((i) => i.id));
        throw dbError('Old combo items could not be replaced', delErr);
      }
    }
  }

  return getComboById(id);
}

export async function deleteCombo(id) {
  if (!isValidUUID(id)) throw new Error('This combo is not a database record. Reload the page.');

  // Try the combo first: if the foreign key cascades, items go with it; if not (23503),
  // remove the items and retry. Items are never removed when the combo itself cannot be.
  let { data, error } = await supabase.from('combos').delete().eq('id', id).select('id');
  if (error && error.code === '23503') {
    const { error: itemErr } = await supabase.from('combo_items').delete().eq('combo_id', id);
    if (itemErr) throw dbError('Combo items were not deleted', itemErr);
    ({ data, error } = await supabase.from('combos').delete().eq('id', id).select('id'));
  }
  if (error) throw dbError('Combo was not deleted', error);
  assertRows(data, 'Combo was not deleted');
  return true;
}
