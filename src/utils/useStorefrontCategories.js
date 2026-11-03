import { useEffect, useState } from 'react';
import { getStorefrontCategoryTree } from '../services/categories';
import attarArt from '../assets/categories/fragrance-attar.webp';
import perfumeArt from '../assets/categories/fragrance-perfume.webp';
import bakhoorArt from '../assets/categories/fragrance-bakhoor.webp';
import muskyArt from '../assets/categories/fragrance-musky.webp';
import oudArt from '../assets/categories/fragrance-oud.webp';
import floralArt from '../assets/categories/fragrance-floral.webp';
import woodyArt from '../assets/categories/fragrance-woody.webp';

/*
 * One shared source for the storefront's category links: header, mobile menu, footer and the
 * homepage family row.
 *
 * - Active categories from the database (categories table), in display_order.
 * - The seven built-in fragrance families keep their artwork, accent colours (.ps-family-<slug>
 *   in index.css) and short routes (/attar … /woody).
 * - Any other category gets a neutral style and the /category/<slug> route.
 * - Inactive categories are not listed (the database only returns active ones to visitors).
 * - After Migration 12 (categories.parent_id) only main categories are listed, each linking to
 *   /collections/<slug>, where its subcategories are offered as filters.
 * - If the database cannot be read, or has no categories yet, the seven built-in families
 *   are used so navigation never disappears.
 * One request per page load, shared by every component that uses the hook.
 */

export const BUILT_IN_FAMILIES = [
  { slug: 'attar', name: 'Attar', image: attarArt },
  { slug: 'perfume', name: 'Perfume', image: perfumeArt },
  { slug: 'bakhoor', name: 'Bakhoor', image: bakhoorArt },
  { slug: 'musky', name: 'Musky', image: muskyArt },
  { slug: 'oud', name: 'Oud', image: oudArt },
  { slug: 'floral', name: 'Floral', image: floralArt },
  { slug: 'woody', name: 'Woody', image: woodyArt },
];

const BUILT_IN_BY_SLUG = new Map(BUILT_IN_FAMILIES.map((f) => [f.slug, f]));

// Artwork for the main categories of Migration 12 until an admin uploads an image
const MAIN_CATEGORY_ART = { perfumes: perfumeArt, attars: attarArt, 'home-fragrance': bakhoorArt };

/** Storefront path of a main category once categories have subcategories. */
export function collectionPath(mainSlug, subSlug) {
  const base = `/collections/${encodeURIComponent(String(mainSlug || '').toLowerCase())}`;
  return subSlug ? `${base}?sub=${encodeURIComponent(subSlug)}` : base;
}

/** Storefront path for a category slug (built-in families keep their short URLs). */
export function categoryPath(slug) {
  const clean = String(slug || '').toLowerCase();
  return BUILT_IN_BY_SLUG.has(clean) ? `/${clean}` : `/category/${encodeURIComponent(clean)}`;
}

function toEntry({ slug, name, imageUrl }, hasTree = false) {
  const clean = String(slug || '').toLowerCase().trim();
  const builtIn = BUILT_IN_BY_SLUG.get(clean);
  // An admin-uploaded image (a real URL) wins; '/assets/…' placeholders from the old demo data do not
  const adminImage = imageUrl && /^https?:\/\//i.test(imageUrl) ? imageUrl : '';
  return {
    slug: clean,
    name: name || builtIn?.name || clean,
    path: hasTree ? collectionPath(clean) : categoryPath(clean),
    image: adminImage || builtIn?.image || MAIN_CATEGORY_ART[clean] || '',
    isBuiltIn: Boolean(builtIn),
  };
}

const FALLBACK = BUILT_IN_FAMILIES.map((f) => toEntry({ slug: f.slug, name: f.name }));

let cachedPromise = null;

function loadStorefrontCategories() {
  if (!cachedPromise) {
    cachedPromise = getStorefrontCategoryTree()
      .then(({ hasTree, mains }) => {
        const seen = new Set();
        const list = mains
          .filter((r) => r.is_active !== false)
          .map((r) => toEntry({ slug: r.slug, name: r.name, imageUrl: r.image_url }, hasTree))
          .filter((c) => (seen.has(c.slug) ? false : seen.add(c.slug)));
        return list.length > 0 ? list : FALLBACK;
      })
      .catch((err) => {
        console.warn('Could not load categories; using the built-in fragrance families.', err?.message || err);
        // Allow a later page to try again
        cachedPromise = null;
        return FALLBACK;
      });
  }
  return cachedPromise;
}

/** Returns the storefront categories (starts with the built-in seven, then the database list). */
export function useStorefrontCategories() {
  const [categories, setCategories] = useState(FALLBACK);
  useEffect(() => {
    let active = true;
    loadStorefrontCategories().then((list) => {
      if (active) setCategories(list);
    });
    return () => {
      active = false;
    };
  }, []);
  return categories;
}
