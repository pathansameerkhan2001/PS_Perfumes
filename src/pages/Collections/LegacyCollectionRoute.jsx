import React, { Suspense, lazy, useEffect, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { getStorefrontCategoryTree } from '../../services/categories';
import { collectionPath } from '../../utils/useStorefrontCategories';

const CollectionPage = lazy(() => import('../Collection/CollectionPage'));

// Fragrance families retired by Migration 12 and where their products went: [main, subcategory]
const RETIRED_FAMILIES = {
  perfume: ['perfumes'],
  attar: ['attars'],
  woody: ['attars'],
  musky: ['attars', 'musk-attars'],
  oud: ['attars', 'oud-attars'],
  floral: ['attars', 'floral-attars'],
};

/** Path in Shop by Category for an old collection slug, or null when it has none. */
function findCollectionTarget(mains, slug) {
  for (const main of mains) {
    if (main.slug.toLowerCase() === slug) return collectionPath(main.slug);
    const sub = main.children.find((c) => c.slug.toLowerCase() === slug);
    if (sub) return collectionPath(main.slug, sub.slug);
  }
  const retired = RETIRED_FAMILIES[slug];
  if (!retired) return null;
  const main = mains.find((m) => m.slug === retired[0]);
  if (!main) return '/collections';
  return collectionPath(main.slug, main.children.some((c) => c.slug === retired[1]) ? retired[1] : undefined);
}

const Placeholder = () => <div style={{ minHeight: '60vh' }} aria-busy="true" />;

/*
 * The old collection URLs (/attar … /woody, /category/<slug>). Once categories have
 * subcategories (Migration 12) they redirect to Shop by Category, so links and bookmarks keep
 * working. Before that, and for any category the new page does not cover, the original
 * collection page is shown unchanged.
 */
export default function LegacyCollectionRoute({ category }) {
  const { slug: routeSlug } = useParams();
  const slug = String(category || routeSlug || '').toLowerCase();
  const [tree, setTree] = useState(null);

  useEffect(() => {
    let active = true;
    getStorefrontCategoryTree()
      .then((t) => active && setTree(t))
      // The original page has its own error handling
      .catch(() => active && setTree({ hasTree: false, mains: [] }));
    return () => {
      active = false;
    };
  }, []);

  if (!tree) return <Placeholder />;
  const target = tree.hasTree ? findCollectionTarget(tree.mains, slug) : null;
  if (target) return <Navigate to={target} replace />;

  return (
    <Suspense fallback={<Placeholder />}>
      <CollectionPage key={slug} category={slug} />
    </Suspense>
  );
}
