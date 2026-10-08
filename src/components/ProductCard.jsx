import React, { useState, useMemo } from 'react';
import { Heart, Star, ShoppingBag, Check } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { formatINR } from '../utils/formatCurrency';
import QuickAddModal from './QuickAddModal';
import './ProductCard.css';

/**
 * PS PERFUMES — Luxury Homepage Product Card
 * Rebuilt following approved editorial luxury reference.
 * Clean, elegant, visually focused with 4:5 cinematic image and single ADD TO CART CTA.
 */
export default function ProductCard({ product, priority = false }) {
  const { addToCart, toggleWishlist, isInWishlist } = useCart();
  const [isAddedAnim, setIsAddedAnim] = useState(false);
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  const navigate = useNavigate();

  const isWishlisted = isInWishlist(product.id);
  const imageSrc = product.main_image || product.image || '/assets/prod-royal-amber.webp';
  const slug = product.slug || product.id;

  // Normalization helpers
  const normalizeBottle = (b) => {
    if (!b) return 'Glass';
    const s = String(b).toLowerCase();
    if (s.includes('pvc')) return 'PVC';
    return 'Glass';
  };

  const normalizeSize = (sz) => {
    if (!sz) return '50 ML';
    const s = String(sz).trim();
    const num = s.replace(/[^\d]/g, '');
    return num ? `${num} ML` : s.toUpperCase();
  };

  // Active variants
  const activeVariants = useMemo(() => {
    if (!product?.variants || !Array.isArray(product.variants)) return [];
    return product.variants.filter((v) => v.active !== false && v.is_active !== false);
  }, [product]);

  // Default displayed variant: flagship Glass 50ml, or first active variant
  const defaultVariant = useMemo(() => {
    if (activeVariants.length === 0) return null;
    const glass50 = activeVariants.find(
      (v) => normalizeBottle(v.bottle_type) === 'Glass' && normalizeSize(v.size_ml) === '50 ML'
    );
    if (glass50) return glass50;
    const glassAny = activeVariants.find((v) => normalizeBottle(v.bottle_type) === 'Glass');
    if (glassAny) return glassAny;
    return activeVariants[0];
  }, [activeVariants]);

  // Dynamic database prices
  const displayPrice = defaultVariant
    ? Number(defaultVariant.sale_price || defaultVariant.price)
    : Number(product.price || 999);

  const displayComparePrice = defaultVariant?.compare_at_price
    ? Number(defaultVariant.compare_at_price)
    : Number(product.compare_at_price || product.originalPrice || null);

  const hasDiscount = Boolean(displayComparePrice && displayComparePrice > displayPrice);

  // Ratings calculation
  const rating = Number(product.rating || 0);
  const reviewCount = Number(product.review_count || product.reviewCount || 0);
  const hasReviews = reviewCount > 0 && rating > 0;

  // Category
  const categoryText = (product.category || product.type || 'PERFUME').toUpperCase();

  // Navigation on card click
  const handleCardClick = () => {
    navigate(`/product/${slug}`);
  };

  // Wishlist toggle
  const handleWishlistClick = (e) => {
    e.stopPropagation();
    toggleWishlist(product);
  };

  // Add to cart click
  const handleAddToCart = (e) => {
    e.stopPropagation();
    // If only one variant, add directly!
    if (activeVariants.length <= 1) {
      const chosen = activeVariants[0] || {
        bottle_type: 'Glass Bottle',
        size_ml: '50 ml',
        price: displayPrice,
      };
      addToCart(product, 1, chosen);
      setIsAddedAnim(true);
      setTimeout(() => setIsAddedAnim(false), 1800);
    } else {
      // Multiple variants: open Quick Add modal!
      setIsQuickAddOpen(true);
    }
  };

  return (
    <>
      <article
        className="ps-pcard"
        onClick={handleCardClick}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleCardClick();
        }}
        aria-label={`View ${product.name}`}
      >
        {/* 1. Large 4:5 Cinematic Product Image Container */}
        <div className="ps-pcard-media">
          <img
            src={imageSrc}
            alt={product.name}
            className="ps-pcard-img"
            loading={priority ? 'eager' : 'lazy'}
            width="400"
            height="500"
          />

          {/* Optional Badges (only if active in Supabase) */}
          <div className="ps-pcard-badges">
            {product.bestseller && (
              <span className="ps-pcard-badge ps-badge-bestseller">BESTSELLER</span>
            )}
            {product.new_arrival && (
              <span className="ps-pcard-badge ps-badge-new">NEW ARRIVAL</span>
            )}
          </div>

          {/* Top-Right Circular Wishlist Button */}
          <button
            type="button"
            className={`ps-pcard-wishlist-btn ${isWishlisted ? 'is-active' : ''}`}
            onClick={handleWishlistClick}
            aria-label={isWishlisted ? 'Remove from wishlist' : 'Add to wishlist'}
            title={isWishlisted ? 'In Wishlist' : 'Add to Wishlist'}
          >
            <Heart
              size={16}
              fill={isWishlisted ? '#e31b23' : 'none'}
              color={isWishlisted ? '#e31b23' : '#171513'}
              strokeWidth={1.8}
            />
          </button>
        </div>

        {/* 2. Product Details */}
        <div className="ps-pcard-details">
          {/* Category */}
          <span className="ps-pcard-type">{categoryText}</span>

          {/* Product Name */}
          <h3 className="ps-pcard-title" title={product.name}>
            {product.name}
          </h3>

          {/* Compact Ratings */}
          <div className="ps-pcard-rating-row">
            {hasReviews ? (
              <>
                <div className="ps-pcard-stars" aria-hidden="true">
                  {[...Array(5)].map((_, i) => (
                    <Star
                      key={i}
                      size={13}
                      fill={i < Math.floor(rating) ? '#d4a017' : '#e5e7eb'}
                      color={i < Math.floor(rating) ? '#d4a017' : '#e5e7eb'}
                    />
                  ))}
                </div>
                <span className="ps-pcard-rating-text">
                  {rating} ({reviewCount})
                </span>
              </>
            ) : (
              <span className="ps-pcard-no-reviews">No reviews yet</span>
            )}
          </div>

          {/* Pricing Row */}
          <div className="ps-pcard-pricing-row">
            <span className="ps-pcard-price">{formatINR(displayPrice)}</span>
            {hasDiscount && (
              <span className="ps-pcard-orig-price">{formatINR(displayComparePrice)}</span>
            )}
          </div>

          {/* Single Primary Action: ADD TO CART */}
          <button
            type="button"
            className={`ps-pcard-add-btn ${isAddedAnim ? 'is-success' : ''}`}
            onClick={handleAddToCart}
            aria-label={`Add ${product.name} to cart`}
          >
            {isAddedAnim ? (
              <>
                <Check size={16} strokeWidth={2.4} />
                <span>ADDED</span>
              </>
            ) : (
              <>
                <ShoppingBag size={15} strokeWidth={1.8} />
                <span>ADD TO CART</span>
              </>
            )}
          </button>
        </div>
      </article>

      {/* Quick Add Modal (opened when customer clicks ADD TO CART on multi-variant product) */}
      {isQuickAddOpen && (
        <QuickAddModal
          product={product}
          isOpen={isQuickAddOpen}
          onClose={() => setIsQuickAddOpen(false)}
        />
      )}
    </>
  );
}
