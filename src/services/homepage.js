import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { isValidUUID } from './products';
import { dbError, assertRows } from './dbErrors';


export const INITIAL_SECTIONS = [
  {
    id: 'sec-hero',
    section_key: 'hero',
    // Shown as the homepage hero heading / line / button (editable in Admin → Homepage)
    title: 'Discover the Art of Luxury Fragrance',
    subtitle: 'Attars, perfumes and bakhoor from PS PERFUMES, Kadapa.',
    cta_text: 'Shop the Collection',
    cta_link: '/shop',
    image_url: '/assets/hero-luxury-cinematic.png',
    secondary_image_url: '/assets/hero-slide2.webp',
    is_active: true,
    display_order: 1,
    metadata: {
      collection: 'ROYAL OUD & AMBER ESSENCE',
    },
  },
  {
    id: 'sec-trust',
    section_key: 'trust_strip',
    title: 'Trust & Excellence',
    subtitle: '100% Genuine, Handcrafted, Pan-India Dispatch',
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
    subtitle: 'Curated olfactive journeys from pure concentrated attars to artisanal modern parfums.',
    cta_text: 'EXPLORE ALL',
    cta_link: '/shop',
    image_url: '',
    is_active: true,
    display_order: 3,
    metadata: {},
  },
  {
    id: 'sec-new-arrivals',
    section_key: 'new_arrivals',
    title: 'New Creations',
    subtitle: 'Fresh extractions and limited artisanal drops just released from our blending atelier.',
    cta_text: 'VIEW ALL NEW',
    cta_link: '/shop?filter=new',
    image_url: '',
    is_active: true,
    display_order: 4,
    metadata: {},
  },
  {
    id: 'sec-bestsellers',
    section_key: 'bestsellers',
    title: 'Our Signature Bestsellers',
    subtitle: 'The timeless classics celebrated for their extraordinary longevity and sillage.',
    cta_text: 'SHOP SIGNATURES',
    cta_link: '/shop?filter=bestseller',
    image_url: '',
    is_active: true,
    display_order: 5,
    metadata: {},
  },
  {
    id: 'sec-editorial',
    section_key: 'editorial_feature',
    title: 'The Royal Amber Extract',
    subtitle: 'Matured for months in seasoned French oak barrels with warm benzoin and pure Cambodian oudh.',
    cta_text: 'DISCOVER ROYAL AMBER',
    cta_link: '/product/royal-amber-extreme',
    image_url: '/assets/prod-royal-amber.webp',
    is_active: true,
    display_order: 6,
    metadata: {
      notes: 'Amber, Cambodian Oud, Madagascar Vanilla',
    },
  },
  {
    id: 'sec-reels',
    section_key: 'instagram_reels',
    title: 'PS Perfumes on Instagram',
    subtitle: 'Follow our atelier journey, bottle pours, and scent discoveries @ps_perfumes_kadapa',
    cta_text: 'FOLLOW ON INSTAGRAM',
    cta_link: 'https://www.instagram.com/ps_perfumes_kadapa/?hl=en',
    image_url: '',
    is_active: true,
    display_order: 7,
    metadata: {},
  },
  {
    id: 'sec-story',
    section_key: 'our_story',
    title: 'Artisanal Perfumery Born in Kadapa',
    subtitle: 'Honoring ancient Indian distillation heritage while embracing modern luxury French perfumery aesthetics.',
    cta_text: 'READ OUR HERITAGE',
    cta_link: '/about',
    image_url: '/assets/hero-desktop.webp',
    is_active: true,
    display_order: 8,
    metadata: {},
  },
  {
    id: 'sec-newsletter',
    section_key: 'newsletter',
    title: 'Join the Connoisseurs Circle',
    subtitle: 'Receive exclusive private release invitations, olfactory masterclasses, and early access.',
    cta_text: 'SUBSCRIBE',
    cta_link: '',
    image_url: '',
    is_active: true,
    display_order: 9,
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
