/**
 * PS PERFUMES — Shared Site Configuration
 * Single source of truth for public site domain, branding, and contact details.
 */

export const SITE_CONFIG = {
  productionUrl: 'https://psperfumes.com',
  brandName: 'PS PERFUMES',
  tagline: 'Haute Parfumerie & Luxury Fragrances',
  description:
    'Artisanal Haute Parfumerie crafting Arabian-inspired scents, rare botanical attars, and pure aged oud formulations distilled for enduring luxury and regal elegance.',
  address: 'Kadapa, 516001',
  city: 'Kadapa',
  pincode: '516001',
  state: 'Andhra Pradesh',
  country: 'India',
  contactEmail: 'brandnix.in@gmail.com',
  phone: '+91 94949 51600',
  instagramUrl: 'https://www.instagram.com/ps_perfumes_kadapa/?hl=en',
  googleMapsUrl: 'https://share.google/b0yildKJKTaGc365J',
  whatsappUrl: 'https://wa.me/919494951600',
};

/**
 * Returns the resolved Live Website URL to open the storefront in a new tab.
 * 1. Reads from VITE_SITE_URL environment configuration.
 * 2. Checks custom store settings from localStorage cache if customized.
 * 3. Defaults to the verified production domain 'https://psperfumes.com'.
 */
export function getLiveWebsiteUrl() {
  const envUrl = import.meta.env.VITE_SITE_URL || import.meta.env.VITE_PUBLIC_SITE_URL;
  if (envUrl && typeof envUrl === 'string' && envUrl.trim().length > 0) {
    return envUrl.trim();
  }

  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem('ps_db_site_settings');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.website_url && typeof parsed.website_url === 'string' && parsed.website_url.trim().length > 0) {
          return parsed.website_url.trim();
        }
      }
    }
  } catch {}

  return 'https://psperfumes.com';
}
