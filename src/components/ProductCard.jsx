import React, { useState } from 'react';
import { Heart, Star, ShoppingBag, Check } from 'lucide-react';
import { useCart } from '../context/CartContext';
import { formatINR } from '../utils/formatCurrency';
import './ProductCard.css';

export default function ProductCard({ product }) {
  const { addToCart, toggleWishlist, isInWishlist, setSelectedProduct } = useCart();
  const [isAddedAnim, setIsAddedAnim] = useState(false);
  const isWishlisted = isInWishlist(product.id);

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

  const handleCardClick = () => {
    setSelectedProduct(product);
  };

  return (
    <div className="ps-pcard" onClick={handleCardClick} role="button" tabIndex={0}>
      {/* Image Container with Badges */}
      <div className="ps-pcard-media">
        <img
          src={product.image}
          alt={product.name}
          className="ps-pcard-img"
          loading="lazy"
        />

        {/* Top Badges */}
        <div className="ps-pcard-badges">
          {product.badge && (
            <span className="ps-pcard-badge ps-badge-primary">{product.badge}</span>
          )}
          {product.discountPercent && (
            <span className="ps-pcard-badge ps-badge-discount">{product.discountPercent}</span>
          )}
        </div>

        {/* Wishlist Button */}
        <button
          type="button"
          className={`ps-pcard-wishlist-btn ${isWishlisted ? 'is-active' : ''}`}
          onClick={handleWishlistClick}
          aria-label={isWishlisted ? 'Remove from wishlist' : 'Add to wishlist'}
        >
          <Heart size={16} fill={isWishlisted ? '#eb1c24' : 'none'} color={isWishlisted ? '#eb1c24' : '#111111'} />
        </button>
      </div>

      {/* Product Content Details */}
      <div className="ps-pcard-details">
        <span className="ps-pcard-type">{product.type || product.category}</span>
        <h3 className="ps-pcard-title">{product.name}</h3>

        {/* Rating Stars */}
        <div className="ps-pcard-rating-row">
          <div className="ps-pcard-stars">
            {[...Array(5)].map((_, i) => (
              <Star
                key={i}
                size={12}
                fill={i < Math.floor(product.rating) ? '#f59e0b' : '#e5e7eb'}
                color={i < Math.floor(product.rating) ? '#f59e0b' : '#e5e7eb'}
              />
            ))}
          </div>
          <span className="ps-pcard-rating-text">
            {product.rating} ({product.reviewCount})
          </span>
        </div>

        {/* Price & Add to Bag */}
        <div className="ps-pcard-pricing-row">
          <div className="ps-pcard-prices">
            <span className="ps-pcard-price">{formatINR(product.price)}</span>
            {product.originalPrice && (
              <span className="ps-pcard-orig-price">{formatINR(product.originalPrice)}</span>
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
                <span>ADD TO BAG</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
