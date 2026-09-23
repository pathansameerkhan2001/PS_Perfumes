import React, { useState, useEffect } from 'react';
import { X, Heart, Star, ShoppingBag, Zap, ShieldCheck, Truck, Sparkles, Check } from 'lucide-react';
import { useCart } from '../context/CartContext';
import { formatINR } from '../utils/formatCurrency';
import './ProductDetailModal.css';

export default function ProductDetailModal() {
  const {
    selectedProduct,
    setSelectedProduct,
    addToCart,
    toggleWishlist,
    isInWishlist,
    setIsCheckoutOpen,
  } = useCart();

  const [selectedSize, setSelectedSize] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [activeImage, setActiveImage] = useState(null);
  const [isAdded, setIsAdded] = useState(false);

  useEffect(() => {
    if (selectedProduct) {
      setSelectedSize(selectedProduct.sizeOptions?.[0] || '100ml');
      setActiveImage(selectedProduct.image);
      setQuantity(1);
      setIsAdded(false);
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [selectedProduct]);

  if (!selectedProduct) return null;

  const isWishlisted = isInWishlist(selectedProduct.id);

  const handleAdd = () => {
    addToCart(selectedProduct, quantity, selectedSize);
    setIsAdded(true);
    setTimeout(() => setIsAdded(false), 2000);
  };

  const handleBuyNow = () => {
    addToCart(selectedProduct, quantity, selectedSize);
    setSelectedProduct(null);
    setIsCheckoutOpen(true);
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
                src={activeImage || selectedProduct.image}
                alt={selectedProduct.name}
                className="ps-pdetail-main-img"
              />
              {selectedProduct.badge && (
                <span className="ps-pdetail-badge">{selectedProduct.badge}</span>
              )}
            </div>

            {/* Thumbnail switcher if secondary image exists */}
            {selectedProduct.secondaryImage && (
              <div className="ps-pdetail-thumbs">
                <button
                  type="button"
                  className={`ps-pdetail-thumb-btn ${activeImage === selectedProduct.image ? 'is-active' : ''}`}
                  onClick={() => setActiveImage(selectedProduct.image)}
                >
                  <img src={selectedProduct.image} alt="Flacon View" />
                </button>
                <button
                  type="button"
                  className={`ps-pdetail-thumb-btn ${activeImage === selectedProduct.secondaryImage ? 'is-active' : ''}`}
                  onClick={() => setActiveImage(selectedProduct.secondaryImage)}
                >
                  <img src={selectedProduct.secondaryImage} alt="Packaging View" />
                </button>
              </div>
            )}
          </div>

          {/* Right Column: Information & Purchasing */}
          <div className="ps-pdetail-info">
            <div className="ps-pdetail-brand-tag">PS PERFUMES • HAUTE PARFUMERIE</div>
            <h2 id="pdetail-title" className="ps-pdetail-title">{selectedProduct.name}</h2>
            <div className="ps-pdetail-type">{selectedProduct.type} • {selectedProduct.category}</div>

            {/* Rating Stars & Count */}
            <div className="ps-pdetail-rating-row">
              <div className="ps-pdetail-stars">
                {[...Array(5)].map((_, i) => (
                  <Star
                    key={i}
                    size={14}
                    fill={i < Math.floor(selectedProduct.rating) ? '#f59e0b' : '#e5e7eb'}
                    color={i < Math.floor(selectedProduct.rating) ? '#f59e0b' : '#e5e7eb'}
                  />
                ))}
              </div>
              <span className="ps-pdetail-rating-num">{selectedProduct.rating} / 5.0</span>
              <span className="ps-pdetail-review-count">({selectedProduct.reviewCount} Connoisseur Reviews)</span>
            </div>

            {/* Price Row in INR */}
            <div className="ps-pdetail-price-box">
              <span className="ps-pdetail-current-price">{formatINR(selectedProduct.price)}</span>
              {selectedProduct.originalPrice && (
                <span className="ps-pdetail-orig-price">{formatINR(selectedProduct.originalPrice)}</span>
              )}
              {selectedProduct.discountPercent && (
                <span className="ps-pdetail-discount-tag">{selectedProduct.discountPercent}</span>
              )}
              <span className="ps-pdetail-tax-note">Inclusive of all taxes • Free Delivery Over ₹999</span>
            </div>

            {/* Narrative Description */}
            <p className="ps-pdetail-description">{selectedProduct.description}</p>

            {/* Olfactory Pyramid */}
            <div className="ps-pdetail-pyramid">
              <h4 className="ps-pyramid-title">
                <Sparkles size={14} color="#c5a059" />
                <span>THE OLFACTORY PYRAMID</span>
              </h4>

              {selectedProduct.topNotes && (
                <div className="ps-pyramid-row">
                  <span className="ps-pyramid-tier">TOP NOTES:</span>
                  <span className="ps-pyramid-notes">{selectedProduct.topNotes.join(' • ')}</span>
                </div>
              )}

              {selectedProduct.heartNotes && (
                <div className="ps-pyramid-row">
                  <span className="ps-pyramid-tier">HEART NOTES:</span>
                  <span className="ps-pyramid-notes">{selectedProduct.heartNotes.join(' • ')}</span>
                </div>
              )}

              {selectedProduct.baseNotes && (
                <div className="ps-pyramid-row">
                  <span className="ps-pyramid-tier">BASE NOTES:</span>
                  <span className="ps-pyramid-notes">{selectedProduct.baseNotes.join(' • ')}</span>
                </div>
              )}
            </div>

            {/* Longevity & Sillage badges */}
            <div className="ps-pdetail-specs">
              {selectedProduct.longevity && (
                <div className="ps-spec-badge">
                  <strong>Longevity:</strong> {selectedProduct.longevity}
                </div>
              )}
              {selectedProduct.projection && (
                <div className="ps-spec-badge">
                  <strong>Sillage:</strong> {selectedProduct.projection}
                </div>
              )}
            </div>

            {/* Size Options */}
            {selectedProduct.sizeOptions?.length > 1 && (
              <div className="ps-pdetail-sizes">
                <span className="ps-sizes-label">SELECT FLACON SIZE:</span>
                <div className="ps-sizes-options">
                  {selectedProduct.sizeOptions.map((size) => (
                    <button
                      key={size}
                      type="button"
                      className={`ps-size-pill ${selectedSize === size ? 'is-active' : ''}`}
                      onClick={() => setSelectedSize(size)}
                    >
                      {size}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Quantity Counter & Action Buttons */}
            <div className="ps-pdetail-actions">
              <div className="ps-qty-counter">
                <button
                  type="button"
                  className="ps-qty-btn"
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  aria-label="Decrease quantity"
                >
                  -
                </button>
                <span className="ps-qty-val">{quantity}</span>
                <button
                  type="button"
                  className="ps-qty-btn"
                  onClick={() => setQuantity((q) => q + 1)}
                  aria-label="Increase quantity"
                >
                  +
                </button>
              </div>

              <button
                type="button"
                className={`ps-pdetail-add-bag-btn ${isAdded ? 'is-success' : ''}`}
                onClick={handleAdd}
              >
                {isAdded ? (
                  <>
                    <Check size={16} />
                    <span>ADDED TO BAG</span>
                  </>
                ) : (
                  <>
                    <ShoppingBag size={16} />
                    <span>ADD TO BAG • {formatINR(selectedProduct.price * quantity)}</span>
                  </>
                )}
              </button>

              <button
                type="button"
                className={`ps-pdetail-wishlist-toggle ${isWishlisted ? 'is-active' : ''}`}
                onClick={() => toggleWishlist(selectedProduct)}
                aria-label={isWishlisted ? 'Remove from wishlist' : 'Save to wishlist'}
              >
                <Heart size={18} fill={isWishlisted ? '#eb1c24' : 'none'} color={isWishlisted ? '#eb1c24' : '#111111'} />
              </button>
            </div>

            {/* Instant Buy Now Button */}
            <button
              type="button"
              className="ps-pdetail-buy-now-btn"
              onClick={handleBuyNow}
            >
              <Zap size={16} color="#c5a059" />
              <span>BUY IT NOW (INSTANT CHECKOUT)</span>
            </button>

            {/* Luxury Delivery & Reassurance Footer */}
            <div className="ps-pdetail-perks">
              <div className="ps-perk-item">
                <Truck size={15} color="#c5a059" />
                <span>Free Express Shipping Across India Over ₹999</span>
              </div>
              <div className="ps-perk-item">
                <ShieldCheck size={15} color="#c5a059" />
                <span>Guaranteed 100% Genuine Distillation</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
