import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { isValidUUID } from './products';
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
  const desktop = row.image_url || row.desktop_image || heroLuxuryDesktop;
  const mobile = row.mobile_image_url || row.mobile_image || row.image_url || heroLuxuryMobile;
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
    try {
      let query = supabase.from('hero_slides').select('*').order('display_order', { ascending: true });
      if (activeOnly) {
        query = query.eq('is_active', true);
      }
      const { data, error } = await query;
      if (!error && Array.isArray(data) && data.length > 0) {
        return data.map((row) => formatHeroSlide(row));
      }
    } catch (e) {
      console.warn('Supabase getHeroSlides error, fallback:', e);
    }
  }

  let list = getLocalHeroSlides();
  if (activeOnly) {
    list = list.filter((s) => s.is_active !== false);
  }
  return list;
}

export async function createHeroSlide(slideData) {
  let createdRecord = null;

  if (isSupabaseConfigured && supabase) {
    try {
      // Map to exact live columns in Supabase
      const dbPayload = {
        title: slideData.heading || slideData.title || 'Haute Parfumerie',
        subtitle: slideData.eyebrow || slideData.subtitle || 'ROYAL OUD ATELIER',
        description: slideData.description || '',
        button_text: slideData.cta_text || slideData.button_text || 'EXPLORE COLLECTION',
        button_link: slideData.cta_link || slideData.button_link || '/category/oud',
        image_url: slideData.desktop_image || slideData.image_url || '/assets/hero-luxury-cinematic.png',
        image_path: slideData.image_path || null,
        mobile_image_url: slideData.mobile_image || slideData.mobile_image_url || null,
        mobile_image_path: slideData.mobile_image_path || null,
        display_order: Number(slideData.display_order) || 1,
        is_active: slideData.is_active !== undefined ? Boolean(slideData.is_active) : true,
      };

      const { data, error } = await supabase.from('hero_slides').insert([dbPayload]).select().single();
      if (!error && data) {
        createdRecord = formatHeroSlide(data);
        const list = getLocalHeroSlides();
        saveLocalHeroSlides([...list, createdRecord]);
        return createdRecord;
      } else if (error) {
        console.error('Supabase createHeroSlide error:', error.message);
        throw new Error(error.message);
      }
    } catch (e) {
      console.error('Supabase createHeroSlide exception:', e);
      throw e;
    }
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
  if (isSupabaseConfigured && supabase && isValidUUID(id)) {
    try {
      const dbUpdates = {};
      if (updates.heading !== undefined || updates.title !== undefined) {
        dbUpdates.title = updates.heading || updates.title;
      }
      if (updates.eyebrow !== undefined || updates.subtitle !== undefined) {
        dbUpdates.subtitle = updates.eyebrow || updates.subtitle;
      }
      if (updates.description !== undefined) {
        dbUpdates.description = updates.description;
      }
      if (updates.cta_text !== undefined || updates.button_text !== undefined) {
        dbUpdates.button_text = updates.cta_text || updates.button_text;
      }
      if (updates.cta_link !== undefined || updates.button_link !== undefined) {
        dbUpdates.button_link = updates.cta_link || updates.button_link;
      }
      if (updates.desktop_image !== undefined || updates.image_url !== undefined) {
        dbUpdates.image_url = updates.desktop_image || updates.image_url;
      }
      if (updates.mobile_image !== undefined || updates.mobile_image_url !== undefined) {
        dbUpdates.mobile_image_url = updates.mobile_image || updates.mobile_image_url;
      }
      if (updates.display_order !== undefined) {
        dbUpdates.display_order = Number(updates.display_order);
      }
      if (updates.is_active !== undefined) {
        dbUpdates.is_active = Boolean(updates.is_active);
      }
      dbUpdates.updated_at = new Date().toISOString();

      const { data, error } = await supabase.from('hero_slides').update(dbUpdates).eq('id', id).select().single();
      if (!error && data) {
        const formatted = formatHeroSlide(data);
        const list = getLocalHeroSlides();
        const next = list.map((s) => (s.id === id ? formatted : s));
        saveLocalHeroSlides(next);
        return formatted;
      }
      if (error) {
        throw new Error(error.message);
      }
    } catch (e) {
      console.error('Supabase updateHeroSlide error:', e);
      throw e;
    }
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
  if (isSupabaseConfigured && supabase && isValidUUID(id)) {
    try {
      const { error } = await supabase.from('hero_slides').delete().eq('id', id);
      if (error) {
        throw new Error(error.message);
      }
    } catch (e) {
      console.error('Supabase deleteHeroSlide error:', e);
      throw e;
    }
  }

  const list = getLocalHeroSlides();
  const filtered = list.filter((s) => s.id !== id);
  saveLocalHeroSlides(filtered);
  return true;
}
