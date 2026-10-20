import React, { useMemo, useState } from 'react';
import { Heart, Star, ShoppingBag, Check, Eye } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useCart } from '../../context/CartContext';
import { formatINR } from '../../utils/formatCurrency';
import './CollectionProductCard.css';

export default function CollectionProductCard({
  product,
  viewMode = 'grid',
  priority = false,
}) {
  const { addToCart, toggleWishlist, isInWishlist, setSelectedProduct } = useCart();
  const [isAddedAnim, setIsAddedAnim] = useState(false);
  const navigate = useNavigate();

  const isWishlisted = isInWishlist(product.id);
  const imageSrc =
    product.main_image || product.image || '/assets/ps-perfumes-logo.webp';

  // Bottle / size options come from the product's own active, priced variants — never a fixed
  // list — so what the card shows is exactly what can be bought.
  const variants = useMemo(
    () => (product.variants || []).filter((v) => v.is_active !== false && Number(v.sale_price || v.price) > 0),
    [product.variants]
  );
  const inStock = (v) => Number(v?.stock_quantity ?? v?.stock ?? 0) > 0;
  const bottleLabel = (b) => {
    const s = String(b || '').toLowerCase();
    if (s.includes('pvc')) return 'PVC';
    if (s.includes('glass')) return 'Glass';
    return String(b || 'Standard');
  };
  const sizeKey = (s) => String(s || '').toLowerCase().replace(/\s+/g, '');
  const bottles = [...new Set(variants.map((v) => bottleLabel(v.bottle_type)))];
  const initialVariant = variants.find(inStock) || variants[0] || null;

  const [selectedBottle, setSelectedBottle] = useState(() => (initialVariant ? bottleLabel(initialVariant.bottle_type) : null));
  const [selectedSize, setSelectedSize] = useState(() => (initialVariant ? sizeKey(initialVariant.size_ml) : null));

  // Sizes available for the selected bottle (one entry per size, first variant wins)
  const sizeOptions = variants
    .filter((v) => bottleLabel(v.bottle_type) === selectedBottle)
    .filter((v, i, arr) => arr.findIndex((o) => sizeKey(o.size_ml) === sizeKey(v.size_ml)) === i);

  const currentVariant =
    variants.find((v) => bottleLabel(v.bottle_type) === selectedBottle && sizeKey(v.size_ml) === selectedSize) || null;
  const isUnavailable = variants.length === 0;
  const isOutOfStock = !isUnavailable && (!currentVariant || !inStock(currentVariant));

  const chooseBottle = (label) => {
    setSelectedBottle(label);
    // Keep the size if this bottle has it, otherwise pick its first (preferably in-stock) size
    const forBottle = variants.filter((v) => bottleLabel(v.bottle_type) === label);
    if (!forBottle.some((v) => sizeKey(v.size_ml) === selectedSize)) {
      const next = forBottle.find(inStock) || forBottle[0];
      setSelectedSize(next ? sizeKey(next.size_ml) : null);
    }
  };

  const price = currentVariant
    ? Number(currentVariant.sale_price || currentVariant.price)
    : Number(product.price) || 0;
  const comparePrice = currentVariant?.compare_at_price
    ? Number(currentVariant.compare_at_price)
    : Number(product.compare_at_price || product.originalPrice || null);
  const hasDiscount = comparePrice && comparePrice > price;
  const discountPercent = hasDiscount
    ? `-${Math.round(((comparePrice - price) / comparePrice) * 100)}%`
    : product.discountPercent && product.discountPercent.startsWith('-')
    ? product.discountPercent
    : null;

  // Only real rating data is shown; products currently have no stored rating, so the row is hidden
  const rating = Number(product.rating) || 0;
  const reviewCount = Number(product.review_count || product.reviewCount || 0);
  const hasReviews = reviewCount > 0 && rating > 0;
  const slug = product.slug || product.id;
  const brand = product.brand || 'PS PERFUMES';

  const handleAddToCart = (e) => {
    e.stopPropagation();
    // No variants: the product page explains availability; never add an invented variant
    if (isUnavailable) {
      navigate(`/product/${slug}`);
      return;
    }
    if (!currentVariant || isOutOfStock) return;
    addToCart(product, 1, currentVariant);
    setIsAddedAnim(true);
    setTimeout(() => setIsAddedAnim(false), 1800);
  };

  const handleWishlistClick = (e) => {
    e.stopPropagation();
    toggleWishlist(product);
  };

  const handleQuickView = (e) => {
    e.stopPropagation();
    setSelectedProduct(product);
  };

  const handleCardClick = () => {
    navigate(`/product/${slug}`);
  };

  const isListView = viewMode === 'list';

  return (
    <article
      className={`ps-col-card ${isListView ? 'is-list-view' : ''}`}
      onClick={handleCardClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        // Only when the card itself has focus: Enter on an inner button must not also navigate
        if (e.key === 'Enter' && e.target === e.currentTarget) handleCardClick();
      }}
      aria-label={`View ${product.name}`}
    >
      {/* 1. Media Area */}
      <div className="ps-col-card-media">
        <img
          src={imageSrc}
          alt={product.name}
          className="ps-col-card-img"
          loading={priority ? 'eager' : 'lazy'}
          width="400"
          height="400"
        />

        {/* Floating Top Right Wishlist Icon */}
        <button
          type="button"
          className={`ps-col-card-wish-floating ${isWishlisted ? 'is-active' : ''}`}
          onClick={handleWishlistClick}
          aria-label={isWishlisted ? 'Remove from wishlist' : 'Save to wishlist'}
          title="Wishlist"
        >
          <Heart
            size={16}
            fill={isWishlisted ? '#E31B23' : 'none'}
            color={isWishlisted ? '#E31B23' : '#171513'}
            strokeWidth={1.8}
          />
        </button>

        {/* Top Left Discount Badge */}
        {discountPercent && (
          <span className="ps-col-card-badge-discount" aria-label={`Discount ${discountPercent}`}>
            {discountPercent}
          </span>
        )}

        {/* Quick View Button on Desktop Hover */}
        <button
          type="button"
          className="ps-col-card-quickview"
          onClick={handleQuickView}
          aria-label="Quick View"
          title="Quick View"
        >
          <Eye size={15} />
          <span>Quick View</span>
        </button>
      </div>

      {/* 2. Content Details */}
      <div className="ps-col-card-body">
        <div className="ps-col-card-meta">
          <span className="ps-col-card-brand">{brand}</span>
          <span className="ps-col-card-category">{product.category || 'Collection'}</span>
        </div>

        <h3 className="ps-col-card-name" title={product.name}>
          {product.name}
        </h3>

        {/* List View Extra Details */}
        {isListView && product.description && (
          <p className="ps-col-card-description">
            {product.short_description || product.description.slice(0, 160) + '...'}
          </p>
        )}

        {/* Rating Row */}
        {hasReviews && (
        <div className="ps-col-card-rating">
          <div className="ps-col-card-stars" aria-hidden="true">
            {[...Array(5)].map((_, i) => (
              <Star
                key={i}
                size={12}
                fill={i < Math.floor(rating) ? '#C9A45C' : '#E8E4DC'}
                color={i < Math.floor(rating) ? '#C9A45C' : '#E8E4DC'}
              />
            ))}
          </div>
          <span className="ps-col-card-rating-num">
            {rating} ({reviewCount})
          </span>
        </div>
        )}

        {/* Pricing Row */}
        <div className="ps-col-card-pricing">
          {isUnavailable ? (
            <span className="ps-col-card-unavailable">Currently unavailable</span>
          ) : (
            <>
              <span className="ps-col-card-price">{formatINR(price)}</span>
              {hasDiscount && (
                <span className="ps-col-card-compare-price">
                  {formatINR(comparePrice)}
                </span>
              )}
              {isOutOfStock && <span className="ps-col-card-stock-note">Out of stock</span>}
            </>
          )}
        </div>

        {/* Variant selectors built from the product's real variants */}
        {!isUnavailable && (
          <div className="ps-col-card-variants" onClick={(e) => e.stopPropagation()}>
            {bottles.length > 1 && (
              <div className="ps-col-var-row" role="group" aria-label="Bottle">
                <span className="ps-col-var-lbl">Bottle:</span>
                <div className="ps-col-pills">
                  {bottles.map((b) => (
                    <button
                      key={b}
                      type="button"
                      className={`ps-col-pill ${selectedBottle === b ? 'is-active' : ''}`}
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
              <div className="ps-col-var-row" role="group" aria-label="Size">
                <span className="ps-col-var-lbl">Size:</span>
                <div className="ps-col-pills">
                  {sizeOptions.map((v) => {
                    const key = sizeKey(v.size_ml);
                    return (
                      <button
                        key={key}
                        type="button"
                        className={`ps-col-pill ${selectedSize === key ? 'is-active' : ''} ${inStock(v) ? '' : 'is-unavailable'}`}
                        aria-pressed={selectedSize === key}
                        onClick={() => setSelectedSize(key)}
                        title={inStock(v) ? undefined : 'Out of stock'}
                      >
                        {v.size_ml}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Action Controls: [ ADD TO CART ] [ ♡ ] */}
        <div className="ps-col-card-actions">
          <button
            type="button"
            className={`ps-col-card-add-btn ${isAddedAnim ? 'is-success' : ''}`}
            onClick={handleAddToCart}
            disabled={isOutOfStock}
            aria-label={
              isUnavailable
                ? `View details of ${product.name}`
                : isOutOfStock
                ? `${product.name} is out of stock in this option`
                : `Add ${product.name} to cart`
            }
          >
            {isAddedAnim ? (
              <>
                <Check size={14} strokeWidth={2.2} />
                <span>ADDED</span>
              </>
            ) : isUnavailable ? (
              <span>VIEW DETAILS</span>
            ) : isOutOfStock ? (
              <span>OUT OF STOCK</span>
            ) : (
              <>
                <ShoppingBag size={14} strokeWidth={1.8} />
                <span>ADD TO CART</span>
              </>
            )}
          </button>

          <button
            type="button"
            className={`ps-col-card-fav-btn ${isWishlisted ? 'is-active' : ''}`}
            onClick={handleWishlistClick}
            aria-label={isWishlisted ? 'Remove from wishlist' : 'Add to wishlist'}
            title={isWishlisted ? 'Wishlisted' : 'Add to Wishlist'}
          >
            <Heart
              size={15}
              fill={isWishlisted ? '#E31B23' : 'none'}
              color={isWishlisted ? '#E31B23' : '#171513'}
              strokeWidth={1.8}
            />
          </button>
        </div>
      </div>
    </article>
  );
}
