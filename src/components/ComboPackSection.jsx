import React, { useState } from 'react';
import { Star, ShoppingBag, Heart, Check } from 'lucide-react';
import { COMBO_PRODUCTS } from '../data/products';
import { formatINR } from '../utils/formatCurrency';
import { useCart } from '../context/CartContext';
import './ComboPackSection.css';

export default function ComboPackSection() {
  const { addToCart, toggleWishlist, isInWishlist, setSelectedProduct } = useCart();
  const [addedIds, setAddedIds] = useState({});

  const handleAddToCart = (e, product) => {
    e.stopPropagation();
    addToCart(product, 1);
    setAddedIds((prev) => ({ ...prev, [product.id]: true }));
    setTimeout(() => {
      setAddedIds((prev) => ({ ...prev, [product.id]: false }));
    }, 1800);
  };

  const handleWishlist = (e, product) => {
    e.stopPropagation();
    toggleWishlist(product);
  };

  return (
    <section id="combo-pack" className="ps-combopack-section" aria-label="Combo Pack Offers">
      <div className="ps-combopack-container">
        {/* Section Heading matching reference screenshot */}
        <div className="ps-combopack-header">
          <h2 className="ps-combopack-heading">Combo Pack</h2>
        </div>

        {/* Wide 4-Column Product Grid */}
        <div className="ps-combopack-grid">
          {COMBO_PRODUCTS.map((product) => {
            const isWishlisted = isInWishlist(product.id);
            const isAdded = !!addedIds[product.id];

            return (
              <div
                key={product.id}
                className="ps-combopack-card"
                onClick={() => setSelectedProduct(product)}
                role="button"
                tabIndex={0}
                aria-label={`View ${product.name}`}
              >
                {/* Media Container with Discount Badge & Wishlist */}
                <div className="ps-combopack-media">
                  <img
                    src={product.image}
                    alt={product.name}
                    className="ps-combopack-img"
                    loading="lazy"
                  />

                  {/* Top-Left Discount Badge */}
                  {product.discountPercent && (
                    <span className="ps-combopack-discount-badge">
                      {product.discountPercent}
                    </span>
                  )}

                  {/* Top-Right Wishlist Button */}
                  <button
                    type="button"
                    className="ps-combopack-wishlist-btn"
                    onClick={(e) => handleWishlist(e, product)}
                    aria-label={isWishlisted ? 'Remove from wishlist' : 'Add to wishlist'}
                  >
                    <Heart
                      size={16}
                      fill={isWishlisted ? '#eb1c24' : 'none'}
                      color={isWishlisted ? '#eb1c24' : '#111111'}
                    />
                  </button>
                </div>

                {/* Card Content underneath */}
                <div className="ps-combopack-content">
                  <span className="ps-combopack-brand">{product.brand || 'PS PERFUMES'}</span>
                  <h3 className="ps-combopack-title">{product.name}</h3>

                  {/* Star Rating Row */}
                  <div className="ps-combopack-rating-row">
                    <div className="ps-combopack-stars">
                      {[...Array(5)].map((_, i) => (
                        <Star
                          key={i}
                          size={13}
                          fill={i < Math.floor(product.rating) ? '#f59e0b' : '#e5e7eb'}
                          color={i < Math.floor(product.rating) ? '#f59e0b' : '#e5e7eb'}
                        />
                      ))}
                    </div>
                    <span className="ps-combopack-review-count">
                      {product.reviewCount ? `${product.reviewCount} reviews` : 'No reviews'}
                    </span>
                  </div>

                  {/* Pricing Row in Indian Rupees */}
                  <div className="ps-combopack-prices">
                    <span className="ps-combopack-sale-price">
                      {formatINR(product.price, { showDecimals: true })}
                    </span>
                    {product.originalPrice && (
                      <span className="ps-combopack-orig-price">
                        {formatINR(product.originalPrice, { showDecimals: true })}
                      </span>
                    )}
                  </div>
                </div>

                {/* Bottom Full-Width Gold ADD TO CART Button */}
                <button
                  type="button"
                  className={`ps-combopack-add-btn ${isAdded ? 'is-added' : ''}`}
                  onClick={(e) => handleAddToCart(e, product)}
                  aria-label={`Add ${product.name} to cart`}
                >
                  {isAdded ? (
                    <>
                      <Check size={16} />
                      <span>ADDED TO CART</span>
                    </>
                  ) : (
                    <>
                      <ShoppingBag size={16} />
                      <span>ADD TO CART</span>
                    </>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
