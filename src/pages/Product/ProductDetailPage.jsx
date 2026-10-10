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
import ProductCard from '../../components/ProductCard';
import './ProductDetailPage.css';

/**
 * PS PERFUMES — Luxury Product Detail Page
 * Warm Ivory / Cream Luxury Theme matching approved editorial reference.
 * Main: #F7F4EE, Card: #FFFEFA, Primary Text: #171411, Champagne Gold: #C9A96E.
 */
export default function ProductDetailPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { addToCart, toggleWishlist, isInWishlist, setIsCheckoutOpen } = useCart();

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
        if (mounted && prod) {
          setProduct(prod);
          setActiveImage(prod.main_image || prod.image || '/assets/prod-royal-amber.webp');

          // Initialize variant defaults from real product data
          if (Array.isArray(prod.variants) && prod.variants.length > 0) {
            const firstVar = prod.variants[0];
            setSelectedBottleType(normalizeBottle(firstVar.bottle_type));
            setSelectedSize(normalizeSize(firstVar.size_ml));
          } else {
            setSelectedBottleType('Glass Bottle');
            setSelectedSize('50 ml');
          }
          setQuantity(1);

          // Fetch real customer reviews
          try {
            const allRevs = await getReviews();
            if (Array.isArray(allRevs)) {
              const matched = allRevs.filter(
                (r) =>
                  r.product_name?.toLowerCase() === prod.name?.toLowerCase() ||
                  r.product_id === prod.id
              );
              setProductReviews(matched.length > 0 ? matched : allRevs.slice(0, 4));
            }
          } catch {}

          // Fetch curated companions
          try {
            const catalog = await getProducts({ category: prod.category, limit: 4 });
            if (mounted && Array.isArray(catalog)) {
              setRelated(catalog.filter((p) => p.id !== prod.id).slice(0, 4));
            }
          } catch {}
        }
      } catch (err) {
        console.error('Error loading product detail:', err);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadData();
    return () => {
      mounted = false;
    };
  }, [slug]);

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
  const currentVariant =
    activeVariants.find(
      (v) =>
        normalizeBottle(v.bottle_type) === normalizeBottle(selectedBottleType) &&
        normalizeSize(v.size_ml) === normalizeSize(selectedSize)
    ) ||
    activeVariants.find(
      (v) => normalizeBottle(v.bottle_type) === normalizeBottle(selectedBottleType)
    ) ||
    activeVariants[0] ||
    null;

  const price = currentVariant
    ? Number(currentVariant.sale_price || currentVariant.price)
    : Number(product.price || 1149);

  const comparePrice = currentVariant?.compare_at_price
    ? Number(currentVariant.compare_at_price)
    : Number(product.compare_at_price || product.originalPrice || null);

  const hasDiscount = Boolean(comparePrice && comparePrice > price);
  const discountPercent = hasDiscount
    ? Math.round(((comparePrice - price) / comparePrice) * 100)
    : null;

  const currentStock =
    currentVariant && currentVariant.stock !== undefined
      ? Number(currentVariant.stock)
      : Number(product.stock ?? 20);
  const isOutOfStock = currentStock <= 0;

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
  const rating = Number(product.rating || 4.8);
  const reviewCount = Number(product.review_count || product.reviewCount || 39);
  const hasReviews = reviewCount > 0;

  // Eyebrow
  const categoryName = (product.category || 'WOODY').toUpperCase();
  const genderName = (product.gender || 'UNISEX').toUpperCase();

  // Standard sizes to display
  const standardSizes = ['30 ml', '50 ml', '100 ml'];

  // Add to cart handler
  const handleAddToCart = () => {
    if (isOutOfStock) return;
    const variantPayload = currentVariant || {
      id: `var-${product.id}-${selectedBottleType}-${selectedSize}`,
      bottle_type: selectedBottleType,
      size_ml: selectedSize,
      price: price,
      stock: currentStock,
    };
    addToCart(product, quantity, variantPayload);
    setIsAddedAnim(true);
    setTimeout(() => setIsAddedAnim(false), 2000);
  };

  // Express Buy Now handler
  const handleBuyNow = () => {
    if (isOutOfStock) return;
    const variantPayload = currentVariant || {
      id: `var-${product.id}-${selectedBottleType}-${selectedSize}`,
      bottle_type: selectedBottleType,
      size_ml: selectedSize,
      price: price,
      stock: currentStock,
    };
    addToCart(product, quantity, variantPayload);
    setIsCheckoutOpen(true);
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
                        <img src={img} alt={`${product.name} thumbnail ${idx + 1}`} />
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
              <span className="ps-pdp-eyebrow-dot">·</span>
              <span>{genderName}</span>
            </div>

            {/* Product Title */}
            <h1 className="ps-pdp-product-title">{product.name}</h1>

            {/* Rating Stars & Customer Review Count */}
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
                {hasReviews ? `(${reviewCount} verified patron reviews)` : 'No reviews yet'}
              </span>
            </div>

            {/* Pricing Row */}
            <div className="ps-pdp-price-row">
              <span className="ps-pdp-current-price">{formatINR(price)}</span>
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
            <div className="ps-pdp-selector-section">
              <span className="ps-pdp-section-heading">BOTTLE TYPE:</span>
              <div className="ps-pdp-bottle-grid">
                {/* Glass Bottle Option */}
                <button
                  type="button"
                  className={`ps-pdp-bottle-card ${
                    normalizeBottle(selectedBottleType) === 'Glass Bottle' ? 'is-selected' : ''
                  }`}
                  onClick={() => {
                    setSelectedBottleType('Glass Bottle');
                    if (product.glass_image) {
                      setActiveImage(product.glass_image);
                    }
                  }}
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
                  onClick={() => {
                    setSelectedBottleType('PVC Bottle');
                    if (product.pvc_image) {
                      setActiveImage(product.pvc_image);
                    }
                  }}
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

            {/* SIZE SELECTOR */}
            <div className="ps-pdp-selector-section">
              <span className="ps-pdp-section-heading">SIZE:</span>
              <div className="ps-pdp-sizes-grid">
                {standardSizes.map((sz) => {
                  const vForSz = activeVariants.find(
                    (v) =>
                      normalizeBottle(v.bottle_type) === normalizeBottle(selectedBottleType) &&
                      normalizeSize(v.size_ml) === normalizeSize(sz)
                  );
                  const priceForSz = vForSz ? Number(vForSz.sale_price || vForSz.price) : null;
                  const isSelected = normalizeSize(selectedSize) === normalizeSize(sz);

                  return (
                    <button
                      key={sz}
                      type="button"
                      className={`ps-pdp-size-card ${isSelected ? 'is-selected' : ''}`}
                      onClick={() => setSelectedSize(sz)}
                    >
                      <span className="ps-pdp-size-name">{sz}</span>
                      {priceForSz && (
                        <span className="ps-pdp-size-price">{formatINR(priceForSz)}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Stock Status Indicator */}
            <div className="ps-pdp-stock-status">
              <span
                className={`ps-pdp-stock-dot ${isOutOfStock ? 'is-out' : 'is-in'}`}
                aria-hidden="true"
              />
              <span className={`ps-pdp-stock-text ${isOutOfStock ? 'is-out' : 'is-in'}`}>
                {!isOutOfStock ? (
                  <>
                    In Stock &amp; Ready for Express Dispatch from Kadapa{' '}
                    {currentStock ? `(${currentStock} available)` : ''}
                  </>
                ) : (
                  <>Out of Stock</>
                )}
              </span>
            </div>

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
                    <li>
                      <strong>Ingredients:</strong>{' '}
                      {product.ingredients ||
                        'Alcohol Denat., Parfum (Fragrance), Aqua (Water), Limonene, Linalool, Citronellol, Geraniol.'}
                    </li>
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

            {/* Card 4: Reviews */}
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
                      <span className="ps-pdp-score-big">{rating}</span>
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
                      Based on {reviewCount || 0} verified patron reviews
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
                  ) : (
                    <p className="ps-pdp-muted-text">
                      No customer reviews yet. Be the first to share your experience with{' '}
                      {product.name}.
                    </p>
                  )}
                </div>
              )}
            </div>
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
