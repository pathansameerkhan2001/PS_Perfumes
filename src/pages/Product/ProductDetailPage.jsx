import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  Heart,
  Star,
  ShoppingBag,
  Zap,
  Truck,
  ShieldCheck,
  ChevronDown,
  ArrowLeft,
  Check,
} from 'lucide-react';
import { getProductBySlug, getProducts } from '../../services/products';
import { useCart } from '../../context/CartContext';
import { formatINR } from '../../utils/formatCurrency';
import ProductCard from '../../components/ProductCard';
import './ProductDetailPage.css';

export default function ProductDetailPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { addToCart, toggleWishlist, isInWishlist, setIsCheckoutOpen } = useCart();

  const [product, setProduct] = useState(null);
  const [related, setRelated] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeImage, setActiveImage] = useState('');
  const [selectedBottleType, setSelectedBottleType] = useState('Glass Bottle');
  const [selectedSize, setSelectedSize] = useState('50 ml');
  const [quantity, setQuantity] = useState(1);
  const [isAddedAnim, setIsAddedAnim] = useState(false);

  // Accordion state
  const [openAccordion, setOpenAccordion] = useState('notes');

  useEffect(() => {
    let mounted = true;
    window.scrollTo({ top: 0, behavior: 'smooth' });

    async function loadData() {
      setLoading(true);
      try {
        const prod = await getProductBySlug(slug);
        if (mounted) {
          if (prod) {
            setProduct(prod);
            setActiveImage(prod.main_image || prod.image);
            if (prod.variants && prod.variants.length > 0) {
              setSelectedBottleType(prod.variants[0].bottle_type || 'Glass Bottle');
              setSelectedSize(prod.variants[0].size_ml || '50 ml');
            } else {
              setSelectedSize(prod.sizes?.[0] || '50 ml');
            }
            setQuantity(1);

            // Fetch related
            const catalog = await getProducts({ category: prod.category, limit: 4 });
            if (mounted) {
              setRelated(catalog.filter((p) => p.id !== prod.id).slice(0, 4));
            }
          }
          setLoading(false);
        }
      } catch {
        if (mounted) setLoading(false);
      }
    }
    loadData();
    return () => { mounted = false; };
  }, [slug]);

  if (loading) {
    return (
      <div className="ps-pdp-loading-wrap">
        <div className="ps-pdp-spinner" />
        <p>Distilling fragrance profile...</p>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="ps-pdp-not-found">
        <h2>Fragrance Not Found</h2>
        <p>The flacon you requested does not exist or has been retired to the royal archives.</p>
        <Link to="/shop" className="ps-btn-gold-primary">
          EXPLORE CATALOG
        </Link>
      </div>
    );
  }

  const isWishlisted = isInWishlist(product.id);
  const gallery = [product.main_image || product.image, ...(product.gallery_images || [])].filter(Boolean);

  const normalizeBottle = (b) => (b && String(b).toLowerCase().includes('pvc') ? 'PVC Bottle' : 'Glass Bottle');
  const normalizeSz = (s) => (s ? String(s).toLowerCase().replace(/\s+/g, '') : '50ml');

  // Match active variant based on user selection
  const currentVariant = product.variants?.find(
    (v) =>
      normalizeBottle(v.bottle_type) === normalizeBottle(selectedBottleType) &&
      normalizeSz(v.size_ml) === normalizeSz(selectedSize)
  ) || product.variants?.[0] || null;

  const price = currentVariant ? Number(currentVariant.sale_price || currentVariant.price) : Number(product.price || 999);
  const comparePrice = currentVariant?.compare_at_price
    ? Number(currentVariant.compare_at_price)
    : Number(product.compare_at_price || product.originalPrice || null);
  const currentStock = currentVariant && currentVariant.stock !== undefined ? Number(currentVariant.stock) : Number(product.stock || 20);

  const rating = product.rating || 5.0;
  const reviewCount = product.review_count || 24;

  const handleAddToCart = () => {
    addToCart(product, quantity, currentVariant || { bottle_type: selectedBottleType, size_ml: selectedSize, price });
    setIsAddedAnim(true);
    setTimeout(() => setIsAddedAnim(false), 2000);
  };

  const handleBuyNow = () => {
    addToCart(product, quantity, currentVariant || { bottle_type: selectedBottleType, size_ml: selectedSize, price });
    setIsCheckoutOpen(true);
  };

  const toggleAccordionSection = (sec) => {
    setOpenAccordion(openAccordion === sec ? '' : sec);
  };

  return (
    <div className="ps-pdp-page">
      {/* Breadcrumb Bar */}
      <div className="ps-pdp-breadcrumb-bar">
        <div className="ps-pdp-container">
          <button
            type="button"
            className="ps-pdp-back-btn"
            onClick={() => navigate(-1)}
          >
            <ArrowLeft size={14} />
            <span>Back</span>
          </button>
          <div className="ps-pdp-breadcrumbs">
            <Link to="/">Home</Link>
            <span>/</span>
            <Link to="/shop">Shop</Link>
            <span>/</span>
            <Link to={`/category/${product.category?.toLowerCase()}`}>{product.category}</Link>
            <span>/</span>
            <span className="ps-breadcrumb-current">{product.name}</span>
          </div>
        </div>
      </div>

      {/* Main Two-Column Product Presentation */}
      <div className="ps-pdp-container ps-pdp-main-grid">
        {/* Left Column: Image Gallery */}
        <div className="ps-pdp-gallery-col">
          <div className="ps-pdp-main-image-wrap">
            <img
              src={activeImage || gallery[0]}
              alt={product.name}
              className="ps-pdp-main-image"
              width="600"
              height="600"
            />
            {product.badge && <span className="ps-pdp-badge">{product.badge}</span>}
            {product.new_arrival && <span className="ps-pdp-badge ps-badge-new">NEW ARRIVAL</span>}
          </div>

          {/* Thumbnails */}
          {gallery.length > 1 && (
            <div className="ps-pdp-thumbs-row">
              {gallery.map((img, idx) => (
                <button
                  key={idx}
                  type="button"
                  className={`ps-pdp-thumb-btn ${activeImage === img ? 'is-active' : ''}`}
                  onClick={() => setActiveImage(img)}
                >
                  <img src={img} alt={`Flacon angle ${idx + 1}`} />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right Column: Essential Fragrance Specifications */}
        <div className="ps-pdp-details-col">
          <div className="ps-pdp-category-eyebrow">
            <span>{product.category}</span>
            {product.gender && <span>• {product.gender}</span>}
          </div>

          <h1 className="ps-pdp-title">{product.name}</h1>

          {/* Rating Stars & Customer Review Count */}
          <div className="ps-pdp-rating-row">
            <div className="ps-pdp-stars">
              {[...Array(5)].map((_, i) => (
                <Star
                  key={i}
                  size={14}
                  fill={i < Math.floor(rating) ? '#f59e0b' : '#333'}
                  color={i < Math.floor(rating) ? '#f59e0b' : '#333'}
                />
              ))}
            </div>
            <span className="ps-pdp-rating-score">{rating}</span>
            <span className="ps-pdp-review-count">({reviewCount} verified patron reviews)</span>
          </div>

          {/* Price & Discount Indicator */}
          <div className="ps-pdp-price-row">
            <span className="ps-pdp-price">{formatINR(price)}</span>
            {comparePrice && comparePrice > price && (
              <span className="ps-pdp-compare-price">{formatINR(comparePrice)}</span>
            )}
            {comparePrice && comparePrice > price && (
              <span className="ps-pdp-discount-tag">
                {Math.round(((comparePrice - price) / comparePrice) * 100)}% OFF
              </span>
            )}
            <span className="ps-pdp-tax-note">Inclusive of all duties & taxes</span>
          </div>

          {/* Short Description */}
          <p className="ps-pdp-short-desc">
            {product.short_description || product.description}
          </p>

          {/* Bottle Type Selector (Glass vs PVC) */}
          <div className="ps-pdp-variant-block">
            <span className="ps-pdp-section-label">Bottle Type:</span>
            <div className="ps-pdp-bottle-options">
              <button
                type="button"
                className={`ps-pdp-bottle-card ${normalizeBottle(selectedBottleType) === 'Glass Bottle' ? 'is-active' : ''}`}
                onClick={() => setSelectedBottleType('Glass Bottle')}
              >
                <span className="ps-bottle-title">Glass Bottle</span>
                <span className="ps-bottle-desc">Premium quality</span>
              </button>
              <button
                type="button"
                className={`ps-pdp-bottle-card ${normalizeBottle(selectedBottleType) === 'PVC Bottle' ? 'is-active' : ''}`}
                onClick={() => setSelectedBottleType('PVC Bottle')}
              >
                <span className="ps-bottle-title">PVC Bottle</span>
                <span className="ps-bottle-desc">Regular quality</span>
              </button>
            </div>
          </div>

          {/* Size / Flacon Selector (30 ml, 50 ml, 100 ml) */}
          <div className="ps-pdp-size-selector">
            <span className="ps-pdp-section-label">Size:</span>
            <div className="ps-pdp-size-grid">
              {['30 ml', '50 ml', '100 ml'].map((sz) => {
                const vForSz = product.variants?.find(
                  (v) =>
                    normalizeBottle(v.bottle_type) === normalizeBottle(selectedBottleType) &&
                    normalizeSz(v.size_ml) === normalizeSz(sz)
                );
                const vPrice = vForSz ? Number(vForSz.sale_price || vForSz.price) : null;
                const isActive = normalizeSz(selectedSize) === normalizeSz(sz);
                return (
                  <button
                    key={sz}
                    type="button"
                    className={`ps-pdp-size-card ${isActive ? 'is-active' : ''}`}
                    onClick={() => setSelectedSize(sz)}
                  >
                    <span className="ps-size-title">{sz}</span>
                    {vPrice && <span className="ps-size-price">{formatINR(vPrice)}</span>}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Stock & Availability */}
          <div className="ps-pdp-stock-status">
            <div className={`ps-stock-indicator ${currentStock > 0 ? 'is-in-stock' : 'is-out'}`} />
            <span>
              {currentStock > 0 ? (
                <>In Stock & Ready for Express Dispatch from Kadapa ({currentStock} available)</>
              ) : (
                <>Currently Out of Stock for this variant</>
              )}
            </span>
          </div>

          {/* Quantity & CTA Row */}
          <div className="ps-pdp-actions-section">
            <div className="ps-pdp-qty-control">
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                aria-label="Decrease quantity"
              >
                -
              </button>
              <span>{quantity}</span>
              <button
                type="button"
                onClick={() => setQuantity((q) => q + 1)}
                aria-label="Increase quantity"
              >
                +
              </button>
            </div>

            <button
              type="button"
              className={`ps-btn-gold-primary ps-pdp-add-btn ${isAddedAnim ? 'is-success' : ''}`}
              onClick={handleAddToCart}
              disabled={currentStock <= 0}
            >
              {isAddedAnim ? (
                <>
                  <Check size={16} />
                  <span>ADDED TO BAG</span>
                </>
              ) : (
                <>
                  <ShoppingBag size={16} />
                  <span>ADD TO BAG</span>
                </>
              )}
            </button>

            <button
              type="button"
              className="ps-pdp-wishlist-toggle"
              onClick={() => toggleWishlist(product)}
              aria-label="Add to wishlist"
            >
              <Heart
                size={20}
                fill={isWishlisted ? '#e31b23' : 'none'}
                color={isWishlisted ? '#e31b23' : '#c8a45d'}
              />
            </button>
          </div>

          {/* Instant Buy Now Button */}
          <button
            type="button"
            className="ps-pdp-buynow-btn"
            onClick={handleBuyNow}
            disabled={currentStock <= 0}
          >
            <Zap size={16} />
            <span>EXPRESS BUY NOW</span>
          </button>

          {/* Fast Delivery Assurance */}
          <div className="ps-pdp-reassurances">
            <div className="ps-pdp-reassurance-item">
              <Truck size={16} color="#c8a45d" />
              <span>Complimentary Pan-India Shipping over ₹1,500</span>
            </div>
            <div className="ps-pdp-reassurance-item">
              <ShieldCheck size={16} color="#c8a45d" />
              <span>100% Genuine Artisanal Extraction Guarantee</span>
            </div>
          </div>
        </div>
      </div>

      {/* Structured Accordions: Olfactory Notes, Ingredients, Shipping */}
      <div className="ps-pdp-container ps-pdp-accordions-wrap">
        {/* 1. Fragrance Notes Pyramid */}
        <div className="ps-pdp-accordion-item">
          <button
            type="button"
            className="ps-pdp-accordion-trigger"
            onClick={() => toggleAccordionSection('notes')}
          >
            <span>Olfactory Pyramid & Fragrance Notes</span>
            <ChevronDown
              size={18}
              className={`ps-accordion-chevron ${openAccordion === 'notes' ? 'is-open' : ''}`}
            />
          </button>
          {openAccordion === 'notes' && (
            <div className="ps-pdp-accordion-content">
              <div className="ps-notes-pyramid-grid">
                <div className="ps-pyramid-card">
                  <span className="ps-pyramid-tier">TOP NOTES</span>
                  <p className="ps-pyramid-desc">
                    {product.top_notes?.length > 0
                      ? product.top_notes.join(' • ')
                      : 'Bergamot di Calabria, Royal Saffron, Wild Cardamom'}
                  </p>
                </div>
                <div className="ps-pyramid-card">
                  <span className="ps-pyramid-tier">HEART NOTES</span>
                  <p className="ps-pyramid-desc">
                    {product.heart_notes?.length > 0
                      ? product.heart_notes.join(' • ')
                      : 'Bulgarian Rose Damascena, Ambergris, Cinnamon Bark'}
                  </p>
                </div>
                <div className="ps-pyramid-card">
                  <span className="ps-pyramid-tier">BASE NOTES</span>
                  <p className="ps-pyramid-desc">
                    {product.base_notes?.length > 0
                      ? product.base_notes.join(' • ')
                      : 'Smoked Cambodian Agarwood (Oud), Bourbon Vanilla, Velvet Musk'}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 2. Full Description */}
        <div className="ps-pdp-accordion-item">
          <button
            type="button"
            className="ps-pdp-accordion-trigger"
            onClick={() => toggleAccordionSection('desc')}
          >
            <span>Detailed Formulation & Character</span>
            <ChevronDown
              size={18}
              className={`ps-accordion-chevron ${openAccordion === 'desc' ? 'is-open' : ''}`}
            />
          </button>
          {openAccordion === 'desc' && (
            <div className="ps-pdp-accordion-content">
              <p className="ps-accordion-body-text">{product.description}</p>
            </div>
          )}
        </div>

        {/* 3. Ingredients & How to Use */}
        <div className="ps-pdp-accordion-item">
          <button
            type="button"
            className="ps-pdp-accordion-trigger"
            onClick={() => toggleAccordionSection('ingredients')}
          >
            <span>Ingredients & Artisanal Application</span>
            <ChevronDown
              size={18}
              className={`ps-accordion-chevron ${openAccordion === 'ingredients' ? 'is-open' : ''}`}
            />
          </button>
          {openAccordion === 'ingredients' && (
            <div className="ps-pdp-accordion-content">
              <p className="ps-accordion-body-text">
                <strong>Ingredients:</strong> {product.ingredients || 'Alcohol Denat., Parfum (Fragrance), Aqua (Water), Limonene, Linalool, Citronellol, Geraniol, Coumarin, Eugenol.'}
              </p>
              <p className="ps-accordion-body-text" style={{ marginTop: '12px' }}>
                <strong>Ritual of Application:</strong> Apply a dab onto pulse points (wrists, inner elbows, and base of the neck). Allow the extraction to warm with natural body heat without rubbing the flacon mist.
              </p>
            </div>
          )}
        </div>

        {/* 4. Shipping & Returns */}
        <div className="ps-pdp-accordion-item">
          <button
            type="button"
            className="ps-pdp-accordion-trigger"
            onClick={() => toggleAccordionSection('shipping')}
          >
            <span>Pan-India Shipping & Returns</span>
            <ChevronDown
              size={18}
              className={`ps-accordion-chevron ${openAccordion === 'shipping' ? 'is-open' : ''}`}
            />
          </button>
          {openAccordion === 'shipping' && (
            <div className="ps-pdp-accordion-content">
              <p className="ps-accordion-body-text">
                All fragrances ship directly from our flagship atelier in Kadapa, Andhra Pradesh (516001). Orders placed before 2 PM IST are packaged in our signature gold-embossed coffret and dispatched same day via premium air express. Delivered within 2-4 business days across major metros.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Related Master Extractions */}
      {related.length > 0 && (
        <div className="ps-pdp-container ps-pdp-related-section">
          <div className="ps-pdp-related-header">
            <span className="ps-section-eyebrow">CURATED COMPANIONS</span>
            <h2 className="ps-section-title">You May Also Admire</h2>
            <div className="ps-gold-divider" />
          </div>
          <div className="ps-pdp-related-grid">
            {related.map((prod) => (
              <ProductCard key={prod.id} product={prod} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
