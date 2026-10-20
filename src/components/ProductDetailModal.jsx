import React, { useState, useEffect, useMemo } from 'react';
import { X, Heart, Star, ShoppingBag, Zap, ShieldCheck, Truck, Sparkles, Check } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { formatINR } from '../utils/formatCurrency';
import './ProductDetailModal.css';

const bottleLabel = (b) => {
  const s = String(b || '').toLowerCase();
  if (s.includes('pvc')) return 'PVC';
  if (s.includes('glass')) return 'Glass';
  return String(b || 'Standard');
};
const sizeKey = (s) => String(s || '').toLowerCase().replace(/\s+/g, '');
const stockOf = (v) => Number(v?.stock_quantity ?? v?.stock ?? 0);
const unitPriceOf = (v) => (Number(v?.sale_price) > 0 ? Number(v.sale_price) : Number(v?.price) || 0);
const toList = (val) =>
  Array.isArray(val) ? val.filter(Boolean) : typeof val === 'string' ? val.split(',').map((s) => s.trim()).filter(Boolean) : [];

/**
 * Quick-view modal. Options, price and stock come only from the product's real active
 * variants; nothing is invented. When no purchasable variant can be selected, Add to bag and
 * Buy now are disabled.
 */
export default function ProductDetailModal() {
  const {
    selectedProduct,
    setSelectedProduct,
    addToCart,
    toggleWishlist,
    isInWishlist,
    freeShippingThreshold,
  } = useCart();

  const navigate = useNavigate();
  const [selectedBottle, setSelectedBottle] = useState(null);
  const [selectedSize, setSelectedSize] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const [activeImage, setActiveImage] = useState(null);
  const [isAdded, setIsAdded] = useState(false);

  // Active, priced variants of this product (the only things that can be bought)
  const variants = useMemo(
    () =>
      (selectedProduct?.variants || []).filter(
        (v) => v && v.is_active !== false && v.active !== false && unitPriceOf(v) > 0
      ),
    [selectedProduct]
  );

  useEffect(() => {
    if (selectedProduct) {
      // Start on the first in-stock variant (or the first variant); no size is assumed
      const initial = variants.find((v) => stockOf(v) > 0) || variants[0] || null;
      setSelectedBottle(initial ? bottleLabel(initial.bottle_type) : null);
      setSelectedSize(initial ? sizeKey(initial.size_ml) : null);
      setActiveImage(selectedProduct.image || selectedProduct.main_image);
      setQuantity(1);
      setIsAdded(false);
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [selectedProduct, variants]);

  if (!selectedProduct) return null;

  const product = selectedProduct;
  const isWishlisted = isInWishlist(product.id);
  const mainImage = product.image || product.main_image || '/assets/ps-perfumes-logo.webp';

  const bottles = [...new Set(variants.map((v) => bottleLabel(v.bottle_type)))];
  const sizeOptions = variants
    .filter((v) => bottleLabel(v.bottle_type) === selectedBottle)
    .filter((v, i, arr) => arr.findIndex((o) => sizeKey(o.size_ml) === sizeKey(v.size_ml)) === i);
  const currentVariant =
    variants.find((v) => bottleLabel(v.bottle_type) === selectedBottle && sizeKey(v.size_ml) === selectedSize) || null;

  const isUnavailable = variants.length === 0;
  const stock = stockOf(currentVariant);
  const canPurchase = Boolean(currentVariant) && stock > 0;
  const price = currentVariant ? unitPriceOf(currentVariant) : 0;
  const comparePrice = currentVariant && Number(currentVariant.sale_price) > 0 && Number(currentVariant.price) > price
    ? Number(currentVariant.price)
    : null;
  const discountPercent = comparePrice ? `-${Math.round(((comparePrice - price) / comparePrice) * 100)}%` : null;

  const chooseBottle = (label) => {
    setSelectedBottle(label);
    const forBottle = variants.filter((v) => bottleLabel(v.bottle_type) === label);
    if (!forBottle.some((v) => sizeKey(v.size_ml) === selectedSize)) {
      const next = forBottle.find((v) => stockOf(v) > 0) || forBottle[0];
      setSelectedSize(next ? sizeKey(next.size_ml) : null);
    }
    setQuantity(1);
  };

  const chooseSize = (key) => {
    setSelectedSize(key);
    setQuantity(1);
  };

  // Real reviews only; DB products currently have no stored rating, so the row stays hidden
  const rating = Number(product.rating) || 0;
  const reviewCount = Number(product.review_count ?? product.reviewCount) || 0;
  const hasReviews = rating > 0 && reviewCount > 0;

  const topNotes = toList(product.top_notes ?? product.topNotes);
  const heartNotes = toList(product.heart_notes ?? product.heartNotes);
  const baseNotes = toList(product.base_notes ?? product.baseNotes);
  const hasNotes = topNotes.length + heartNotes.length + baseNotes.length > 0;

  const handleAdd = () => {
    if (!canPurchase) return;
    addToCart(product, quantity, currentVariant);
    setIsAdded(true);
    setTimeout(() => setIsAdded(false), 2000);
  };

  const handleBuyNow = () => {
    if (!canPurchase) return;
    addToCart(product, quantity, currentVariant);
    setSelectedProduct(null);
    navigate('/checkout');
  };

  return (
    <div className="ps-pdetail-overlay" onClick={() => setSelectedProduct(null)}>
      <div
        className="ps-pdetail-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="pdetail-title"
      >
        {/* Close Button */}
        <button
          type="button"
          className="ps-pdetail-close-btn"
          onClick={() => setSelectedProduct(null)}
          aria-label="Close product view"
        >
          <X size={20} />
        </button>

        <div className="ps-pdetail-grid">
          {/* Left Column: Product Imagery */}
          <div className="ps-pdetail-visual">
            <div className="ps-pdetail-main-img-box">
              <img
                src={activeImage || mainImage}
                alt={product.name}
                className="ps-pdetail-main-img"
                width="500"
                height="500"
                decoding="async"
              />
              {product.badge && <span className="ps-pdetail-badge">{product.badge}</span>}
            </div>

            {/* Thumbnail switcher if secondary image exists */}
            {product.secondaryImage && (
              <div className="ps-pdetail-thumbs">
                <button
                  type="button"
                  className={`ps-pdetail-thumb-btn ${activeImage === mainImage ? 'is-active' : ''}`}
                  onClick={() => setActiveImage(mainImage)}
                  aria-label="Show main image"
                >
                  <img src={mainImage} alt="" />
                </button>
                <button
                  type="button"
                  className={`ps-pdetail-thumb-btn ${activeImage === product.secondaryImage ? 'is-active' : ''}`}
                  onClick={() => setActiveImage(product.secondaryImage)}
                  aria-label="Show second image"
                >
                  <img src={product.secondaryImage} alt="" />
                </button>
              </div>
            )}
          </div>

          {/* Right Column: Information & Purchasing */}
          <div className="ps-pdetail-info">
            <div className="ps-pdetail-brand-tag">PS PERFUMES</div>
            <h2 id="pdetail-title" className="ps-pdetail-title">{product.name}</h2>
            {[product.type, product.category].filter(Boolean).length > 0 && (
              <div className="ps-pdetail-type">{[product.type, product.category].filter(Boolean).join(' • ')}</div>
            )}

            {hasReviews && (
              <div className="ps-pdetail-rating-row">
                <div className="ps-pdetail-stars" aria-hidden="true">
                  {[...Array(5)].map((_, i) => (
                    <Star
                      key={i}
                      size={14}
                      fill={i < Math.floor(rating) ? '#f59e0b' : '#e5e7eb'}
                      color={i < Math.floor(rating) ? '#f59e0b' : '#e5e7eb'}
                    />
                  ))}
                </div>
                <span className="ps-pdetail-rating-num">{rating} / 5</span>
                <span className="ps-pdetail-review-count">
                  ({reviewCount} review{reviewCount === 1 ? '' : 's'})
                </span>
              </div>
            )}

            {/* Price of the selected variant */}
            <div className="ps-pdetail-price-box">
              {isUnavailable ? (
                <span className="ps-pdetail-current-price">Currently unavailable</span>
              ) : currentVariant ? (
                <>
                  <span className="ps-pdetail-current-price">{formatINR(price)}</span>
                  {comparePrice && <span className="ps-pdetail-orig-price">{formatINR(comparePrice)}</span>}
                  {discountPercent && <span className="ps-pdetail-discount-tag">{discountPercent}</span>}
                </>
              ) : (
                <span className="ps-pdetail-current-price">Choose an option</span>
              )}
              <span className="ps-pdetail-tax-note">
                Inclusive of all taxes • Free delivery over {formatINR(freeShippingThreshold)}
              </span>
            </div>

            {product.description && <p className="ps-pdetail-description">{product.description}</p>}

            {/* Fragrance notes — only when the product has them */}
            {hasNotes && (
              <div className="ps-pdetail-pyramid">
                <h4 className="ps-pyramid-title">
                  <Sparkles size={14} color="#c5a059" />
                  <span>FRAGRANCE NOTES</span>
                </h4>
                {topNotes.length > 0 && (
                  <div className="ps-pyramid-row">
                    <span className="ps-pyramid-tier">TOP NOTES:</span>
                    <span className="ps-pyramid-notes">{topNotes.join(' • ')}</span>
                  </div>
                )}
                {heartNotes.length > 0 && (
                  <div className="ps-pyramid-row">
                    <span className="ps-pyramid-tier">HEART NOTES:</span>
                    <span className="ps-pyramid-notes">{heartNotes.join(' • ')}</span>
                  </div>
                )}
                {baseNotes.length > 0 && (
                  <div className="ps-pyramid-row">
                    <span className="ps-pyramid-tier">BASE NOTES:</span>
                    <span className="ps-pyramid-notes">{baseNotes.join(' • ')}</span>
                  </div>
                )}
              </div>
            )}

            {(product.longevity || product.projection) && (
              <div className="ps-pdetail-specs">
                {product.longevity && (
                  <div className="ps-spec-badge">
                    <strong>Longevity:</strong> {product.longevity}
                  </div>
                )}
                {product.projection && (
                  <div className="ps-spec-badge">
                    <strong>Sillage:</strong> {product.projection}
                  </div>
                )}
              </div>
            )}

            {/* Options built from the product's real variants */}
            {bottles.length > 1 && (
              <div className="ps-pdetail-sizes" role="group" aria-label="Bottle">
                <span className="ps-sizes-label">BOTTLE:</span>
                <div className="ps-sizes-options">
                  {bottles.map((b) => (
                    <button
                      key={b}
                      type="button"
                      className={`ps-size-pill ${selectedBottle === b ? 'is-active' : ''}`}
                      aria-pressed={selectedBottle === b}
                      onClick={() => chooseBottle(b)}
                    >
                      {b}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {sizeOptions.length > 0 && (
              <div className="ps-pdetail-sizes" role="group" aria-label="Size">
                <span className="ps-sizes-label">SIZE:</span>
                <div className="ps-sizes-options">
                  {sizeOptions.map((v) => {
                    const key = sizeKey(v.size_ml);
                    const out = stockOf(v) <= 0;
                    return (
                      <button
                        key={key}
                        type="button"
                        className={`ps-size-pill ${selectedSize === key ? 'is-active' : ''}`}
                        aria-pressed={selectedSize === key}
                        onClick={() => chooseSize(key)}
                        title={out ? 'Out of stock' : undefined}
                        style={out ? { textDecoration: 'line-through', opacity: 0.6 } : undefined}
                      >
                        {v.size_ml}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {currentVariant && !canPurchase && (
              <p className="ps-pdetail-description" role="status" style={{ color: '#8C5A3C', fontWeight: 600 }}>
                This option is out of stock.
              </p>
            )}

            {/* Quantity Counter & Action Buttons */}
            <div className="ps-pdetail-actions">
              <div className="ps-qty-counter">
                <button
                  type="button"
                  className="ps-qty-btn"
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  aria-label="Decrease quantity"
                  disabled={!canPurchase || quantity <= 1}
                >
                  -
                </button>
                <span className="ps-qty-val" aria-live="polite">{quantity}</span>
                <button
                  type="button"
                  className="ps-qty-btn"
                  onClick={() => setQuantity((q) => Math.min(stock, q + 1))}
                  aria-label="Increase quantity"
                  disabled={!canPurchase || quantity >= stock}
                >
                  +
                </button>
              </div>

              <button
                type="button"
                className={`ps-pdetail-add-bag-btn ${isAdded ? 'is-success' : ''}`}
                onClick={handleAdd}
                disabled={!canPurchase}
              >
                {isAdded ? (
                  <>
                    <Check size={16} />
                    <span>ADDED TO BAG</span>
                  </>
                ) : canPurchase ? (
                  <>
                    <ShoppingBag size={16} />
                    <span>ADD TO BAG • {formatINR(price * quantity)}</span>
                  </>
                ) : (
                  <span>{isUnavailable ? 'CURRENTLY UNAVAILABLE' : 'OUT OF STOCK'}</span>
                )}
              </button>

              <button
                type="button"
                className={`ps-pdetail-wishlist-toggle ${isWishlisted ? 'is-active' : ''}`}
                onClick={() => toggleWishlist(product)}
                aria-label={isWishlisted ? 'Remove from wishlist' : 'Save to wishlist'}
              >
                <Heart size={18} fill={isWishlisted ? '#eb1c24' : 'none'} color={isWishlisted ? '#eb1c24' : '#111111'} />
              </button>
            </div>

            <button
              type="button"
              className="ps-pdetail-buy-now-btn"
              onClick={handleBuyNow}
              disabled={!canPurchase}
            >
              <Zap size={16} color="#c5a059" />
              <span>BUY IT NOW</span>
            </button>

            <div className="ps-pdetail-perks">
              <div className="ps-perk-item">
                <Truck size={15} color="#c5a059" />
                <span>Free shipping across India over {formatINR(freeShippingThreshold)}</span>
              </div>
              <div className="ps-perk-item">
                <ShieldCheck size={15} color="#c5a059" />
                <span>Genuine PS PERFUMES fragrances</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
