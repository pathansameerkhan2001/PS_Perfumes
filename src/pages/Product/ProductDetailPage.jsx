import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Heart,
  Star,
  ShoppingBag,
  Zap,
  Check,
  Truck,
  ShieldCheck,
  Award,
  ChevronDown,
  FileText,
  Layers,
  Sparkles,
} from 'lucide-react';
import { getProductBySlug, getProducts } from '../../services/products';
import { getReviews } from '../../services/reviews';
import { useCart } from '../../context/CartContext';
import { formatINR } from '../../utils/formatCurrency';
import { cardImageUrl, fullImageFallback } from '../../lib/storage';
import ProductCard from '../../components/ProductCard';
import { useSeo, SITE_URL } from '../../utils/useSeo';
import './ProductDetailPage.css';

/**
 * PS PERFUMES — Luxury Product Detail Page
 * Warm Ivory / Cream Luxury Theme matching approved editorial reference.
 * Main: #F7F4EE, Card: #FFFEFA, Primary Text: #171411, Champagne Gold: #C9A96E.
 */
export default function ProductDetailPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { addToCart, toggleWishlist, isInWishlist } = useCart();

  const [product, setProduct] = useState(null);
  const [related, setRelated] = useState([]);
  const [productReviews, setProductReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeImage, setActiveImage] = useState('');
  const [selectedBottleType, setSelectedBottleType] = useState('Glass Bottle');
  const [selectedSize, setSelectedSize] = useState('50 ml');
  const [quantity, setQuantity] = useState(1);
  const [isAddedAnim, setIsAddedAnim] = useState(false);

  // Accordion open/close state (all start closed or toggleable)
  const [openAccordions, setOpenAccordions] = useState({
    desc: false,
    details: false,
    notes: false,
    reviews: false,
  });

  const toggleAccordion = (key) => {
    setOpenAccordions((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  // Normalization helpers
  const normalizeBottle = (b) => {
    if (!b) return 'Glass Bottle';
    const s = String(b).toLowerCase();
    if (s.includes('pvc')) return 'PVC Bottle';
    return 'Glass Bottle';
  };

  const normalizeSize = (s) => {
    if (!s) return '50 ml';
    const str = String(s).trim();
    const num = str.replace(/[^\d]/g, '');
    return num ? `${num} ml` : str.toLowerCase();
  };

  useEffect(() => {
    let mounted = true;
    window.scrollTo({ top: 0, behavior: 'smooth' });

    async function loadData() {
      setLoading(true);
      try {
        const prod = await getProductBySlug(slug);
        if (mounted) setProduct(prod || null);
        if (mounted && prod) {
          setActiveImage(prod.main_image || prod.image || '/assets/ps-perfumes-logo.webp');

          // Initialize variant defaults from real product data
          const isAttar = prod.category?.toLowerCase() === 'attar';
          const firstActive = (prod.variants || []).find((v) => v.active !== false && v.is_active !== false);
          if (firstActive) {
            const firstVar = firstActive;
            setSelectedBottleType(normalizeBottle(firstVar.bottle_type));
            setSelectedSize(normalizeSize(firstVar.size_ml));
          } else {
            setSelectedBottleType('Glass Bottle');
            setSelectedSize(isAttar ? '6 ml' : '50 ml');
          }
          setQuantity(1);
          // Clear the previous product's extras; they are loaded below without holding up the page
          setProductReviews([]);
          setRelated([]);
          loadExtras(prod);
        }
      } catch (err) {
        console.error('Error loading product detail:', err);
      } finally {
        // The product (image, prices, variants) is shown as soon as it has loaded
        if (mounted) setLoading(false);
      }
    }

    // Reviews and related products are below the fold: fetched in parallel after the product
    function loadExtras(prod) {
      // Only this product's approved reviews — never reviews of other products
      getReviews(false, { productId: prod.id })
        .then((ownRevs) => {
          if (mounted) setProductReviews(Array.isArray(ownRevs) ? ownRevs : []);
        })
        .catch((err) => {
          console.error('Could not load reviews:', err);
          if (mounted) setProductReviews([]);
        });

      // Curated companions
      getProducts({ category: prod.category, limit: 4 })
        .then((catalog) => {
          if (mounted && Array.isArray(catalog)) {
            setRelated(catalog.filter((p) => p.id !== prod.id).slice(0, 4));
          }
        })
        .catch(() => {});
    }

    loadData();
    return () => {
      mounted = false;
    };
  }, [slug]);

  // SEO: hooks must run before the early returns below
  const seoVariants = (product?.variants || []).filter(
    (v) => v.is_active !== false && Number(v.sale_price || v.price) > 0
  );
  const seoPrices = seoVariants.map((v) => Number(v.sale_price || v.price));
  const seoDescription =
    product?.meta_description ||
    product?.short_description ||
    product?.description ||
    (product ? `${product.name} by PS PERFUMES, ${product.category || 'fragrance'} available in glass and PVC bottles.` : '');
  useSeo({
    title: product
      ? product.meta_title || `${product.name} – ${product.category || 'Fragrance'}`
      : loading
      ? ''
      : 'Fragrance not found',
    description: seoDescription,
    path: product ? `/product/${product.slug}` : `/product/${slug}`,
    image: product?.main_image,
    type: product ? 'product' : 'website',
    noindex: !loading && !product,
    jsonLd: product
      ? {
          '@context': 'https://schema.org',
          '@type': 'Product',
          name: product.name,
          image: [product.main_image, product.glass_image, product.pvc_image]
            .filter((u) => u && !u.endsWith('ps-perfumes-logo.webp'))
            .filter((u, i, a) => a.indexOf(u) === i),
          description: seoDescription,
          sku: product.sku || undefined,
          brand: { '@type': 'Brand', name: product.brand || 'PS PERFUMES' },
          category: product.category,
          url: `${SITE_URL}/product/${product.slug}`,
          ...(seoPrices.length > 0
            ? {
                offers: {
                  '@type': 'AggregateOffer',
                  priceCurrency: 'INR',
                  lowPrice: Math.min(...seoPrices),
                  highPrice: Math.max(...seoPrices),
                  offerCount: seoPrices.length,
                  availability: seoVariants.some((v) => Number(v.stock_quantity ?? v.stock) > 0)
                    ? 'https://schema.org/InStock'
                    : 'https://schema.org/OutOfStock',
                },
              }
            : {}),
        }
      : null,
  });

  if (loading) {
    return (
      <div className="ps-pdp-page ps-pdp-loading-screen">
        <div className="ps-pdp-spinner" />
        <p className="ps-pdp-loading-text">Distilling fragrance profile...</p>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="ps-pdp-page ps-pdp-not-found">
        <h2>Fragrance Not Found</h2>
        <p>The flacon you requested does not exist or has been retired to the royal archives.</p>
        <Link to="/shop" className="ps-pdp-back-catalog-btn">
          EXPLORE CATALOG
        </Link>
      </div>
    );
  }

  // Active variants
  const activeVariants = Array.isArray(product.variants)
    ? product.variants.filter((v) => v.active !== false && v.is_active !== false)
    : [];

  // Match active variant based on selected bottle & size
  // Exact match only: falling back to another size would sell a different variant than the
  // one highlighted. Bottle changes re-select an available size (selectBottle below).
  const currentVariant =
    activeVariants.find(
      (v) =>
        normalizeBottle(v.bottle_type) === normalizeBottle(selectedBottleType) &&
        normalizeSize(v.size_ml) === normalizeSize(selectedSize)
    ) || null;
  const variantUnavailable = activeVariants.length > 0 && !currentVariant;

  const price = currentVariant
    ? Number(currentVariant.sale_price || currentVariant.price)
    : Number(product.price) || 0;

  const comparePrice = currentVariant?.compare_at_price
    ? Number(currentVariant.compare_at_price)
    : Number(product.compare_at_price || product.originalPrice || null);

  // A discount only exists for a real selected variant (never "100% OFF" against a missing price)
  const hasDiscount = Boolean(currentVariant && comparePrice && comparePrice > price);
  const discountPercent = hasDiscount
    ? Math.round(((comparePrice - price) / comparePrice) * 100)
    : null;

  // Stock of the selected variant only: a product without a matching variant cannot be bought
  const currentStock = currentVariant ? Number(currentVariant.stock_quantity ?? currentVariant.stock ?? 0) : 0;
  const isOutOfStock = variantUnavailable || !currentVariant || currentStock <= 0;

  const isWishlisted = isInWishlist(product.id);

  // Gallery array
  const rawGallery = [
    product.main_image || product.image,
    product.glass_image,
    product.pvc_image,
    ...(Array.isArray(product.gallery_images) ? product.gallery_images : []),
    product.secondaryImage,
  ].filter(Boolean);
  const gallery = Array.from(new Set(rawGallery));

  // Rating & review counts
  // Rating and count come only from this product's approved reviews (nothing invented)
  const reviewCount = productReviews.length;
  const hasReviews = reviewCount > 0;
  const rating = hasReviews
    ? Math.round((productReviews.reduce((sum, r) => sum + (Number(r.rating) || 0), 0) / reviewCount) * 10) / 10
    : 0;

  // Eyebrow
  const categoryName = (product.category || 'WOODY').toUpperCase();
  const genderName = product.gender ? String(product.gender).toUpperCase() : '';

  const isAttar = product.category?.toLowerCase() === 'attar';

  // Distinct bottle types offered in active variants
  const availableBottleTypes = (() => {
    if (activeVariants.length > 0) {
      const distinct = [];
      activeVariants.forEach((v) => {
        const norm = normalizeBottle(v.bottle_type);
        if (norm && !distinct.includes(norm)) distinct.push(norm);
      });
      if (distinct.length > 0) return distinct;
    }
    // No variants: no bottle options are invented (the product shows as unavailable)
    return [];
  })();

  // Distinct sizes offered in active variants (or sensible fallback per category)
  const availableSizes = (() => {
    if (activeVariants.length > 0) {
      const distinct = [];
      activeVariants.forEach((v) => {
        const norm = normalizeSize(v.size_ml);
        if (norm && !distinct.includes(norm)) distinct.push(norm);
      });
      if (distinct.length > 0) return distinct;
    }
    // No variants: no sizes are invented
    return [];
  })();

  const sizeAvailableFor = (bottle, sz) =>
    activeVariants.some(
      (v) => normalizeBottle(v.bottle_type) === normalizeBottle(bottle) && normalizeSize(v.size_ml) === normalizeSize(sz)
    );

  // Switch bottle type and keep the size selection valid for that bottle
  const selectBottle = (bottle, image) => {
    setSelectedBottleType(bottle);
    if (activeVariants.length > 0 && !sizeAvailableFor(bottle, selectedSize)) {
      const firstForBottle = activeVariants.find((v) => normalizeBottle(v.bottle_type) === bottle);
      if (firstForBottle) setSelectedSize(normalizeSize(firstForBottle.size_ml));
    }
    setQuantity(1);
    if (image) setActiveImage(image);
  };

  // Add to cart handler — only the real selected variant (isOutOfStock covers "no variant")
  const handleAddToCart = () => {
    if (isOutOfStock || !currentVariant) return;
    addToCart(product, quantity, currentVariant);
    setIsAddedAnim(true);
    setTimeout(() => setIsAddedAnim(false), 2000);
  };

  // Express Buy Now handler
  const handleBuyNow = () => {
    if (isOutOfStock || !currentVariant) return;
    addToCart(product, quantity, currentVariant);
    navigate('/checkout');
  };

  const hasFragranceNotes = Boolean(
    (product.top_notes && product.top_notes.length > 0) ||
    (product.heart_notes && product.heart_notes.length > 0) ||
    (product.base_notes && product.base_notes.length > 0) ||
    (product.fragrance_notes && product.fragrance_notes.length > 0)
  );

  return (
    <div className="ps-pdp-page">
      {/* ==============================================================
          1. TOP BREADCRUMB & BACK ACTION
          ============================================================== */}
      <nav className="ps-pdp-top-bar" aria-label="Breadcrumb navigation">
        <div className="ps-pdp-top-inner">
          <button
            type="button"
            className="ps-pdp-back-pill"
            onClick={() => navigate(-1)}
            aria-label="Go back to previous page"
          >
            <ArrowLeft size={14} />
            <span>Back</span>
          </button>

          <ol className="ps-pdp-breadcrumbs">
            <li>
              <Link to="/">Home</Link>
            </li>
            <li className="ps-pdp-bc-sep">/</li>
            <li>
              <Link to="/shop">Shop</Link>
            </li>
            <li className="ps-pdp-bc-sep">/</li>
            <li>
              <Link to={`/category/${product.category?.toLowerCase() || 'woody'}`}>
                {product.category || 'Woody'}
              </Link>
            </li>
            <li className="ps-pdp-bc-sep">/</li>
            <li className="ps-pdp-bc-current" aria-current="page">
              {product.name}
            </li>
          </ol>
        </div>
      </nav>

      {/* ==============================================================
          2. MAIN TWO-COLUMN PRODUCT SECTION
          ============================================================== */}
      <section className="ps-pdp-main-section">
        <div className="ps-pdp-main-grid">
          {/* ------------------------------------------------------------
              LEFT COLUMN: PRODUCT GALLERY (Thumbnails + Main Image)
              ------------------------------------------------------------ */}
          <div className="ps-pdp-gallery-col">
            <div className="ps-pdp-gallery-layout">
              {/* Vertical Thumbnails List */}
              {gallery.length > 1 && (
                <div className="ps-pdp-thumb-list" role="tablist" aria-label="Product image thumbnails">
                  {gallery.map((img, idx) => {
                    const isSelected = activeImage === img;
                    return (
                      <button
                        key={idx}
                        type="button"
                        role="tab"
                        aria-selected={isSelected}
                        className={`ps-pdp-thumb-item ${isSelected ? 'is-active' : ''}`}
                        onClick={() => setActiveImage(img)}
                        aria-label={`View flacon image angle ${idx + 1}`}
                      >
                        <img
                          src={cardImageUrl(img)}
                          alt={`${product.name} thumbnail ${idx + 1}`}
                          decoding="async"
                          onError={fullImageFallback(img)}
                        />
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Large Main Product Image Area */}
              <div className="ps-pdp-main-image-box">
                <img
                  src={activeImage || gallery[0]}
                  alt={product.name}
                  className="ps-pdp-main-image"
                  width="600"
                  height="750"
                  decoding="async"
                  fetchPriority="high"
                />

                {/* Circular Top-Right Wishlist Button */}
                <button
                  type="button"
                  className={`ps-pdp-wishlist-circle ${isWishlisted ? 'is-active' : ''}`}
                  onClick={() => toggleWishlist(product)}
                  aria-label={isWishlisted ? 'Remove from wishlist' : 'Add to wishlist'}
                  title={isWishlisted ? 'Saved in Wishlist' : 'Add to Wishlist'}
                >
                  <Heart
                    size={18}
                    fill={isWishlisted ? '#E31B23' : 'none'}
                    color={isWishlisted ? '#E31B23' : '#171411'}
                    strokeWidth={1.8}
                  />
                </button>
              </div>
            </div>
          </div>

          {/* ------------------------------------------------------------
              RIGHT COLUMN: PRODUCT INFORMATION & PURCHASE FORM
              ------------------------------------------------------------ */}
          <div className="ps-pdp-info-col">
            {/* Category · Gender Eyebrow */}
            <div className="ps-pdp-eyebrow">
              <span>{categoryName}</span>
              {genderName && (
                <>
                  <span className="ps-pdp-eyebrow-dot">·</span>
                  <span>{genderName}</span>
                </>
              )}
            </div>

            {/* Product Title */}
            <h1 className="ps-pdp-product-title">{product.name}</h1>

            {/* Rating Stars & Customer Review Count (only when the product has reviews) */}
            {hasReviews && (
              <div className="ps-pdp-rating-row">
                <div className="ps-pdp-stars" aria-hidden="true">
                  {[...Array(5)].map((_, i) => (
                    <Star
                      key={i}
                      size={15}
                      fill={i < Math.floor(rating) ? '#C9A96E' : '#E7D7BA'}
                      color={i < Math.floor(rating) ? '#C9A96E' : '#E7D7BA'}
                    />
                  ))}
                </div>
                <span className="ps-pdp-rating-number">{rating}</span>
                <span className="ps-pdp-reviews-count">
                  ({reviewCount} review{reviewCount === 1 ? '' : 's'})
                </span>
              </div>
            )}

            {/* Pricing Row */}
            <div className="ps-pdp-price-row">
              {/* Price of the selected variant; never "₹0" when nothing can be bought */}
              <span className="ps-pdp-current-price">
                {currentVariant
                  ? formatINR(price)
                  : activeVariants.length === 0
                  ? 'Currently unavailable'
                  : 'Choose an option'}
              </span>
              {hasDiscount && (
                <span className="ps-pdp-original-price">{formatINR(comparePrice)}</span>
              )}
              {hasDiscount && (
                <span className="ps-pdp-discount-pill">{discountPercent}% OFF</span>
              )}
            </div>

            {/* Tax Note */}
            <span className="ps-pdp-tax-note">Inclusive of all duties & taxes</span>

            {/* Product Description */}
            <p className="ps-pdp-description-para">
              {product.description ||
                product.short_description ||
                'Creamy, soothing, and intensely addictive. Pure artisanal extractions crafted for those who appreciate quiet luxury.'}
            </p>

            <div className="ps-pdp-divider" />

            {/* BOTTLE TYPE SELECTOR */}
            {availableBottleTypes.length > 1 ? (
              <div className="ps-pdp-selector-section">
                <span className="ps-pdp-section-heading">BOTTLE TYPE:</span>
                <div className="ps-pdp-bottle-grid">
                  {/* Glass Bottle Option */}
                  <button
                    type="button"
                    className={`ps-pdp-bottle-card ${
                      normalizeBottle(selectedBottleType) === 'Glass Bottle' ? 'is-selected' : ''
                    }`}
                    aria-pressed={normalizeBottle(selectedBottleType) === 'Glass Bottle'}
                    onClick={() => selectBottle('Glass Bottle', product.glass_image)}
                  >
                    <div className="ps-pdp-bottle-icon" aria-hidden="true">
                      <svg
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M10 2h4v3h-4z" />
                        <path d="M7 8a3 3 0 0 1 3-3h4a3 3 0 0 1 3 3v12a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2z" />
                        <line x1="7" y1="12" x2="17" y2="12" />
                      </svg>
                    </div>
                    <div className="ps-pdp-bottle-text">
                      <span className="ps-pdp-card-title">Glass Bottle</span>
                      <span className="ps-pdp-card-subtitle">Premium quality</span>
                    </div>
                  </button>

                  {/* PVC Bottle Option */}
                  <button
                    type="button"
                    className={`ps-pdp-bottle-card ${
                      normalizeBottle(selectedBottleType) === 'PVC Bottle' ? 'is-selected' : ''
                    }`}
                    aria-pressed={normalizeBottle(selectedBottleType) === 'PVC Bottle'}
                    onClick={() => selectBottle('PVC Bottle', product.pvc_image)}
                  >
                    <div className="ps-pdp-bottle-icon" aria-hidden="true">
                      <svg
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <rect x="8" y="2" width="8" height="4" rx="1" />
                        <path d="M7 7h10l-1 14a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1z" />
                        <line x1="12" y1="11" x2="12" y2="17" />
                      </svg>
                    </div>
                    <div className="ps-pdp-bottle-text">
                      <span className="ps-pdp-card-title">PVC Bottle</span>
                      <span className="ps-pdp-card-subtitle">Regular quality</span>
                    </div>
                  </button>
                </div>
              </div>
            ) : availableBottleTypes.length === 1 ? (
              <div className="ps-pdp-selector-section">
                <span className="ps-pdp-section-heading">FLACON TYPE:</span>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '8px 14px', background: '#F7F4EE', borderRadius: '6px', fontSize: '13px', color: '#171411', border: '1px solid #E5D7C3' }}>
                  <span style={{ fontWeight: 600 }}>{availableBottleTypes[0]}</span>
                  <span style={{ fontSize: '11px', color: '#8C8479' }}>{isAttar ? '(Artisanal Oil Roll-On)' : '(Luxury Flacon)'}</span>
                </div>
              </div>
            ) : null}

            {/* SIZE SELECTOR (only the product's real sizes) */}
            <div className="ps-pdp-selector-section" style={availableSizes.length === 0 ? { display: 'none' } : undefined}>
              <span className="ps-pdp-section-heading">SIZE:</span>
              <div className="ps-pdp-sizes-grid">
                {availableSizes.map((sz) => {
                  const vForSz = activeVariants.find(
                    (v) =>
                      normalizeBottle(v.bottle_type) === normalizeBottle(selectedBottleType) &&
                      normalizeSize(v.size_ml) === normalizeSize(sz)
                  );
                  const priceForSz = vForSz ? Number(vForSz.sale_price || vForSz.price) : null;
                  const isSelected = normalizeSize(selectedSize) === normalizeSize(sz);
                  const notOffered = activeVariants.length > 0 && !vForSz;

                  return (
                    <button
                      key={sz}
                      type="button"
                      className={`ps-pdp-size-card ${isSelected ? 'is-selected' : ''}`}
                      aria-pressed={isSelected}
                      disabled={notOffered}
                      title={notOffered ? `${sz} is not available in ${selectedBottleType}` : undefined}
                      onClick={() => {
                        setSelectedSize(sz);
                        setQuantity(1);
                      }}
                    >
                      <span className="ps-pdp-size-name">{sz}</span>
                      {priceForSz > 0 && (
                        <span className="ps-pdp-size-price">{formatINR(priceForSz)}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Stock notice: shown only when the selected option cannot be bought */}
            {isOutOfStock && (
              <div className="ps-pdp-stock-status">
                <span className="ps-pdp-stock-dot is-out" aria-hidden="true" />
                <span className="ps-pdp-stock-text is-out">
                  {variantUnavailable ? <>Not available in this bottle and size</> : <>Out of Stock</>}
                </span>
              </div>
            )}

            {/* Actions: Quantity + ADD TO CART + BUY NOW */}
            <div className="ps-pdp-actions-row">
              {/* Clean Quantity Selector */}
              <div className="ps-pdp-quantity-box">
                <button
                  type="button"
                  className="ps-pdp-qty-btn"
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  aria-label="Decrease quantity"
                  disabled={quantity <= 1 || isOutOfStock}
                >
                  −
                </button>
                <span className="ps-pdp-qty-display">{quantity}</span>
                <button
                  type="button"
                  className="ps-pdp-qty-btn"
                  onClick={() => setQuantity((q) => Math.min(currentStock || 10, q + 1))}
                  aria-label="Increase quantity"
                  disabled={quantity >= (currentStock || 10) || isOutOfStock}
                >
                  +
                </button>
              </div>

              {/* Primary Champagne-Gold ADD TO CART Button */}
              <button
                type="button"
                className={`ps-pdp-add-btn ${isAddedAnim ? 'is-success' : ''}`}
                onClick={handleAddToCart}
                disabled={isOutOfStock}
                aria-label={`Add ${product.name} to cart`}
              >
                {isAddedAnim ? (
                  <>
                    <Check size={18} strokeWidth={2.4} />
                    <span>ADDED TO BAG</span>
                  </>
                ) : (
                  <>
                    <ShoppingBag size={18} strokeWidth={1.8} />
                    <span>ADD TO CART</span>
                  </>
                )}
              </button>

              {/* Secondary Outlined Champagne-Gold BUY NOW Button */}
              <button
                type="button"
                className="ps-pdp-buynow-btn"
                onClick={handleBuyNow}
                disabled={isOutOfStock}
                aria-label={`Express buy ${product.name} now`}
              >
                <Zap size={16} strokeWidth={2} />
                <span>BUY NOW</span>
              </button>
            </div>

            {/* Feature Benefits Strip */}
            <div className="ps-pdp-benefits-strip">
              <div className="ps-pdp-benefit-item">
                <Truck size={20} className="ps-pdp-benefit-icon" />
                <div className="ps-pdp-benefit-text">
                  <span className="ps-pdp-benefit-title">Express Dispatch</span>
                  <span className="ps-pdp-benefit-sub">Ships from Kadapa</span>
                </div>
              </div>

              <div className="ps-pdp-benefit-item">
                <ShieldCheck size={20} className="ps-pdp-benefit-icon" />
                <div className="ps-pdp-benefit-text">
                  <span className="ps-pdp-benefit-title">Secure Packaging</span>
                  <span className="ps-pdp-benefit-sub">Luxury gift ready</span>
                </div>
              </div>

              <div className="ps-pdp-benefit-item">
                <Award size={20} className="ps-pdp-benefit-icon" />
                <div className="ps-pdp-benefit-text">
                  <span className="ps-pdp-benefit-title">100% Authentic</span>
                  <span className="ps-pdp-benefit-sub">Premium quality</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ==============================================================
            3. INFORMATION ACCORDIONS (2x2 Grid)
            ============================================================== */}
        <div className="ps-pdp-accordions-container">
          <div className="ps-pdp-accordions-grid">
            {/* Card 1: Description */}
            <div className="ps-pdp-accordion-card">
              <button
                type="button"
                className="ps-pdp-accordion-header"
                onClick={() => toggleAccordion('desc')}
                aria-expanded={openAccordions.desc}
              >
                <div className="ps-pdp-accordion-title-wrap">
                  <FileText size={18} className="ps-pdp-accordion-icon" />
                  <span className="ps-pdp-accordion-heading">Description</span>
                </div>
                <ChevronDown
                  size={18}
                  className={`ps-pdp-accordion-chevron ${openAccordions.desc ? 'is-open' : ''}`}
                />
              </button>
              {openAccordions.desc && (
                <div className="ps-pdp-accordion-body">
                  <p className="ps-pdp-accordion-para">
                    {product.description ||
                      'An extraordinary olfactory composition crafted with aged natural extractions.'}
                  </p>
                  {product.occasion && (
                    <p className="ps-pdp-accordion-meta">
                      <strong>Occasion:</strong> {product.occasion}
                    </p>
                  )}
                  {product.longevity && (
                    <p className="ps-pdp-accordion-meta">
                      <strong>Longevity:</strong> {product.longevity}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Card 2: Details */}
            <div className="ps-pdp-accordion-card">
              <button
                type="button"
                className="ps-pdp-accordion-header"
                onClick={() => toggleAccordion('details')}
                aria-expanded={openAccordions.details}
              >
                <div className="ps-pdp-accordion-title-wrap">
                  <Layers size={18} className="ps-pdp-accordion-icon" />
                  <span className="ps-pdp-accordion-heading">Details</span>
                </div>
                <ChevronDown
                  size={18}
                  className={`ps-pdp-accordion-chevron ${openAccordions.details ? 'is-open' : ''}`}
                />
              </button>
              {openAccordions.details && (
                <div className="ps-pdp-accordion-body">
                  <ul className="ps-pdp-details-list">
                    <li>
                      <strong>Concentration:</strong> {product.type || 'Extrait de Parfum'} (30% Artisanal Oil Concentration)
                    </li>
                    <li>
                      <strong>Available Sizes:</strong> 30 ml, 50 ml, 100 ml
                    </li>
                    <li>
                      <strong>Bottle Options:</strong> Luxury Heavyweight Flacon (Glass) &amp; Travel-Safe Precision Bottle (PVC)
                    </li>
                    <li>
                      <strong>Atelier Origin:</strong> Handcrafted in Kadapa, Andhra Pradesh, India (516001)
                    </li>
                    {product.ingredients && (
                      <li>
                        <strong>Ingredients:</strong> {product.ingredients}
                      </li>
                    )}
                  </ul>
                </div>
              )}
            </div>

            {/* Card 3: Fragrance Notes */}
            <div className="ps-pdp-accordion-card">
              <button
                type="button"
                className="ps-pdp-accordion-header"
                onClick={() => toggleAccordion('notes')}
                aria-expanded={openAccordions.notes}
              >
                <div className="ps-pdp-accordion-title-wrap">
                  <Sparkles size={18} className="ps-pdp-accordion-icon" />
                  <span className="ps-pdp-accordion-heading">Fragrance Notes</span>
                </div>
                <ChevronDown
                  size={18}
                  className={`ps-pdp-accordion-chevron ${openAccordions.notes ? 'is-open' : ''}`}
                />
              </button>
              {openAccordions.notes && (
                <div className="ps-pdp-accordion-body">
                  {hasFragranceNotes ? (
                    <div className="ps-pdp-notes-pyramid">
                      {product.top_notes && product.top_notes.length > 0 && (
                        <div className="ps-pdp-note-tier">
                          <span className="ps-pdp-tier-label">TOP NOTES</span>
                          <p>{product.top_notes.join(' • ')}</p>
                        </div>
                      )}
                      {product.heart_notes && product.heart_notes.length > 0 && (
                        <div className="ps-pdp-note-tier">
                          <span className="ps-pdp-tier-label">HEART NOTES</span>
                          <p>{product.heart_notes.join(' • ')}</p>
                        </div>
                      )}
                      {product.base_notes && product.base_notes.length > 0 && (
                        <div className="ps-pdp-note-tier">
                          <span className="ps-pdp-tier-label">BASE NOTES</span>
                          <p>{product.base_notes.join(' • ')}</p>
                        </div>
                      )}
                      {product.fragrance_notes &&
                        product.fragrance_notes.length > 0 &&
                        !product.top_notes?.length && (
                          <div className="ps-pdp-note-tier">
                            <span className="ps-pdp-tier-label">KEY NOTES</span>
                            <p>{product.fragrance_notes.join(' • ')}</p>
                          </div>
                        )}
                    </div>
                  ) : (
                    <p className="ps-pdp-muted-text">Fragrance notes coming soon.</p>
                  )}
                </div>
              )}
            </div>

            {/* Card 4: Reviews (only when the product has approved reviews) */}
            {hasReviews && (
            <div className="ps-pdp-accordion-card">
              <button
                type="button"
                className="ps-pdp-accordion-header"
                onClick={() => toggleAccordion('reviews')}
                aria-expanded={openAccordions.reviews}
              >
                <div className="ps-pdp-accordion-title-wrap">
                  <Star size={18} className="ps-pdp-accordion-icon" />
                  <span className="ps-pdp-accordion-heading">
                    Reviews {reviewCount > 0 ? `(${reviewCount})` : ''}
                  </span>
                </div>
                <ChevronDown
                  size={18}
                  className={`ps-pdp-accordion-chevron ${openAccordions.reviews ? 'is-open' : ''}`}
                />
              </button>
              {openAccordions.reviews && (
                <div className="ps-pdp-accordion-body">
                  {/* Reviews Overview Score */}
                  <div className="ps-pdp-reviews-overview">
                    <div className="ps-pdp-score-block">
                      <span className="ps-pdp-score-big">{hasReviews ? rating : '—'}</span>
                      <div className="ps-pdp-stars">
                        {[...Array(5)].map((_, i) => (
                          <Star
                            key={i}
                            size={14}
                            fill={i < Math.floor(rating) ? '#C9A96E' : '#E7D7BA'}
                            color={i < Math.floor(rating) ? '#C9A96E' : '#E7D7BA'}
                          />
                        ))}
                      </div>
                    </div>
                    <span className="ps-pdp-verified-note">
                      Based on {reviewCount} review{reviewCount === 1 ? '' : 's'}
                    </span>
                  </div>

                  {/* Customer Reviews List */}
                  {productReviews.length > 0 ? (
                    <div className="ps-pdp-reviews-feed">
                      {productReviews.map((rev) => (
                        <div key={rev.id} className="ps-pdp-review-card">
                          <div className="ps-pdp-rev-header">
                            <span className="ps-pdp-rev-author">
                              {rev.customer_name || rev.author || 'Verified Patron'}
                            </span>
                            <span className="ps-pdp-rev-verified">✓ Verified Buyer</span>
                          </div>
                          <div className="ps-pdp-stars">
                            {[...Array(5)].map((_, i) => (
                              <Star
                                key={i}
                                size={12}
                                fill={i < Math.floor(rev.rating || 5) ? '#C9A96E' : '#E7D7BA'}
                                color={i < Math.floor(rev.rating || 5) ? '#C9A96E' : '#E7D7BA'}
                              />
                            ))}
                          </div>
                          {rev.title && <h5 className="ps-pdp-rev-title">{rev.title}</h5>}
                          <p className="ps-pdp-rev-body">{rev.comment}</p>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              )}
            </div>
            )}
          </div>
        </div>

        {/* ==============================================================
            4. CURATED COMPANIONS (Styled in matching Warm Ivory Luxury Theme)
            ============================================================== */}
        {related.length > 0 && (
          <div className="ps-pdp-related-container">
            <div className="ps-pdp-related-header">
              <span className="ps-pdp-related-eyebrow">CURATED COMPANIONS</span>
              <h2 className="ps-pdp-related-title">You May Also Admire</h2>
              <div className="ps-pdp-gold-hairline" />
            </div>
            <div className="ps-bestsellers-grid">
              {related.map((prod) => (
                <ProductCard key={prod.id} product={prod} />
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
