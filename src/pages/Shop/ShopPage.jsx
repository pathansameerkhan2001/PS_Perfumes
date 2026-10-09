import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams, useParams, useLocation } from 'react-router-dom';
import { Filter, SlidersHorizontal, X, ChevronDown, Check, RefreshCw } from 'lucide-react';
import ProductCard from '../../components/ProductCard';
import { getProducts } from '../../services/products';
import { formatINR } from '../../utils/formatCurrency';
import './ShopPage.css';

const CATEGORIES = [
  'ALL',
  'Attar',
  'Perfume',
  'Bakhoor',
  'Musky',
  'Oud',
  'Floral',
  'Woody',
  'Combo Pack',
];

const GENDERS = ['ALL', 'Unisex', 'Men', 'Women'];

const SORT_OPTIONS = [
  { value: 'featured', label: 'Featured & Popular' },
  { value: 'newest', label: 'Newest Arrivals' },
  { value: 'price-low', label: 'Price: Low to High' },
  { value: 'price-high', label: 'Price: High to Low' },
  { value: 'rating', label: 'Highest Rated' },
];

export default function ShopPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { slug } = useParams();
  const location = useLocation();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filter states
  const categoryFromSlug = slug ? (slug.charAt(0).toUpperCase() + slug.slice(1).toLowerCase()) : null;
  const categoryParam = categoryFromSlug || searchParams.get('category') || 'ALL';
  const filterParam = searchParams.get('filter') || '';
  const genderParam = searchParams.get('gender') || 'ALL';
  const isOffersRoute = location.pathname === '/offers' || filterParam === 'offers';

  const [selectedCategory, setSelectedCategory] = useState(categoryParam);
  const [selectedGender, setSelectedGender] = useState(genderParam);
  const [sortOption, setSortOption] = useState('featured');
  const [maxPrice, setMaxPrice] = useState(4000);
  const [onlyInStock, setOnlyInStock] = useState(false);
  const [onlyBestsellers, setOnlyBestsellers] = useState(filterParam === 'bestseller');
  const [onlyNewArrivals, setOnlyNewArrivals] = useState(filterParam === 'new_arrival');
  const [onlyOffers, setOnlyOffers] = useState(isOffersRoute);

  // Mobile drawer state
  const [isMobileFilterOpen, setIsMobileFilterOpen] = useState(false);

  useEffect(() => {
    if (categoryParam) setSelectedCategory(categoryParam);
    if (genderParam) setSelectedGender(genderParam);
    if (filterParam === 'new_arrival') setOnlyNewArrivals(true);
    if (filterParam === 'bestseller') setOnlyBestsellers(true);
    if (location.pathname === '/offers' || filterParam === 'offers') setOnlyOffers(true);
  }, [categoryParam, genderParam, filterParam, location.pathname]);

  useEffect(() => {
    let mounted = true;
    async function fetchCatalog() {
      setLoading(true);
      try {
        const list = await getProducts({ allStatuses: false });
        if (mounted) {
          setProducts(list);
          setLoading(false);
        }
      } catch {
        if (mounted) setLoading(false);
      }
    }
    fetchCatalog();
    return () => { mounted = false; };
  }, []);

  // Filter and sort products
  const filteredProducts = useMemo(() => {
    let result = [...products];

    // Category
    if (selectedCategory && selectedCategory !== 'ALL') {
      result = result.filter(
        (p) =>
          p.category?.toLowerCase() === selectedCategory.toLowerCase() ||
          p.subcategory?.toLowerCase() === selectedCategory.toLowerCase() ||
          p.subcategories?.some((s) => s.toLowerCase() === selectedCategory.toLowerCase())
      );
    }

    // Gender
    if (selectedGender && selectedGender !== 'ALL') {
      result = result.filter(
        (p) =>
          p.gender?.toLowerCase() === selectedGender.toLowerCase() ||
          p.subcategories?.some((s) => s.toLowerCase() === selectedGender.toLowerCase())
      );
    }

    // Max Price
    result = result.filter((p) => p.price <= maxPrice);

    // In Stock
    if (onlyInStock) {
      result = result.filter((p) => p.status === 'active' && p.stock > 0);
    }

    // Bestseller
    if (onlyBestsellers) {
      result = result.filter((p) => p.bestseller || p.isBestSeller);
    }

    // New Arrival
    if (onlyNewArrivals) {
      result = result.filter((p) => p.new_arrival || p.isNewArrival);
    }

    // Offers & Bundles
    if (onlyOffers) {
      const discounted = result.filter(
        (p) =>
          (p.compare_at_price && Number(p.compare_at_price) > Number(p.price)) ||
          p.category?.toLowerCase() === 'combo pack' ||
          p.discount ||
          p.sale_price
      );
      if (discounted.length > 0) {
        result = discounted;
      }
    }

    // Sort
    if (sortOption === 'price-low') {
      result.sort((a, b) => a.price - b.price);
    } else if (sortOption === 'price-high') {
      result.sort((a, b) => b.price - a.price);
    } else if (sortOption === 'rating') {
      result.sort((a, b) => (b.rating || 5) - (a.rating || 5));
    } else if (sortOption === 'newest') {
      result.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    }

    return result;
  }, [
    products,
    selectedCategory,
    selectedGender,
    maxPrice,
    onlyInStock,
    onlyBestsellers,
    onlyNewArrivals,
    onlyOffers,
    sortOption,
  ]);

  const resetFilters = () => {
    setSelectedCategory('ALL');
    setSelectedGender('ALL');
    setMaxPrice(4000);
    setOnlyInStock(false);
    setOnlyBestsellers(false);
    setOnlyNewArrivals(false);
    setOnlyOffers(false);
    setSortOption('featured');
    setSearchParams({});
  };

  return (
    <div className="ps-shop-page">
      {/* Header Banner */}
      <div className="ps-shop-hero-banner">
        <div className="ps-shop-hero-inner">
          <span className="ps-shop-tag">
            {onlyOffers ? 'SPECIAL ATELIER PRIVILEGE' : 'HAUTE PARFUMERIE COLLECTION'}
          </span>
          <h1 className="ps-shop-title">
            {onlyOffers ? 'Curated Offers & Luxury Bundles' : 'The Complete Fragrance Wardrobe'}
          </h1>
          <p className="ps-shop-sub">
            {onlyOffers
              ? 'Discover our exclusive combo collections, gift sets, and artisanal extraits with boutique privileges.'
              : 'Artisanal attars, pure extraits de parfum, and precious agarwood distillations.'}
          </p>
        </div>
      </div>

      <div className="ps-shop-container">
        {/* Top Control Bar */}
        <div className="ps-shop-control-bar">
          <div className="ps-shop-results-count">
            Showing <strong>{filteredProducts.length}</strong> luxurious formulations
          </div>

          <div className="ps-shop-controls-right">
            {/* Mobile Filter Toggle */}
            <button
              type="button"
              className="ps-shop-mobile-filter-btn"
              onClick={() => setIsMobileFilterOpen(true)}
            >
              <SlidersHorizontal size={16} />
              <span>Filters</span>
            </button>

            {/* Desktop Sort Dropdown */}
            <div className="ps-shop-sort-wrap">
              <label htmlFor="shop-sort" className="ps-shop-sort-label">Sort By:</label>
              <select
                id="shop-sort"
                className="ps-shop-sort-select"
                value={sortOption}
                onChange={(e) => setSortOption(e.target.value)}
              >
                {SORT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Main Content Layout: Sidebar + Grid */}
        <div className="ps-shop-layout">
          {/* Desktop Filter Sidebar */}
          <aside className="ps-shop-sidebar ps-desktop-sidebar">
            <div className="ps-sidebar-header">
              <span className="ps-sidebar-title">Refine By</span>
              <button
                type="button"
                className="ps-sidebar-reset-btn"
                onClick={resetFilters}
              >
                Reset All
              </button>
            </div>

            {/* Category Filter */}
            <div className="ps-filter-block">
              <h3 className="ps-filter-heading">Fragrance Family</h3>
              <div className="ps-filter-options">
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    className={`ps-filter-pill ${selectedCategory === cat ? 'is-active' : ''}`}
                    onClick={() => setSelectedCategory(cat)}
                  >
                    <span>{cat}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Gender Filter */}
            <div className="ps-filter-block">
              <h3 className="ps-filter-heading">Gender</h3>
              <div className="ps-filter-options">
                {GENDERS.map((g) => (
                  <button
                    key={g}
                    type="button"
                    className={`ps-filter-pill ${selectedGender === g ? 'is-active' : ''}`}
                    onClick={() => setSelectedGender(g)}
                  >
                    <span>{g}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Price Filter */}
            <div className="ps-filter-block">
              <div className="ps-filter-price-header">
                <h3 className="ps-filter-heading">Max Price</h3>
                <span className="ps-price-val">{formatINR(maxPrice)}</span>
              </div>
              <input
                type="range"
                min="499"
                max="4000"
                step="100"
                value={maxPrice}
                onChange={(e) => setMaxPrice(Number(e.target.value))}
                className="ps-price-slider"
              />
              <div className="ps-price-slider-labels">
                <span>₹499</span>
                <span>₹4,000</span>
              </div>
            </div>

            {/* Checkbox Attributes */}
            <div className="ps-filter-block">
              <h3 className="ps-filter-heading">Curations</h3>
              <label className="ps-checkbox-label">
                <input
                  type="checkbox"
                  checked={onlyBestsellers}
                  onChange={(e) => setOnlyBestsellers(e.target.checked)}
                />
                <span>Bestsellers Only</span>
              </label>

              <label className="ps-checkbox-label">
                <input
                  type="checkbox"
                  checked={onlyNewArrivals}
                  onChange={(e) => setOnlyNewArrivals(e.target.checked)}
                />
                <span>New Arrivals</span>
              </label>

              <label className="ps-checkbox-label">
                <input
                  type="checkbox"
                  checked={onlyInStock}
                  onChange={(e) => setOnlyInStock(e.target.checked)}
                />
                <span>In Stock Only</span>
              </label>
            </div>
          </aside>

          {/* Product Grid Area */}
          <main className="ps-shop-grid-area">
            {loading ? (
              <div className="ps-shop-skeletons">
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <div key={n} className="ps-shop-card-skeleton" />
                ))}
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="ps-shop-empty-state">
                <h3 className="ps-empty-title">No Fragrances Found</h3>
                <p className="ps-empty-desc">
                  Try adjusting your filters or search criteria to discover our other master extractions.
                </p>
                <button
                  type="button"
                  className="ps-btn-gold-primary"
                  onClick={resetFilters}
                >
                  <RefreshCw size={15} />
                  <span>RESET ALL FILTERS</span>
                </button>
              </div>
            ) : (
              <div className="ps-shop-products-grid">
                {filteredProducts.map((prod) => (
                  <ProductCard key={prod.id} product={prod} />
                ))}
              </div>
            )}
          </main>
        </div>
      </div>

      {/* Mobile Filters Bottom Sheet */}
      {isMobileFilterOpen && (
        <div className="ps-mobile-filter-modal">
          <div
            className="ps-mobile-filter-backdrop"
            onClick={() => setIsMobileFilterOpen(false)}
          />
          <div className="ps-mobile-filter-sheet">
            <div className="ps-mobile-filter-sheet-header">
              <span className="ps-sheet-title">Filter Fragrances</span>
              <button
                type="button"
                className="ps-sheet-close-btn"
                onClick={() => setIsMobileFilterOpen(false)}
              >
                <X size={20} />
              </button>
            </div>

            <div className="ps-mobile-filter-sheet-body">
              {/* Category */}
              <div className="ps-filter-block">
                <h3 className="ps-filter-heading">Fragrance Family</h3>
                <div className="ps-filter-options">
                  {CATEGORIES.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      className={`ps-filter-pill ${selectedCategory === cat ? 'is-active' : ''}`}
                      onClick={() => setSelectedCategory(cat)}
                    >
                      <span>{cat}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Price */}
              <div className="ps-filter-block">
                <div className="ps-filter-price-header">
                  <h3 className="ps-filter-heading">Max Price</h3>
                  <span className="ps-price-val">{formatINR(maxPrice)}</span>
                </div>
                <input
                  type="range"
                  min="499"
                  max="4000"
                  step="100"
                  value={maxPrice}
                  onChange={(e) => setMaxPrice(Number(e.target.value))}
                  className="ps-price-slider"
                />
              </div>

              {/* Curations */}
              <div className="ps-filter-block">
                <h3 className="ps-filter-heading">Curations</h3>
                <label className="ps-checkbox-label">
                  <input
                    type="checkbox"
                    checked={onlyBestsellers}
                    onChange={(e) => setOnlyBestsellers(e.target.checked)}
                  />
                  <span>Bestsellers Only</span>
                </label>
                <label className="ps-checkbox-label">
                  <input
                    type="checkbox"
                    checked={onlyNewArrivals}
                    onChange={(e) => setOnlyNewArrivals(e.target.checked)}
                  />
                  <span>New Arrivals</span>
                </label>
              </div>
            </div>

            <div className="ps-mobile-filter-sheet-footer">
              <button
                type="button"
                className="ps-sheet-reset-btn"
                onClick={resetFilters}
              >
                Reset
              </button>
              <button
                type="button"
                className="ps-btn-gold-primary ps-sheet-apply-btn"
                onClick={() => setIsMobileFilterOpen(false)}
              >
                Apply ({filteredProducts.length} Results)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
