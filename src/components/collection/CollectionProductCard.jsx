import React, { useState } from 'react';
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
    product.main_image || product.image || '/assets/prod-royal-amber.webp';
  const price = Number(product.price) || 999;
  const comparePrice = Number(product.compare_at_price || product.originalPrice) || null;
  const hasDiscount = comparePrice && comparePrice > price;
  const discountPercent = hasDiscount
    ? `-${Math.round(((comparePrice - price) / comparePrice) * 100)}%`
    : product.discountPercent && product.discountPercent.startsWith('-')
    ? product.discountPercent
    : null;

  const rating = Number(product.rating) || 5.0;
  const reviewCount = product.review_count || product.reviewCount || 24;
  const slug = product.slug || product.id;
  const brand = product.brand || 'PS PERFUMES';

  const handleAddToCart = (e) => {
    e.stopPropagation();
    addToCart(product, 1);
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
        if (e.key === 'Enter') handleCardClick();
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

        {/* Pricing Row */}
        <div className="ps-col-card-pricing">
          <span className="ps-col-card-price">{formatINR(price)}</span>
          {hasDiscount && (
            <span className="ps-col-card-compare-price">
              {formatINR(comparePrice)}
            </span>
          )}
        </div>

        {/* Action Controls: [ ADD TO CART ] [ ♡ ] */}
        <div className="ps-col-card-actions">
          <button
            type="button"
            className={`ps-col-card-add-btn ${isAddedAnim ? 'is-success' : ''}`}
            onClick={handleAddToCart}
            aria-label={`Add ${product.name} to cart`}
          >
            {isAddedAnim ? (
              <>
                <Check size={14} strokeWidth={2.2} />
                <span>ADDED</span>
              </>
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
