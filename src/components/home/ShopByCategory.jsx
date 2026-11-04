import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Filter, RotateCcw } from 'lucide-react';
import CollectionProductCard from '../collection/CollectionProductCard';
import CategoryIcon from '../../pages/Collections/CategoryIcon';
import RosePetals from '../common/RosePetals';
import { getStorefrontCategoryTree } from '../../services/categories';
import { getProducts } from '../../services/products';
import { collectionPath } from '../../utils/useStorefrontCategories';
import '../../pages/Collections/CollectionsPage.css';
import './ShopByCategory.css';

const HOME_LIMIT = 8;
const DEFAULT_TITLE = 'Shop by Category';
const DEFAULT_SUBTITLE = 'Discover our curated range of perfumes, attars, home fragrances and body care.';
// Title saved for the retired circular section; it shows the new heading instead
const LEGACY_TITLES = ['shop by fragrance'];

/*
 * Homepage Shop by Category (section key fragrance_categories): the /collections tabs and
 * filter pills, with the first products of the selection and a link to the full collection.
 *
 * - Same data as CollectionsPage: the category tree from the database and one product request
 *   per main category; a pill filters that list in the browser.
 * - The selection is local state, so the homepage URL never changes.
 * - Before Migration 12 every category is a main category with no pills.
 */
export default function ShopByCategory({ title = '', subtitle = '' }) {
  const [tree, setTree] = useState(null);
  const [treeFailed, setTreeFailed] = useState(false);
  const [treeAttempt, setTreeAttempt] = useState(0);
  const [mainId, setMainId] = useState('');
  const [subId, setSubId] = useState('');
  // Products of one main category; key says which, so a stale answer is never shown for another
  const [catalog, setCatalog] = useState({ key: '', list: [], failed: false });
  const [productsAttempt, setProductsAttempt] = useState(0);

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
  const activeMain = mains.find((m) => m.id === mainId) || mains[0] || null;
  const activeSub = activeMain?.children.find((c) => c.id === subId) || null;

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

  const loading = Boolean(scopeKey) && catalog.key !== scopeKey;
  const products = useMemo(() => {
    if (catalog.key !== scopeKey) return [];
    return activeSub ? catalog.list.filter((p) => p.category_id === activeSub.id) : catalog.list;
  }, [catalog, scopeKey, activeSub]);

  const selectMain = (id) => {
    setMainId(id);
    setSubId('');
  };

  // No categories at all: nothing to show on the homepage
  if (tree && mains.length === 0) return null;

  const heading = title && !LEGACY_TITLES.includes(title.trim().toLowerCase()) ? title : DEFAULT_TITLE;
  const selectionName = activeSub ? activeSub.name : activeMain?.name;

  return (
    <section className="ps-cbc-home ps-arabesque" id="shop-by-category" aria-labelledby="ps-cbc-home-title">
      <header className="ps-cbc-header ps-cbc-home-header">
        <RosePetals />
        <div className="ps-cbc-eyebrow">
          <span className="ps-cbc-eyebrow-line" aria-hidden="true" />
          <span>Our Collections</span>
          <span className="ps-cbc-eyebrow-line" aria-hidden="true" />
        </div>
        <h2 id="ps-cbc-home-title" className="ps-cbc-title">
          {heading}
        </h2>
        <p className="ps-cbc-subtitle">{subtitle || DEFAULT_SUBTITLE}</p>
      </header>

      {treeFailed ? (
        <div className="ps-cbc-state" role="alert">
          <h3>Our collections could not be loaded</h3>
          <p>Please check your connection and try again.</p>
          <button type="button" className="ps-cbc-btn" onClick={() => setTreeAttempt((n) => n + 1)}>
            <RotateCcw size={15} aria-hidden="true" />
            <span>Try again</span>
          </button>
        </div>
      ) : (
        <>
          <div className="ps-cbc-tabs" role="group" aria-label="Categories">
            <div className="ps-cbc-tabs-track">
              {!tree
                ? [1, 2, 3, 4].map((n) => <span key={n} className="ps-cbc-tab-skeleton" />)
                : mains.map((m) => {
                    const isActive = m.id === activeMain?.id;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        className={`ps-cbc-tab${isActive ? ' is-active' : ''}`}
                        aria-pressed={isActive}
                        onClick={() => selectMain(m.id)}
                      >
                        <CategoryIcon slug={m.slug} />
                        <span>{m.name}</span>
                      </button>
                    );
                  })}
            </div>
          </div>

          {activeMain && activeMain.children.length > 0 && (
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
                  onClick={() => setSubId('')}
                >
                  All
                </button>
                {activeMain.children.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className={`ps-cbc-pill${activeSub?.id === c.id ? ' is-active' : ''}`}
                    aria-pressed={activeSub?.id === c.id}
                    onClick={() => setSubId(c.id)}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="ps-cbc-content" aria-busy={loading || !tree} aria-live="polite">
            {!tree || loading ? (
              <div className="ps-cbc-grid">
                {[1, 2, 3, 4].map((n) => (
                  <div key={n} className="ps-cbc-card-skeleton" />
                ))}
              </div>
            ) : catalog.failed ? (
              <div className="ps-cbc-state" role="alert">
                <h3>These products could not be loaded</h3>
                <p>Please check your connection and try again.</p>
                <button type="button" className="ps-cbc-btn" onClick={() => setProductsAttempt((n) => n + 1)}>
                  <RotateCcw size={15} aria-hidden="true" />
                  <span>Try again</span>
                </button>
              </div>
            ) : products.length === 0 ? (
              <div className="ps-cbc-state">
                <h3>Nothing in {selectionName} yet</h3>
                <p>New pieces will appear here as they are added.</p>
                {activeSub ? (
                  <button type="button" className="ps-cbc-btn" onClick={() => setSubId('')}>
                    View all {activeMain.name}
                  </button>
                ) : (
                  <Link to="/shop" className="ps-cbc-btn">
                    Explore the shop
                  </Link>
                )}
              </div>
            ) : (
              // Keyed by the selection so each change fades in
              <div key={`${scopeKey}|${activeSub?.id || ''}`} className="ps-cbc-home-fade">
                <div className="ps-cbc-grid">
                  {products.slice(0, HOME_LIMIT).map((prod) => (
                    <CollectionProductCard key={prod.id} product={prod} />
                  ))}
                </div>
                <div className="ps-cbc-more">
                  <Link to={collectionPath(activeMain.slug, activeSub?.slug)} className="ps-cbc-btn">
                    <span>View all {selectionName}</span>
                    <ArrowRight size={15} aria-hidden="true" />
                  </Link>
                  {products.length > HOME_LIMIT && (
                    <span>
                      Showing {HOME_LIMIT} of {products.length}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}
