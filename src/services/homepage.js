import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { isValidUUID } from './products';
import { dbError, assertRows } from './dbErrors';


// Section keys the storefront can actually render (pages/Home/HomePage.jsx renderSection).
// Saved rows with other keys (e.g. editorial_feature, our_story, newsletter from an earlier
// layout) are kept in the database but shown as "Not shown on storefront" in the admin.
export const SUPPORTED_SECTION_KEYS = [
  'hero',
  'trust_strip',
  'fragrance_categories',
  'new_arrivals',
  'featured_products',
  'bestsellers',
  'combos',
  'combo_pack',
  'instagram_reels',
  'reviews',
];

export function isSupportedSectionKey(key) {
  return SUPPORTED_SECTION_KEYS.includes(String(key || ''));
}

/*
 * Built-in homepage layout: only sections with a storefront implementation.
 * Titles/subtitles are the defaults shown on the homepage until an admin edits them.
 * Copy is deliberately plain — no product, ingredient or history claims.
 * The hero is video-only: its title is only the admin label (never shown on the site).
 */
export const INITIAL_SECTIONS = [
  {
    id: 'sec-hero',
    section_key: 'hero',
    title: 'Cinematic hero film',
    subtitle: '',
    cta_text: '',
    cta_link: '',
    image_url: '',
    is_active: true,
    display_order: 1,
    metadata: {},
  },
  {
    id: 'sec-trust',
    section_key: 'trust_strip',
    title: 'Trust & Excellence',
    subtitle: '',
    cta_text: '',
    cta_link: '',
    image_url: '',
    is_active: true,
    display_order: 2,
    metadata: {},
  },
  {
    id: 'sec-fragrance-family',
    section_key: 'fragrance_categories',
    title: 'Shop by Fragrance',
    subtitle: '',
    cta_text: 'VIEW ALL',
    cta_link: '/shop',
    image_url: '',
    is_active: true,
    display_order: 3,
    metadata: {},
  },
  {
    id: 'sec-new-arrivals',
    section_key: 'new_arrivals',
    title: 'New Arrivals',
    subtitle: 'The latest additions to our collection.',
    cta_text: '',
    cta_link: '',
    image_url: '',
    is_active: true,
    display_order: 4,
    metadata: {},
  },
  {
    id: 'sec-bestsellers',
    section_key: 'bestsellers',
    title: 'Best Sellers',
    subtitle: '',
    cta_text: '',
    cta_link: '',
    image_url: '',
    is_active: true,
    display_order: 5,
    metadata: {},
  },
  {
    id: 'sec-combos',
    section_key: 'combos',
    title: 'Combo Packs',
    subtitle: 'Curated sets from our collection.',
    cta_text: '',
    cta_link: '',
    image_url: '',
    is_active: true,
    display_order: 6,
    metadata: {},
  },
  {
    id: 'sec-reels',
    section_key: 'instagram_reels',
    title: 'PS Perfumes on Instagram',
    subtitle: 'Follow us @ps_perfumes_kadapa',
    cta_text: 'FOLLOW ON INSTAGRAM',
    cta_link: 'https://www.instagram.com/ps_perfumes_kadapa/?hl=en',
    image_url: '',
    is_active: true,
    display_order: 7,
    metadata: {},
  },
  {
    id: 'sec-reviews',
    section_key: 'reviews',
    title: 'Customer Reviews',
    subtitle: '',
    cta_text: '',
    cta_link: '',
    image_url: '',
    is_active: true,
    display_order: 8,
    metadata: {},
  },
];

/*
 * Live schema (verified 2026-10-19):
 *   homepage_sections (id, section_key, title, subtitle, description, image_url, image_path,
 *                      button_text, button_link, is_active, display_order, settings,
 *                      created_at, updated_at)
 * INITIAL_SECTIONS above is the built-in homepage layout. It is used only while the table
 * has no rows (flagged with _default: true) and can be written to the database explicitly
 * from Admin → Homepage with initializeHomepageSections().
 */

function formatSection(row) {
  return {
    ...row,
    cta_text: row.button_text ?? row.cta_text ?? '',
    cta_link: row.button_link ?? row.cta_link ?? '',
    metadata: row.settings ?? row.metadata ?? {},
  };
}

export async function getHomepageSections() {
  if (!isSupabaseConfigured || !supabase) {
    return INITIAL_SECTIONS.map((s) => ({ ...s, _default: true }));
  }
  const { data, error } = await supabase
    .from('homepage_sections')
    .select('*')
    .order('display_order', { ascending: true });
  if (error) throw dbError('Could not load homepage sections', error);
  if (!data || data.length === 0) {
    return INITIAL_SECTIONS.map((s) => ({ ...s, _default: true }));
  }
  return data.map(formatSection);
}

/** Writes the built-in layout to the database (only when the table is empty). */
export async function initializeHomepageSections() {
  const { count, error: countErr } = await supabase
    .from('homepage_sections')
    .select('id', { count: 'exact', head: true });
  if (countErr) throw dbError('Could not check homepage sections', countErr);
  if (count && count > 0) throw new Error('Homepage sections already exist in the database. Reload the page.');

  const rows = INITIAL_SECTIONS.map((s) => ({
    section_key: s.section_key,
    title: s.title || '',
    subtitle: s.subtitle || '',
    button_text: s.cta_text || null,
    button_link: s.cta_link || null,
    is_active: s.is_active !== false,
    display_order: s.display_order,
    settings: s.metadata || {},
  }));
  const { data, error } = await supabase.from('homepage_sections').insert(rows).select();
  if (error) throw dbError('Homepage sections were not saved', error);
  if ((data || []).length !== rows.length) throw new Error('Not all homepage sections were saved (permission denied?).');
  return data.map(formatSection);
}

function toSectionRow(updates) {
  const row = {};
  if (updates.title !== undefined) row.title = updates.title;
  if (updates.subtitle !== undefined) row.subtitle = updates.subtitle;
  if (updates.description !== undefined) row.description = updates.description;
  if (updates.image_url !== undefined) row.image_url = updates.image_url;
  if (updates.image_path !== undefined) row.image_path = updates.image_path;
  if (updates.cta_text !== undefined || updates.button_text !== undefined) row.button_text = updates.button_text ?? updates.cta_text;
  if (updates.cta_link !== undefined || updates.button_link !== undefined) row.button_link = updates.button_link ?? updates.cta_link;
  if (updates.is_active !== undefined) row.is_active = Boolean(updates.is_active);
  if (updates.display_order !== undefined) row.display_order = Number(updates.display_order) || 0;
  if (updates.metadata !== undefined || updates.settings !== undefined) row.settings = updates.settings ?? updates.metadata;
  return row;
}

export async function updateHomepageSection(id, updates) {
  if (!isValidUUID(id)) {
    throw new Error('Homepage sections are not saved in the database yet. Use "Save layout to database" first.');
  }
  const { data, error } = await supabase
    .from('homepage_sections')
    .update({ ...toSectionRow(updates), updated_at: new Date().toISOString() })
    .eq('id', id)
    .select();
  if (error) throw dbError('Homepage section was not updated', error);
  assertRows(data, 'Homepage section was not updated');
  return { success: true, data: formatSection(data[0]) };
}

export async function reorderSections(orderedIds) {
  const results = [];
  for (let i = 0; i < orderedIds.length; i += 1) {
    const { data } = await updateHomepageSection(orderedIds[i], { display_order: i + 1 });
    results.push(data);
  }
  return { success: true, data: results };
}

/**
 * Adds the built-in sections that are missing from the database (matched by section_key).
 * Existing rows — their titles, visibility and order — are never changed. New rows are
 * appended after the current last position. Returns the inserted sections.
 */
export async function restoreMissingDefaultSections() {
  const { data: existing, error: readErr } = await supabase
    .from('homepage_sections')
    .select('section_key, display_order');
  if (readErr) throw dbError('Could not read homepage sections', readErr);

  const present = new Set((existing || []).map((r) => r.section_key));
  // combo_pack / featured_products are aliases of combos / new_arrivals: do not add both
  if (present.has('combo_pack')) present.add('combos');
  if (present.has('featured_products')) present.add('new_arrivals');

  const missing = INITIAL_SECTIONS.filter((s) => !present.has(s.section_key));
  if (missing.length === 0) return [];

  const lastOrder = Math.max(0, ...(existing || []).map((r) => Number(r.display_order) || 0));
  const rows = missing.map((s, i) => ({
    section_key: s.section_key,
    title: s.title || '',
    subtitle: s.subtitle || '',
    button_text: s.cta_text || null,
    button_link: s.cta_link || null,
    is_active: s.is_active !== false,
    display_order: lastOrder + i + 1,
    settings: s.metadata || {},
  }));
  const { data, error } = await supabase.from('homepage_sections').insert(rows).select();
  if (error) throw dbError('Missing sections were not added', error);
  if ((data || []).length !== rows.length) throw new Error('Not all missing sections were added (permission denied?).');
  return data.map(formatSection);
}
