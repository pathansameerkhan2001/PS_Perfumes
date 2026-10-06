import { supabase, isSupabaseConfigured } from '../lib/supabase';

const LOCAL_SECTIONS_KEY = 'ps_db_homepage_sections';

export const INITIAL_SECTIONS = [
  {
    id: 'sec-hero',
    section_key: 'hero',
    title: 'ROYAL OUD & AMBER ESSENCE',
    subtitle: 'Pure visual luxury campaign showcasing the bespoke flacons of PS PERFUMES.',
    cta_text: '',
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

function getLocalSections() {
  try {
    const raw = localStorage.getItem(LOCAL_SECTIONS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}
  return INITIAL_SECTIONS;
}

function saveLocalSections(sections) {
  try {
    localStorage.setItem(LOCAL_SECTIONS_KEY, JSON.stringify(sections));
  } catch {}
}

export async function getHomepageSections() {
  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase
        .from('homepage_sections')
        .select('*')
        .order('display_order', { ascending: true });
      if (!error && data && data.length > 0) return data;
    } catch {}
  }
  return getLocalSections();
}

export async function updateHomepageSection(id, updates) {
  const list = getLocalSections();
  const updatedList = list.map((sec) => (sec.id === id || sec.section_key === id ? { ...sec, ...updates } : sec));

  if (isSupabaseConfigured && supabase) {
    try {
      await supabase.from('homepage_sections').update(updates).or(`id.eq.${id},section_key.eq.${id}`);
    } catch {}
  }

  saveLocalSections(updatedList);
  return { success: true, data: updatedList.find((s) => s.id === id || s.section_key === id) };
}

export async function reorderSections(orderedIds) {
  const list = getLocalSections();
  const reordered = orderedIds.map((id, index) => {
    const item = list.find((s) => s.id === id || s.section_key === id) || {};
    return { ...item, display_order: index + 1 };
  });

  if (isSupabaseConfigured && supabase) {
    try {
      for (const item of reordered) {
        if (item.id) {
          await supabase.from('homepage_sections').update({ display_order: item.display_order }).eq('id', item.id);
        }
      }
    } catch {}
  }

  saveLocalSections(reordered);
  return { success: true, data: reordered };
}
