import React, { useState, useEffect, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  SlidersHorizontal,
  ChevronDown,
  X,
  RotateCcw,
  LayoutGrid,
  Grid3X3,
  Columns2,
  List,
} from 'lucide-react';
import CollectionProductCard from '../../components/collection/CollectionProductCard';
import { getProducts } from '../../services/products';
import { getCategories } from '../../services/categories';
import { formatINR } from '../../utils/formatCurrency';
import { CATEGORY_CONFIG } from './categoryConfig';
import './CollectionPage.css';

const SORT_OPTIONS = [
  { value: 'alpha-asc', label: 'Alphabetically, A-Z' },
  { value: 'alpha-desc', label: 'Alphabetically, Z-A' },
  { value: 'price-asc', label: 'Price: Low to High' },
  { value: 'price-desc', label: 'Price: High to Low' },
  { value: 'newest', label: 'Newest' },
  { value: 'featured', label: 'Featured' },
];

const PAGE_SIZE = 12;

export default function CollectionPage({ category: categoryProp }) {
  const { slug: routeSlug } = useParams();

  // Determine active category key
  const categoryKey = (categoryProp || routeSlug || 'attar').toLowerCase();

  const baseConfig = useMemo(() => {
    return (
      CATEGORY_CONFIG[categoryKey] || {
        slug: categoryKey,
        name: categoryKey.charAt(0).toUpperCase() + categoryKey.slice(1),
        title: categoryKey.charAt(0).toUpperCase() + categoryKey.slice(1),
        fallbackDescription: 'Discover our master artisanal fragrances.',
        heroImage: '/assets/prod-royal-amber.webp',
        metaTitle: `PS PERFUMES | ${categoryKey.charAt(0).toUpperCase() + categoryKey.slice(1)}`,
        metaDescription: 'Luxury artisanal fragrances handcrafted by PS PERFUMES.',
      }
    );
  }, [categoryKey]);

  // State
  const [dynamicCategory, setDynamicCategory] = useState(null);
  const [allProducts, setAllProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  // View state (persisted in localStorage: 'grid-4', 'grid-3', 'grid-2', 'list')
  const [viewMode, setViewMode] = useState(() => {
    try {
      return localStorage.getItem('ps_collection_view') || 'grid-4';
    } catch {
      return 'grid-4';
    }
  });

  // Filter & Sort states
  const [isFilterDrawerOpen, setIsFilterDrawerOpen] = useState(false);
  const [sortOption, setSortOption] = useState('alpha-asc');
  const [maxPrice, setMaxPrice] = useState(4000);
  const [onlyInStock, setOnlyInStock] = useState(false);
  const [onlyBestsellers, setOnlyBestsellers] = useState(false);
  const [onlyNewArrivals, setOnlyNewArrivals] = useState(false);
  const [onlyDiscounted, setOnlyDiscounted] = useState(false);
  const [page, setPage] = useState(1);

  // Persist view mode change
  const handleViewChange = (newView) => {
    setViewMode(newView);
    try {
      localStorage.setItem('ps_collection_view', newView);
    } catch {}
  };



  // Fetch dynamic categories and catalog data
  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      setLoading(true);
      try {
        const [cats, prods] = await Promise.all([
          getCategories(false),
          getProducts({ allStatuses: false }),
        ]);

        if (isMounted) {
          if (Array.isArray(cats)) {
            const matched = cats.find(
              (c) => c.slug?.toLowerCase() === categoryKey
            );
            if (matched) setDynamicCategory(matched);
          }
          if (Array.isArray(prods)) {
            setAllProducts(prods);
          }
          setLoading(false);
        }
      } catch (err) {
        console.warn('Error fetching collection data:', err);
        if (isMounted) setLoading(false);
      }
    }

    loadData();

    return () => {
      isMounted = false;
    };
  }, [categoryKey]);

  // Compute final category presentation
  const activeCategory = useMemo(() => {
    return {
      slug: baseConfig.slug,
      name: dynamicCategory?.name || baseConfig.name,
      title: dynamicCategory?.name || baseConfig.title,
      description:
        dynamicCategory?.description || baseConfig.fallbackDescription,
      heroImage:
        dynamicCategory?.image_url && !dynamicCategory.image_url.startsWith('/assets/categories/botanical')
          ? dynamicCategory.image_url
          : baseConfig.heroImage,
      metaTitle: baseConfig.metaTitle,
      metaDescription: dynamicCategory?.description || baseConfig.metaDescription,
    };
  }, [baseConfig, dynamicCategory]);

  // SEO Management
  useEffect(() => {
    document.title = activeCategory.metaTitle;

    let metaDesc = document.querySelector('meta[name="description"]');
    if (!metaDesc) {
      metaDesc = document.createElement('meta');
      metaDesc.name = 'description';
      document.head.appendChild(metaDesc);
    }
    metaDesc.content = activeCategory.metaDescription;

    let canonical = document.querySelector('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.rel = 'canonical';
      document.head.appendChild(canonical);
    }
    canonical.href = window.location.href;
  }, [activeCategory]);

  // Strict Category-Specific Product Filtering
  const categoryProducts = useMemo(() => {
    const slug = activeCategory.slug.toLowerCase();
    return allProducts.filter((p) => {
      const cat = p.category?.toLowerCase() || '';
      const sub = p.subcategory?.toLowerCase() || '';
      const subs = Array.isArray(p.subcategories)
        ? p.subcategories.map((s) => s.toLowerCase())
        : [];
      return cat === slug || sub === slug || subs.includes(slug);
    });
  }, [allProducts, activeCategory.slug]);

  // Applied User Filters + Sorting
  const filteredProducts = useMemo(() => {
    let result = [...categoryProducts];

    // Price Filter
    result = result.filter((p) => (Number(p.price) || 0) <= maxPrice);

    // Availability
    if (onlyInStock) {
      result = result.filter((p) => p.status === 'active' && (p.stock === undefined || p.stock > 0));
    }

    // Curations
    if (onlyBestsellers) {
      result = result.filter((p) => p.bestseller || p.isBestSeller);
    }
    if (onlyNewArrivals) {
      result = result.filter((p) => p.new_arrival || p.isNewArrival);
    }

    // Discounted only
    if (onlyDiscounted) {
      result = result.filter((p) => {
        const pPrice = Number(p.price) || 0;
        const cPrice = Number(p.compare_at_price || p.originalPrice) || 0;
        return cPrice > pPrice;
      });
    }

    // Sorting
    switch (sortOption) {
      case 'alpha-asc':
        result.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case 'alpha-desc':
        result.sort((a, b) => b.name.localeCompare(a.name));
        break;
      case 'price-asc':
        result.sort((a, b) => (Number(a.price) || 0) - (Number(b.price) || 0));
        break;
      case 'price-desc':
        result.sort((a, b) => (Number(b.price) || 0) - (Number(a.price) || 0));
        break;
      case 'newest':
        result.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        break;
      case 'featured':
      default:
        result.sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0));
        break;
    }

    return result;
  }, [
    categoryProducts,
    maxPrice,
    onlyInStock,
    onlyBestsellers,
    onlyNewArrivals,
    onlyDiscounted,
    sortOption,
  ]);

  // Active filter count for badge
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (maxPrice < 4000) count += 1;
    if (onlyInStock) count += 1;
    if (onlyBestsellers) count += 1;
    if (onlyNewArrivals) count += 1;
    if (onlyDiscounted) count += 1;
    return count;
  }, [maxPrice, onlyInStock, onlyBestsellers, onlyNewArrivals, onlyDiscounted]);

  const resetFilters = () => {
    setMaxPrice(4000);
    setOnlyInStock(false);
    setOnlyBestsellers(false);
    setOnlyNewArrivals(false);
    setOnlyDiscounted(false);
  };

  const visibleCount = page * PAGE_SIZE;
  const visibleProducts = filteredProducts.slice(0, visibleCount);

  return (
    <div className="ps-collection-page">
      {/* ==============================================================
          1. CATEGORY HERO (Master Attar Structural Reference)
          Left: Breadcrumb + Large Heading + Description
          Right: Large Premium Fragrance Image
          ============================================================== */}
      <section className="ps-collection-hero" aria-label={`${activeCategory.name} Collection Header`}>
        <div className="ps-collection-container">
          <div className="ps-collection-hero-grid">
            {/* Left Content */}
            <div className="ps-collection-hero-content">
              {/* Breadcrumb: Home > Category */}
              <nav className="ps-collection-breadcrumb" aria-label="Breadcrumb">
                <Link to="/" className="ps-breadcrumb-link">
                  Home
                </Link>
                <span className="ps-breadcrumb-sep" aria-hidden="true">&gt;</span>
                <span className="ps-breadcrumb-current" aria-current="page">
                  {activeCategory.name}
                </span>
              </nav>

              {/* Category Heading */}
              <h1 className="ps-collection-hero-title">{activeCategory.title}</h1>

              {/* Decorative Champagne Hairline */}
              <div className="ps-collection-hero-divider" aria-hidden="true" />

              {/* Short Category Description */}
              <p className="ps-collection-hero-description">
                {activeCategory.description}
              </p>
            </div>

            {/* Right Media: Large Editorial Fragrance Bottle Image */}
            <div className="ps-collection-hero-media">
              <div className="ps-collection-hero-frame">
                <img
                  src={activeCategory.heroImage}
                  alt={`PS PERFUMES ${activeCategory.name} Master Flacon`}
                  className="ps-collection-hero-img"
                  loading="eager"
                  width="480"
                  height="480"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ==============================================================
          2. FILTER + SORT + VIEW TOOLBAR
          Left: Filter Dropdown Trigger + Sort Dropdown
          Right: Results count + 4 View Switcher Controls
          ============================================================== */}
      <section className="ps-collection-toolbar-bar" aria-label="Collection Controls">
        <div className="ps-collection-container">
          <div className="ps-collection-toolbar-inner">
            {/* Left Controls: Filter button + Sort Dropdown */}
            <div className="ps-toolbar-left">
              {/* Filter Button */}
              <button
                type="button"
                className={`ps-toolbar-filter-btn ${isFilterDrawerOpen ? 'is-active' : ''}`}
                onClick={() => setIsFilterDrawerOpen((prev) => !prev)}
                aria-expanded={isFilterDrawerOpen}
                aria-label="Toggle collection filters"
              >
                <SlidersHorizontal size={15} />
                <span>Filter</span>
                {activeFilterCount > 0 && (
                  <span className="ps-filter-count-badge">{activeFilterCount}</span>
                )}
                <ChevronDown
                  size={14}
                  className={`ps-filter-chevron ${isFilterDrawerOpen ? 'is-open' : ''}`}
                />
              </button>

              {/* Sort By Dropdown */}
              <div className="ps-toolbar-sort-wrap">
                <select
                  id="ps-collection-sort"
                  value={sortOption}
                  onChange={(e) => setSortOption(e.target.value)}
                  className="ps-toolbar-sort-select"
                  aria-label="Sort collection products"
                >
                  {SORT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <ChevronDown size={14} className="ps-sort-select-icon" aria-hidden="true" />
              </div>
            </div>

            {/* Right Controls: Results Count + 4 View Modes */}
            <div className="ps-toolbar-right">
              <div className="ps-toolbar-count">
                Showing <strong>{filteredProducts.length}</strong> {filteredProducts.length === 1 ? 'fragrance' : 'fragrances'}
              </div>

              {/* View Controls: 4-col, 3-col, 2-col, List */}
              <div className="ps-view-controls" role="group" aria-label="Grid view selector">
                {/* 4-Column Grid */}
                <button
                  type="button"
                  className={`ps-view-btn ${viewMode === 'grid-4' ? 'is-active' : ''}`}
                  onClick={() => handleViewChange('grid-4')}
                  title="4-Column Grid View"
                  aria-label="4-column grid view"
                >
                  <LayoutGrid size={16} />
                </button>

                {/* 3-Column Grid (Larger Grid) */}
                <button
                  type="button"
                  className={`ps-view-btn ${viewMode === 'grid-3' ? 'is-active' : ''}`}
                  onClick={() => handleViewChange('grid-3')}
                  title="3-Column Larger Grid View"
                  aria-label="3-column larger grid view"
                >
                  <Grid3X3 size={16} />
                </button>

                {/* 2-Column Grid (Compact Grid) */}
                <button
                  type="button"
                  className={`ps-view-btn ${viewMode === 'grid-2' ? 'is-active' : ''}`}
                  onClick={() => handleViewChange('grid-2')}
                  title="2-Column Compact Grid View"
                  aria-label="2-column compact grid view"
                >
                  <Columns2 size={16} />
                </button>

                {/* List View */}
                <button
                  type="button"
                  className={`ps-view-btn ${viewMode === 'list' ? 'is-active' : ''}`}
                  onClick={() => handleViewChange('list')}
                  title="List View"
                  aria-label="List view"
                >
                  <List size={16} />
                </button>
              </div>
            </div>
          </div>

          {/* Active Filter Chips */}
          {activeFilterCount > 0 && (
            <div className="ps-active-filters-row">
              <span className="ps-active-filters-label">Active Filters:</span>
              {maxPrice < 4000 && (
                <button
                  type="button"
                  className="ps-filter-chip"
                  onClick={() => setMaxPrice(4000)}
                >
                  <span>Under {formatINR(maxPrice)}</span>
                  <X size={12} />
                </button>
              )}
              {onlyInStock && (
                <button
                  type="button"
                  className="ps-filter-chip"
                  onClick={() => setOnlyInStock(false)}
                >
                  <span>In Stock Only</span>
                  <X size={12} />
                </button>
              )}
              {onlyBestsellers && (
                <button
                  type="button"
                  className="ps-filter-chip"
                  onClick={() => setOnlyBestsellers(false)}
                >
                  <span>Bestsellers</span>
                  <X size={12} />
                </button>
              )}
              {onlyNewArrivals && (
                <button
                  type="button"
                  className="ps-filter-chip"
                  onClick={() => setOnlyNewArrivals(false)}
                >
                  <span>New Arrivals</span>
                  <X size={12} />
                </button>
              )}
              {onlyDiscounted && (
                <button
                  type="button"
                  className="ps-filter-chip"
                  onClick={() => setOnlyDiscounted(false)}
                >
                  <span>Discounted</span>
                  <X size={12} />
                </button>
              )}
              <button
                type="button"
                className="ps-filter-reset-link"
                onClick={resetFilters}
              >
                Clear All
              </button>
            </div>
          )}
        </div>
      </section>

      {/* ==============================================================
          3. EXPANDABLE FILTER DRAWER / PANEL
          ============================================================== */}
      {isFilterDrawerOpen && (
        <div className="ps-filter-drawer-overlay">
          <div
            className="ps-filter-drawer-backdrop"
            onClick={() => setIsFilterDrawerOpen(false)}
          />
          <aside
            className="ps-filter-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Filter Fragrances"
          >
            <div className="ps-filter-drawer-header">
              <div className="ps-drawer-title-wrap">
                <SlidersHorizontal size={18} color="#C9A45C" />
                <h2 className="ps-drawer-title">Filter Collection</h2>
              </div>
              <button
                type="button"
                className="ps-drawer-close-btn"
                onClick={() => setIsFilterDrawerOpen(false)}
                aria-label="Close filters"
              >
                <X size={20} />
              </button>
            </div>

            <div className="ps-filter-drawer-body">
              {/* 1. Max Price Filter */}
              <div className="ps-drawer-block">
                <div className="ps-drawer-price-header">
                  <span className="ps-drawer-subtitle">Price Limit</span>
                  <span className="ps-drawer-price-val">{formatINR(maxPrice)}</span>
                </div>
                <input
                  type="range"
                  min="499"
                  max="4000"
                  step="100"
                  value={maxPrice}
                  onChange={(e) => setMaxPrice(Number(e.target.value))}
                  className="ps-drawer-slider"
                />
                <div className="ps-drawer-slider-ends">
                  <span>₹499</span>
                  <span>₹4,000</span>
                </div>
              </div>

              {/* 2. Availability Filter */}
              <div className="ps-drawer-block">
                <span className="ps-drawer-subtitle">Availability</span>
                <label className="ps-drawer-checkbox">
                  <input
                    type="checkbox"
                    checked={onlyInStock}
                    onChange={(e) => setOnlyInStock(e.target.checked)}
                  />
                  <span>In Stock Only</span>
                </label>
              </div>

              {/* 3. Special Curations Filter */}
              <div className="ps-drawer-block">
                <span className="ps-drawer-subtitle">Curations</span>
                <label className="ps-drawer-checkbox">
                  <input
                    type="checkbox"
                    checked={onlyBestsellers}
                    onChange={(e) => setOnlyBestsellers(e.target.checked)}
                  />
                  <span>Bestseller Formulations</span>
                </label>
                <label className="ps-drawer-checkbox">
                  <input
                    type="checkbox"
                    checked={onlyNewArrivals}
                    onChange={(e) => setOnlyNewArrivals(e.target.checked)}
                  />
                  <span>New Arrivals & Vault Extractions</span>
                </label>
                <label className="ps-drawer-checkbox">
                  <input
                    type="checkbox"
                    checked={onlyDiscounted}
                    onChange={(e) => setOnlyDiscounted(e.target.checked)}
                  />
                  <span>Discounted Offers</span>
                </label>
              </div>
            </div>

            <div className="ps-filter-drawer-footer">
              <button
                type="button"
                className="ps-drawer-reset-btn"
                onClick={resetFilters}
              >
                <RotateCcw size={14} />
                <span>Reset All</span>
              </button>
              <button
                type="button"
                className="ps-drawer-apply-btn"
                onClick={() => setIsFilterDrawerOpen(false)}
              >
                Show {filteredProducts.length} Results
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* ==============================================================
          4. MAIN CONTENT AREA: PRODUCT GRID
          ============================================================== */}
      <main className="ps-collection-content" id="collection-grid">
        <div className="ps-collection-container">
          {loading ? (
            <div className={`ps-collection-grid view-${viewMode}`}>
              {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                <div key={n} className="ps-col-card-skeleton" />
              ))}
            </div>
          ) : filteredProducts.length === 0 ? (
            /* Clean Luxury Empty State */
            <div className="ps-collection-empty">
              <div className="ps-empty-ornament" aria-hidden="true" />
              <h2 className="ps-empty-heading">
                {activeFilterCount > 0
                  ? 'No Fragrances Match Your Filter Criteria'
                  : 'No fragrances available in this collection yet.'}
              </h2>
              <p className="ps-empty-sub">
                {activeFilterCount > 0
                  ? 'Try relaxing your price or curation filters to explore other exquisite formulations.'
                  : 'Our master perfumers are distilling new rare extractions for this atelier library.'}
              </p>
              {activeFilterCount > 0 ? (
                <button
                  type="button"
                  className="ps-empty-btn"
                  onClick={resetFilters}
                >
                  <RotateCcw size={15} />
                  <span>RESET FILTERS</span>
                </button>
              ) : (
                <Link to="/shop" className="ps-empty-btn">
                  <span>Explore All Collections &rarr;</span>
                </Link>
              )}
            </div>
          ) : (
            <>
              {/* Product Grid / List Container */}
              <div className={`ps-collection-grid view-${viewMode}`}>
                {visibleProducts.map((prod, index) => (
                  <CollectionProductCard
                    key={prod.id}
                    product={prod}
                    viewMode={viewMode}
                    priority={index < 4}
                  />
                ))}
              </div>

              {/* Pagination / Load More */}
              {visibleCount < filteredProducts.length && (
                <div className="ps-collection-load-more-wrap">
                  <button
                    type="button"
                    className="ps-collection-load-more-btn"
                    onClick={() => setPage((prev) => prev + 1)}
                  >
                    <span>LOAD MORE FRAGRANCES</span>
                  </button>
                  <span className="ps-collection-load-progress">
                    Showing {visibleProducts.length} of {filteredProducts.length} formulations
                  </span>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
