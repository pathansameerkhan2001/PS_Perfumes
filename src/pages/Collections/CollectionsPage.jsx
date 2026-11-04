import React, { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Filter, RotateCcw } from 'lucide-react';
import CollectionProductCard from '../../components/collection/CollectionProductCard';
import { getStorefrontCategoryTree } from '../../services/categories';
import { getProducts } from '../../services/products';
import { collectionPath, hasComboCategory, COMBO_NAV_ITEM } from '../../utils/useStorefrontCategories';
import { useSeo } from '../../utils/useSeo';
import CategoryIcon from './CategoryIcon';
import './CollectionsPage.css';

const PAGE_SIZE = 12;

/*
 * Shop by Category: main categories as tabs, their subcategories as filter pills.
 *
 * - /collections/<main>?sub=<subcategory>. Tabs and pills change the URL without reloading the
 *   page, so links, Back and refresh keep the selection.
 * - One request per main category (the main category and all its subcategories); choosing a
 *   pill filters that list in the browser, so switching pills makes no request.
 * - Categories come from the database. Before Migration 12 every category is a main category
 *   with no pills.
 */
export default function CollectionsPage() {
  const { main: mainParam = '' } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const [tree, setTree] = useState(null);
  const [treeFailed, setTreeFailed] = useState(false);
  const [treeAttempt, setTreeAttempt] = useState(0);
  // Products of one main category; key says which, so a stale answer is never shown for another
  const [catalog, setCatalog] = useState({ key: '', list: [], failed: false });
  const [productsAttempt, setProductsAttempt] = useState(0);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  useEffect(() => {
    let active = true;
    setTreeFailed(false);
    getStorefrontCategoryTree()
      .then((t) => active && setTree(t))
      .catch((err) => {
        console.error('Could not load categories:', err);
        if (active) setTreeFailed(true);
      });
    return () => {
      active = false;
    };
  }, [treeAttempt]);

  const mains = tree?.mains || [];
  const activeMain = mainParam
    ? mains.find((m) => m.slug.toLowerCase() === mainParam.toLowerCase()) || null
    : mains[0] || null;
  const subSlug = (searchParams.get('sub') || '').toLowerCase();
  const activeSub = activeMain?.children.find((c) => c.slug.toLowerCase() === subSlug) || null;

  const scopeKey = activeMain ? [activeMain.id, ...activeMain.children.map((c) => c.id)].join(',') : '';

  useEffect(() => {
    if (!scopeKey) return undefined;
    let active = true;
    getProducts({ categoryIds: scopeKey.split(','), throwOnError: true })
      .then((list) => active && setCatalog({ key: scopeKey, list: list || [], failed: false }))
      .catch((err) => {
        console.error('Could not load products:', err);
        if (active) setCatalog({ key: scopeKey, list: [], failed: true });
      });
    return () => {
      active = false;
    };
  }, [scopeKey, productsAttempt]);

  // A new category or filter starts again from the first page
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [scopeKey, subSlug]);

  const loading = Boolean(scopeKey) && catalog.key !== scopeKey;
  const products = useMemo(() => {
    if (catalog.key !== scopeKey) return [];
    return activeSub ? catalog.list.filter((p) => p.category_id === activeSub.id) : catalog.list;
  }, [catalog, scopeKey, activeSub]);
  const visibleProducts = products.slice(0, visibleCount);

  const heading = activeSub ? activeSub.name : activeMain?.name;
  useSeo({
    title: heading ? `${heading} Collection` : 'Shop by Category',
    description:
      activeSub?.description ||
      activeMain?.description ||
      'Discover our curated range of perfumes, attars, home fragrances and body care.',
    path: activeMain ? collectionPath(activeMain.slug, activeSub?.slug) : '/collections',
  });

  const selectSub = (slug) => {
    setSearchParams(slug ? { sub: slug } : {}, { replace: true });
  };

  // An unknown category in the URL goes to the first category instead of an empty page
  if (tree && mainParam && !activeMain) {
    return <Navigate to="/collections" replace />;
  }
  // An unknown subcategory falls back to All
  if (tree && subSlug && activeMain && !activeSub) {
    return <Navigate to={collectionPath(activeMain.slug)} replace />;
  }

  return (
    <div className="ps-cbc-page">
      <header className="ps-cbc-header">
        <div className="ps-cbc-eyebrow">
          <span className="ps-cbc-eyebrow-line" aria-hidden="true" />
          <span>Our Collections</span>
          <span className="ps-cbc-eyebrow-line" aria-hidden="true" />
        </div>
        <h1 className="ps-cbc-title">Shop by Category</h1>
        <p className="ps-cbc-subtitle">
          Discover our curated range of perfumes, attars, home fragrances and body care
        </p>
      </header>

      {treeFailed ? (
        <div className="ps-cbc-state" role="alert">
          <h2>Our collections could not be loaded</h2>
          <p>Please check your connection and try again.</p>
          <button type="button" className="ps-cbc-btn" onClick={() => setTreeAttempt((n) => n + 1)}>
            <RotateCcw size={15} aria-hidden="true" />
            <span>Try again</span>
          </button>
        </div>
      ) : (
        <>
          <nav className="ps-cbc-tabs" aria-label="Categories">
            <div className="ps-cbc-tabs-track">
              {!tree
                ? [1, 2, 3, 4].map((n) => <span key={n} className="ps-cbc-tab-skeleton" />)
                : mains.map((m) => {
                    const isActive = m.id === activeMain?.id;
                    return (
                      <Link
                        key={m.id}
                        to={collectionPath(m.slug)}
                        className={`ps-cbc-tab${isActive ? ' is-active' : ''}`}
                        aria-current={isActive ? 'page' : undefined}
                      >
                        <CategoryIcon slug={m.slug} />
                        <span>{m.name}</span>
                      </Link>
                    );
                  })}
            </div>
          </nav>

          {/* Every main category gets the filter row: All, then its subcategories (none before
              Migration 12, or when the category has none) */}
          {activeMain && (
            <div className="ps-cbc-filters" role="group" aria-label={`Filter ${activeMain.name}`}>
              <span className="ps-cbc-filter-label">
                <Filter size={16} strokeWidth={1.5} aria-hidden="true" />
                Filter:
              </span>
              <div className="ps-cbc-pills">
                <button
                  type="button"
                  className={`ps-cbc-pill${!activeSub ? ' is-active' : ''}`}
                  aria-pressed={!activeSub}
                  onClick={() => selectSub('')}
                >
                  All
                </button>
                {activeMain.children.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className={`ps-cbc-pill${activeSub?.id === c.id ? ' is-active' : ''}`}
                    aria-pressed={activeSub?.id === c.id}
                    onClick={() => selectSub(c.slug)}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <main className="ps-cbc-content" aria-busy={loading || !tree}>
            {!tree || loading ? (
              <div className="ps-cbc-grid">
                {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                  <div key={n} className="ps-cbc-card-skeleton" />
                ))}
              </div>
            ) : catalog.failed ? (
              <div className="ps-cbc-state" role="alert">
                <h2>These products could not be loaded</h2>
                <p>Please check your connection and try again.</p>
                <button type="button" className="ps-cbc-btn" onClick={() => setProductsAttempt((n) => n + 1)}>
                  <RotateCcw size={15} aria-hidden="true" />
                  <span>Try again</span>
                </button>
              </div>
            ) : !activeMain ? (
              <div className="ps-cbc-state">
                <h2>Collections are coming soon</h2>
                <p>Our categories are being prepared. Explore every fragrance in the meantime.</p>
                <Link to="/shop" className="ps-cbc-btn">Explore the shop</Link>
              </div>
            ) : products.length === 0 ? (
              <div className="ps-cbc-state">
                <h2>Nothing in {heading} yet</h2>
                <p>New pieces will appear here as they are added.</p>
                {activeSub ? (
                  <button type="button" className="ps-cbc-btn" onClick={() => selectSub('')}>
                    View all {activeMain.name}
                  </button>
                ) : hasComboCategory([activeMain]) ? (
                  // Combo sets live in their own table and are shown in the homepage combo section
                  <Link to={COMBO_NAV_ITEM.path} className="ps-cbc-btn">
                    See our combo sets
                  </Link>
                ) : (
                  <button type="button" className="ps-cbc-btn" onClick={() => navigate('/shop')}>
                    Explore the shop
                  </button>
                )}
              </div>
            ) : (
              <>
                <p className="ps-cbc-count" aria-live="polite">
                  {products.length} {products.length === 1 ? 'product' : 'products'}
                </p>
                <div className="ps-cbc-grid">
                  {visibleProducts.map((prod, index) => (
                    <CollectionProductCard key={prod.id} product={prod} priority={index < 4} />
                  ))}
                </div>
                {visibleCount < products.length && (
                  <div className="ps-cbc-more">
                    <button
                      type="button"
                      className="ps-cbc-btn"
                      onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}
                    >
                      Load more
                    </button>
                    <span>
                      Showing {visibleProducts.length} of {products.length}
                    </span>
                  </div>
                )}
              </>
            )}
          </main>
        </>
      )}
    </div>
  );
}
