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
 * shop filter.
 *
 * - Active main categories from the database (categories table), in display_order, without the
 *   ones that are never main shopping categories (NOT_MAIN_CATEGORY_SLUGS: combo packs, creams).
 * - Each links to /collections/<slug> (all its products, its subcategories as filter pills) and
 *   carries its subcategories (children) for the header dropdown and the mobile menu. Before
 *   Migration 12 there is no categories.parent_id, so there are no subcategories.
 * - Inactive categories are not listed (the database only returns active ones to visitors).
 * - Nothing is invented: while loading, or if the database cannot be read, the list is empty.
 * One request per page load, shared by every component that uses the hook; later pages get the
 * resolved list on their first render.
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

/** Combo sets: their own collection (combos table, homepage combo section), never a main category. */
export const COMBO_NAV_ITEM = { name: 'Combo Packs', path: '/#combo-pack' };

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

function toEntry({ id, slug, name, imageUrl, children = [] }) {
  const clean = String(slug || '').toLowerCase().trim();
  const builtIn = BUILT_IN_BY_SLUG.get(clean);
  // An admin-uploaded image (a real URL) wins; '/assets/…' placeholders from the old demo data do not
  const adminImage = imageUrl && /^https?:\/\//i.test(imageUrl) ? imageUrl : '';
  return {
    // Database id (absent for the built-in fallback list)
    id: id || null,
    slug: clean,
    name: name || builtIn?.name || clean,
    // The collection page: all products of the category, its subcategories as filter pills
    path: collectionPath(clean),
    image: adminImage || builtIn?.image || MAIN_CATEGORY_ART[clean] || '',
    isBuiltIn: Boolean(builtIn),
    // Subcategories (after Migration 12; none before), each linking to its filter on the collection page
    children: children.map((c) => ({ id: c.id, slug: c.slug, name: c.name, path: collectionPath(clean, c.slug) })),
  };
}

// No built-in category list: navigation shows only categories the database returns (an empty
// list while loading or if the database cannot be read, never a second, invented structure)
const EMPTY = [];

let cachedPromise = null;
let resolvedList = null;

function loadStorefrontCategories() {
  if (!cachedPromise) {
    cachedPromise = getStorefrontCategoryTree()
      .then(({ mains }) => {
        const seen = new Set();
        const list = mains
          .filter((r) => r.is_active !== false)
          .map((r) => toEntry({ id: r.id, slug: r.slug, name: r.name, imageUrl: r.image_url, children: r.children }))
          .filter((c) => (seen.has(c.slug) ? false : seen.add(c.slug)));
        resolvedList = list;
        return list;
      })
      .catch((err) => {
        console.warn('Could not load categories for navigation.', err?.message || err);
        // Allow a later page to try again
        cachedPromise = null;
        return EMPTY;
      });
  }
  return cachedPromise;
}

/** Returns the storefront's main categories (empty until the database has answered once). */
export function useStorefrontCategories() {
  const [categories, setCategories] = useState(() => resolvedList || EMPTY);
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
