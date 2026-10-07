import React, { useState } from 'react';
import { Heart, Star, ShoppingBag, Check, Eye } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { formatINR } from '../utils/formatCurrency';
import './ProductCard.css';

export default function ProductCard({ product, priority = false }) {
  const { addToCart, toggleWishlist, isInWishlist, setSelectedProduct } = useCart();
  const [isAddedAnim, setIsAddedAnim] = useState(false);
  const [selectedBottle, setSelectedBottle] = useState('Glass');
  const [selectedSize, setSelectedSize] = useState('50ml');
  const navigate = useNavigate();

  const isWishlisted = isInWishlist(product.id);
  const imageSrc = product.main_image || product.image || '/assets/prod-royal-amber.webp';
  const rating = product.rating || 5.0;
  const reviewCount = product.review_count || product.reviewCount || 24;
  const slug = product.slug || product.id;

  const normalizeBottle = (b) => (b && String(b).toLowerCase().includes('pvc') ? 'PVC' : 'Glass');
  const normalizeSz = (s) => (s ? String(s).toLowerCase().replace(/\s+/g, '') : '50ml');

  const currentVariant = product.variants?.find((v) =>
    normalizeBottle(v.bottle_type) === selectedBottle &&
    normalizeSz(v.size_ml) === normalizeSz(selectedSize)
  ) || product.variants?.[0] || null;

  const price = currentVariant ? Number(currentVariant.sale_price || currentVariant.price) : (Number(product.price) || 999);
  const comparePrice = currentVariant?.compare_at_price ? Number(currentVariant.compare_at_price) : (product.compare_at_price || product.originalPrice);

  const handleAddToCart = (e) => {
    e.stopPropagation();
    const chosenVariant = currentVariant || {
      bottle_type: selectedBottle === 'Glass' ? 'Glass Bottle' : 'PVC Bottle',
      size_ml: selectedSize,
      price: price,
    };
    addToCart(product, 1, chosenVariant);
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

  return (
    <div
      className="ps-pcard"
      onClick={handleCardClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter') handleCardClick();
      }}
    >
      {/* Image Container with Badges */}
      <div className="ps-pcard-media">
        <img
          src={imageSrc}
          alt={product.name}
          className="ps-pcard-img"
          loading={priority ? 'eager' : 'lazy'}
          width="400"
          height="400"
        />

        {/* Top Badges: New Arrival / Bestseller */}
        <div className="ps-pcard-badges">
          {product.new_arrival && (
            <span className="ps-pcard-badge ps-badge-new">NEW ARRIVAL</span>
          )}
          {product.bestseller && (
            <span className="ps-pcard-badge ps-badge-primary">BESTSELLER</span>
          )}
          {!product.new_arrival && !product.bestseller && product.badge && (
            <span className="ps-pcard-badge ps-badge-primary">{product.badge}</span>
          )}
          {product.discountPercent && (
            <span className="ps-pcard-badge ps-badge-discount">{product.discountPercent}</span>
          )}
        </div>

        {/* Quick View Button (hover desktop) */}
        <button
          type="button"
          className="ps-pcard-quickview-btn"
          onClick={handleQuickView}
          aria-label="Quick view"
          title="Quick View"
        >
          <Eye size={16} />
        </button>

        {/* Wishlist Button */}
        <button
          type="button"
          className={`ps-pcard-wishlist-btn ${isWishlisted ? 'is-active' : ''}`}
          onClick={handleWishlistClick}
          aria-label={isWishlisted ? 'Remove from wishlist' : 'Add to wishlist'}
        >
          <Heart
            size={16}
            fill={isWishlisted ? '#e31b23' : 'none'}
            color={isWishlisted ? '#e31b23' : '#111111'}
          />
        </button>
      </div>

      {/* Product Content Details */}
      <div className="ps-pcard-details">
        <span className="ps-pcard-type">{product.category || product.type}</span>
        <h3 className="ps-pcard-title">{product.name}</h3>

        {/* Rating Stars */}
        <div className="ps-pcard-rating-row">
          <div className="ps-pcard-stars">
            {[...Array(5)].map((_, i) => (
              <Star
                key={i}
                size={12}
                fill={i < Math.floor(rating) ? '#f59e0b' : '#e5e7eb'}
                color={i < Math.floor(rating) ? '#f59e0b' : '#e5e7eb'}
              />
            ))}
          </div>
          <span className="ps-pcard-rating-text">
            {rating} ({reviewCount})
          </span>
        </div>

        {/* Minimal Luxury Variant Selectors */}
        <div className="ps-pcard-variants-wrap" onClick={(e) => e.stopPropagation()}>
          <div className="ps-pcard-var-row">
            <span className="ps-pcard-var-label">Bottle:</span>
            <div className="ps-pcard-pill-group">
              <button
                type="button"
                className={`ps-pcard-pill ${selectedBottle === 'Glass' ? 'is-active' : ''}`}
                onClick={() => setSelectedBottle('Glass')}
              >
                Glass
              </button>
              <button
                type="button"
                className={`ps-pcard-pill ${selectedBottle === 'PVC' ? 'is-active' : ''}`}
                onClick={() => setSelectedBottle('PVC')}
              >
                PVC
              </button>
            </div>
          </div>

          <div className="ps-pcard-var-row">
            <span className="ps-pcard-var-label">Size:</span>
            <div className="ps-pcard-pill-group">
              {['30ml', '50ml', '100ml'].map((sz) => (
                <button
                  key={sz}
                  type="button"
                  className={`ps-pcard-pill ${normalizeSz(selectedSize) === sz ? 'is-active' : ''}`}
                  onClick={() => setSelectedSize(sz)}
                >
                  {sz.replace('ml', '')}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Price & Add to Bag */}
        <div className="ps-pcard-pricing-row">
          <div className="ps-pcard-prices">
            <span className="ps-pcard-price">{formatINR(price)}</span>
            {comparePrice && comparePrice > price && (
              <span className="ps-pcard-orig-price">{formatINR(comparePrice)}</span>
            )}
          </div>

          <button
            type="button"
            className={`ps-pcard-add-btn ${isAddedAnim ? 'is-success' : ''}`}
            onClick={handleAddToCart}
            aria-label={`Add ${product.name} to bag`}
          >
            {isAddedAnim ? (
              <>
                <Check size={14} />
                <span>ADDED</span>
              </>
            ) : (
              <>
                <ShoppingBag size={14} />
                <span>ADD</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
