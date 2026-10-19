import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { isValidUUID } from './products';
import { dbError, assertRows } from './dbErrors';
import heroLuxuryDesktop from '../assets/hero-luxury-cinematic.png';
import heroLuxuryMobile from '../assets/hero-luxury-cinematic-mobile.png';
import heroSlide2 from '../assets/hero-slide2.webp';
import heroSlide2Mobile from '../assets/hero-slide2-mobile.webp';
import promoBanner from '../assets/promo-banner.webp';
import promoBannerMobile from '../assets/promo-banner-mobile.webp';

const LOCAL_HERO_KEY = 'ps_db_hero_slides';

export const INITIAL_HERO_SLIDES = [
  {
    id: 'hero-1',
    desktop_image: heroLuxuryDesktop,
    mobile_image: heroLuxuryMobile,
    image_url: heroLuxuryDesktop,
    mobile_image_url: heroLuxuryMobile,
    eyebrow: 'ROYAL OUD ATELIER',
    subtitle: 'ROYAL OUD ATELIER',
    heading: 'Royal Oud & Amber Essence',
    title: 'Royal Oud & Amber Essence',
    description: 'Pure visual luxury campaign showcasing the bespoke flacons of PS PERFUMES.',
    cta_text: 'EXPLORE OUD',
    button_text: 'EXPLORE OUD',
    cta_link: '/category/oud',
    button_link: '/category/oud',
    display_order: 1,
    is_active: true,
  },
  {
    id: 'hero-2',
    desktop_image: heroSlide2,
    mobile_image: heroSlide2Mobile,
    image_url: heroSlide2,
    mobile_image_url: heroSlide2Mobile,
    eyebrow: 'ARTISANAL ATTARS',
    subtitle: 'ARTISANAL ATTARS',
    heading: 'Imperial Attar & Pure Extractions',
    title: 'Imperial Attar & Pure Extractions',
    description: 'Centuries-old steam distillation in pure sandalwood and amber bases.',
    cta_text: 'EXPLORE ATTAR',
    button_text: 'EXPLORE ATTAR',
    cta_link: '/category/attar',
    button_link: '/category/attar',
    display_order: 2,
    is_active: true,
  },
  {
    id: 'hero-3',
    desktop_image: promoBanner,
    mobile_image: promoBannerMobile,
    image_url: promoBanner,
    mobile_image_url: promoBannerMobile,
    eyebrow: 'SACRED INCENSE',
    subtitle: 'SACRED INCENSE',
    heading: 'Sacred Bakhoor & Dehn Al Oud',
    title: 'Sacred Bakhoor & Dehn Al Oud',
    description: 'Aromatic agarwood chips and royal dahn al oud resin infusions.',
    cta_text: 'EXPLORE BAKHOOR',
    button_text: 'EXPLORE BAKHOOR',
    cta_link: '/category/bakhoor',
    button_link: '/category/bakhoor',
    display_order: 3,
    is_active: true,
  },
];

function formatHeroSlide(row) {
  const desktop = row.image_url || row.desktop_image || '';
  const mobile = row.mobile_image_url || row.mobile_image || '';
  const title = row.title || row.heading || '';
  const subtitle = row.subtitle || row.eyebrow || '';
  const buttonText = row.button_text || row.cta_text || 'EXPLORE COLLECTION';
  const buttonLink = row.button_link || row.cta_link || '/category/oud';

  return {
    id: row.id,
    desktop_image: desktop,
    mobile_image: mobile,
    image_url: desktop,
    mobile_image_url: mobile,
    desktop_image_path: row.image_path || '',
    image_path: row.image_path || '',
    mobile_image_path: row.mobile_image_path || '',
    heading: title,
    title,
    eyebrow: subtitle,
    subtitle,
    description: row.description || '',
    cta_text: buttonText,
    button_text: buttonText,
    cta_link: buttonLink,
    button_link: buttonLink,
    display_order: Number(row.display_order) || 1,
    is_active: row.is_active !== false,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function getLocalHeroSlides() {
  try {
    const raw = localStorage.getItem(LOCAL_HERO_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map((s) => formatHeroSlide(s));
      }
    }
  } catch (e) {
    console.error('Error reading local hero slides', e);
  }

  const initial = INITIAL_HERO_SLIDES.map((s) => formatHeroSlide(s));
  try {
    localStorage.setItem(LOCAL_HERO_KEY, JSON.stringify(initial));
  } catch {}
  return initial;
}

function saveLocalHeroSlides(slides) {
  try {
    localStorage.setItem(LOCAL_HERO_KEY, JSON.stringify(slides));
  } catch (e) {
    console.error('Error saving local hero slides', e);
  }
}

export async function getHeroSlides(activeOnly = true) {
  if (isSupabaseConfigured && supabase) {
    let query = supabase.from('hero_slides').select('*').order('display_order', { ascending: true });
    if (activeOnly) {
      query = query.eq('is_active', true);
    }
    const { data, error } = await query;
    if (error) throw dbError('Could not load hero slides', error);
    // The database answered: show its real state, never demo slides
    return (data || []).map((row) => formatHeroSlide(row));
  }

  let list = getLocalHeroSlides();
  if (activeOnly) {
    list = list.filter((s) => s.is_active !== false);
  }
  return list;
}

function toHeroRow(slideData) {
  const row = {};
  if (slideData.heading !== undefined || slideData.title !== undefined) {
    row.title = slideData.heading ?? slideData.title ?? '';
  }
  if (slideData.eyebrow !== undefined || slideData.subtitle !== undefined) {
    row.subtitle = slideData.eyebrow ?? slideData.subtitle ?? '';
  }
  if (slideData.description !== undefined) row.description = slideData.description;
  if (slideData.cta_text !== undefined || slideData.button_text !== undefined) {
    row.button_text = slideData.cta_text ?? slideData.button_text ?? '';
  }
  if (slideData.cta_link !== undefined || slideData.button_link !== undefined) {
    row.button_link = slideData.cta_link ?? slideData.button_link ?? '';
  }
  if (slideData.desktop_image !== undefined || slideData.image_url !== undefined) {
    row.image_url = slideData.desktop_image ?? slideData.image_url ?? null;
  }
  if (slideData.desktop_image_path !== undefined || slideData.image_path !== undefined) {
    row.image_path = slideData.desktop_image_path ?? slideData.image_path ?? null;
  }
  if (slideData.mobile_image !== undefined || slideData.mobile_image_url !== undefined) {
    row.mobile_image_url = slideData.mobile_image || slideData.mobile_image_url || null;
  }
  if (slideData.mobile_image_path !== undefined) row.mobile_image_path = slideData.mobile_image_path || null;
  if (slideData.display_order !== undefined) row.display_order = Number(slideData.display_order) || 1;
  if (slideData.is_active !== undefined) row.is_active = Boolean(slideData.is_active);
  return row;
}

export async function createHeroSlide(slideData) {
  if (isSupabaseConfigured && supabase) {
    const dbPayload = {
      display_order: 1,
      is_active: true,
      ...toHeroRow(slideData),
    };
    if (!dbPayload.image_url) {
      throw new Error('Desktop media is required.');
    }
    const { data, error } = await supabase.from('hero_slides').insert([dbPayload]).select().single();
    if (error || !data) throw dbError('Hero slide was not created', error);
    return formatHeroSlide(data);
  }

  const newSlide = formatHeroSlide({
    id: `hero-${Date.now()}`,
    ...slideData,
    created_at: new Date().toISOString(),
  });
  const list = getLocalHeroSlides();
  list.push(newSlide);
  saveLocalHeroSlides(list);
  return newSlide;
}

export async function updateHeroSlide(id, updates) {
  if (isSupabaseConfigured && supabase) {
    if (!isValidUUID(id)) throw new Error('This hero slide is not a database record. Reload the page.');
    const dbUpdates = { ...toHeroRow(updates), updated_at: new Date().toISOString() };
    const { data, error } = await supabase.from('hero_slides').update(dbUpdates).eq('id', id).select();
    if (error) throw dbError('Hero slide was not updated', error);
    assertRows(data, 'Hero slide was not updated');
    return formatHeroSlide(data[0]);
  }

  const list = getLocalHeroSlides();
  const idx = list.findIndex((s) => s.id === id);
  if (idx > -1) {
    list[idx] = formatHeroSlide({ ...list[idx], ...updates });
    saveLocalHeroSlides(list);
    return list[idx];
  }
  return null;
}

export async function deleteHeroSlide(id) {
  if (isSupabaseConfigured && supabase) {
    if (!isValidUUID(id)) throw new Error('This hero slide is not a database record. Reload the page.');
    const { data, error } = await supabase.from('hero_slides').delete().eq('id', id).select('id');
    if (error) throw dbError('Hero slide was not deleted', error);
    assertRows(data, 'Hero slide was not deleted');
    return true;
  }

  const list = getLocalHeroSlides();
  saveLocalHeroSlides(list.filter((s) => s.id !== id));
  return true;
}
