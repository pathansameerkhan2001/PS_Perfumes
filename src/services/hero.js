import { supabase, isSupabaseConfigured } from '../lib/supabase';
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
    eyebrow: 'ROYAL OUD ATELIER',
    heading: 'Royal Oud & Amber Essence',
    description: 'Pure visual luxury campaign showcasing the bespoke flacons of PS PERFUMES.',
    cta_text: 'EXPLORE OUD',
    cta_link: '/category/oud',
    display_order: 1,
    is_active: true,
  },
  {
    id: 'hero-2',
    desktop_image: heroSlide2,
    mobile_image: heroSlide2Mobile,
    eyebrow: 'ARTISANAL ATTARS',
    heading: 'Imperial Attar & Pure Extractions',
    description: 'Centuries-old steam distillation in pure sandalwood and amber bases.',
    cta_text: 'EXPLORE ATTAR',
    cta_link: '/category/attar',
    display_order: 2,
    is_active: true,
  },
  {
    id: 'hero-3',
    desktop_image: promoBanner,
    mobile_image: promoBannerMobile,
    eyebrow: 'SACRED INCENSE',
    heading: 'Sacred Bakhoor & Dehn Al Oud',
    description: 'Aromatic agarwood chips and royal dahn al oud resin infusions.',
    cta_text: 'EXPLORE BAKHOOR',
    cta_link: '/category/bakhoor',
    display_order: 3,
    is_active: true,
  },
];

function getLocalHeroSlides() {
  try {
    const raw = localStorage.getItem(LOCAL_HERO_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (e) {
    console.error('Error reading local hero slides', e);
  }
  try {
    localStorage.setItem(LOCAL_HERO_KEY, JSON.stringify(INITIAL_HERO_SLIDES));
  } catch {}
  return INITIAL_HERO_SLIDES;
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
      if (activeOnly) query = query.eq('is_active', true);
      const { data, error } = await query;
      if (!error && Array.isArray(data) && data.length > 0) {
        return data;
      }
    } catch (e) {
      console.warn('Supabase getHeroSlides error, fallback:', e);
    }
  }

  let list = getLocalHeroSlides();
  if (activeOnly) list = list.filter((s) => s.is_active !== false);
  return list;
}

export async function createHeroSlide(slideData) {
  const newSlide = {
    id: `hero-${Date.now()}`,
    ...slideData,
    created_at: new Date().toISOString(),
  };

  if (isSupabaseConfigured && supabase) {
    try {
      await supabase.from('hero_slides').insert([newSlide]);
    } catch (e) {
      console.warn('Supabase createHeroSlide error:', e);
    }
  }

  const list = getLocalHeroSlides();
  list.push(newSlide);
  saveLocalHeroSlides(list);
  return newSlide;
}

export async function updateHeroSlide(id, updates) {
  if (isSupabaseConfigured && supabase) {
    try {
      await supabase.from('hero_slides').update(updates).eq('id', id);
    } catch (e) {
      console.warn('Supabase updateHeroSlide error:', e);
    }
  }

  const list = getLocalHeroSlides();
  const idx = list.findIndex((s) => s.id === id);
  if (idx > -1) {
    list[idx] = { ...list[idx], ...updates };
    saveLocalHeroSlides(list);
    return list[idx];
  }
  return null;
}

export async function deleteHeroSlide(id) {
  if (isSupabaseConfigured && supabase) {
    try {
      await supabase.from('hero_slides').delete().eq('id', id);
    } catch (e) {
      console.warn('Supabase deleteHeroSlide error:', e);
    }
  }

  const list = getLocalHeroSlides();
  const filtered = list.filter((s) => s.id !== id);
  saveLocalHeroSlides(filtered);
  return true;
}
