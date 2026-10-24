import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X, ShoppingBag, Check, Star, Minus, Plus } from 'lucide-react';
import { useCart } from '../context/CartContext';
import { formatINR } from '../utils/formatCurrency';
import './QuickAddModal.css';

/**
 * PS PERFUMES — Premium Quick Add / Variant Selection Modal
 * Warm ivory background, dark charcoal text, champagne-gold accents.
 */
export default function QuickAddModal({ product, isOpen, onClose }) {
  const { addToCart } = useCart();
  const [selectedBottle, setSelectedBottle] = useState('Glass');
  const [selectedSize, setSelectedSize] = useState('50 ML');
  const [quantity, setQuantity] = useState(1);
  const [isAddedAnim, setIsAddedAnim] = useState(false);

  // Normalization utilities
  const normalizeBottle = (bt) => {
    if (!bt) return 'Glass';
    const s = String(bt).toLowerCase();
    if (s.includes('pvc')) return 'PVC';
    return 'Glass';
  };

  const normalizeSize = (sz) => {
    if (!sz) return '50 ML';
    const s = String(sz).trim();
    const num = s.replace(/[^\d]/g, '');
    return num ? `${num} ML` : s.toUpperCase();
  };

  // Active variants from product data
  const variants = useMemo(() => {
    if (!product?.variants || !Array.isArray(product.variants)) return [];
    // Only active variants with a real price can be bought
    return product.variants.filter(
      (v) => v.active !== false && v.is_active !== false && Number(v.sale_price || v.price) > 0
    );
  }, [product]);

  const isAttar = product?.category?.toLowerCase() === 'attar';

  // Available bottle types — from the product's variants only (no invented options)
  const availableBottles = useMemo(() => {
    const set = new Set();
    variants.forEach((v) => set.add(normalizeBottle(v.bottle_type)));
    return Array.from(set);
  }, [variants]);

  // Reset defaults when product opens
  useEffect(() => {
    if (isOpen && product) {
      const defaultBottle = availableBottles.includes('Glass') ? 'Glass' : availableBottles[0] || 'Glass';
      setSelectedBottle(defaultBottle);

      // Look for appropriate size in that bottle or first available
      const sizesForBottle = variants
        .filter((v) => normalizeBottle(v.bottle_type) === defaultBottle)
        .map((v) => normalizeSize(v.size_ml));
      const fallbackSize = isAttar ? '6 ML' : '50 ML';
      const defaultSize = sizesForBottle.length > 0
        ? (sizesForBottle.includes(fallbackSize) ? fallbackSize : sizesForBottle[0])
        : fallbackSize;

      setSelectedSize(defaultSize);
      setQuantity(1);
      setIsAddedAnim(false);

      // Lock body scroll
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isOpen, product, availableBottles, variants, isAttar]);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Available sizes for currently selected bottle
  const availableSizes = useMemo(() => {
    const list = [];
    variants
      .filter((v) => normalizeBottle(v.bottle_type) === selectedBottle)
      .forEach((v) => {
        const norm = normalizeSize(v.size_ml);
        if (!list.includes(norm)) list.push(norm);
      });
    list.sort((a, b) => (parseInt(a, 10) || 0) - (parseInt(b, 10) || 0));
    return list;
  }, [variants, selectedBottle]);

  // Keep size valid when bottle changes
  const handleBottleChange = (bottle) => {
    setSelectedBottle(bottle);
    const newSizes = variants
      .filter((v) => normalizeBottle(v.bottle_type) === bottle)
      .map((v) => normalizeSize(v.size_ml));
    const fallbackSize = isAttar ? '6 ML' : '50 ML';
    if (!newSizes.includes(selectedSize)) {
      setSelectedSize(newSizes.includes(fallbackSize) ? fallbackSize : (newSizes[0] || fallbackSize));
    }
  };

  // Exact match only: falling back to another variant would sell a different size than the
  // one highlighted (bottle changes re-select a valid size in handleBottleChange)
  const selectedVariant = useMemo(() => {
    return (
      variants.find(
        (v) =>
          normalizeBottle(v.bottle_type) === selectedBottle &&
          normalizeSize(v.size_ml) === selectedSize
      ) || null
    );
  }, [variants, selectedBottle, selectedSize]);

  if (!isOpen || !product) return null;

  const imageSrc = product.main_image || product.image || '/assets/ps-perfumes-logo.webp';
  const price = selectedVariant
    ? Number(selectedVariant.sale_price || selectedVariant.price)
    : Number(product.price) || 0;
  const comparePrice = selectedVariant?.compare_at_price
    ? Number(selectedVariant.compare_at_price)
    : Number(product.compare_at_price || product.originalPrice || null);
  const hasDiscount = Boolean(comparePrice && comparePrice > price);
  const discountPercent = hasDiscount
    ? Math.round(((comparePrice - price) / comparePrice) * 100)
    : null;

  // Stock of the selected variant only; no selected variant means nothing can be bought
  const stock = selectedVariant ? Number(selectedVariant.stock_quantity ?? selectedVariant.stock ?? 0) : 0;
  const isOutOfStock = !selectedVariant || stock <= 0;

  const rating = Number(product.rating || 0);
  const reviewCount = Number(product.review_count || product.reviewCount || 0);
  const hasReviews = reviewCount > 0 && rating > 0;
  const categoryName = product.category || product.type || 'PERFUME';

  const handleAddToCart = (e) => {
    e.stopPropagation();
    if (isOutOfStock || !selectedVariant) return;

    addToCart(product, quantity, selectedVariant);
    setIsAddedAnim(true);
    setTimeout(() => {
      setIsAddedAnim(false);
      onClose();
    }, 600);
  };

  return createPortal(
    <div
      className="ps-quickadd-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="ps-quickadd-title"
    >
      <div className="ps-quickadd-modal" onClick={(e) => e.stopPropagation()}>
        {/* Close Button */}
        <button
          type="button"
          className="ps-quickadd-close-btn"
          onClick={onClose}
          aria-label="Close variant selector"
        >
          <X size={18} />
        </button>

        {/* Product Summary Header */}
        <div className="ps-quickadd-header">
          <div className="ps-quickadd-img-wrap">
            <img src={imageSrc} alt={product.name} className="ps-quickadd-img" />
          </div>

          <div className="ps-quickadd-header-info">
            <span className="ps-quickadd-category">{categoryName}</span>
            <h3 id="ps-quickadd-title" className="ps-quickadd-name">
              {product.name}
            </h3>

            {/* Compact Ratings (only when the product has reviews) */}
            {hasReviews && (
              <div className="ps-quickadd-rating-row">
                <div className="ps-quickadd-stars">
                  {[...Array(5)].map((_, i) => (
                    <Star
                      key={i}
                      size={12}
                      fill={i < Math.floor(rating) ? '#d4a017' : '#e5e7eb'}
                      color={i < Math.floor(rating) ? '#d4a017' : '#e5e7eb'}
                    />
                  ))}
                </div>
                <span className="ps-quickadd-rating-text">
                  {rating} ({reviewCount})
                </span>
              </div>
            )}

            {/* Price Preview */}
            <div className="ps-quickadd-price-header">
              <span className="ps-quickadd-price-val">{formatINR(price)}</span>
              {hasDiscount && (
                <span className="ps-quickadd-orig-price">{formatINR(comparePrice)}</span>
              )}
              {discountPercent && (
                <span className="ps-quickadd-discount-tag">{discountPercent}% OFF</span>
              )}
            </div>
          </div>
        </div>

        <div className="ps-quickadd-divider" />

        {/* Variant Selectors */}
        <div className="ps-quickadd-options">
          {/* 1. Bottle Type */}
          {availableBottles.length > 1 && (
            <div className="ps-quickadd-section">
              <div className="ps-quickadd-label-row">
                <span className="ps-quickadd-label">BOTTLE TYPE</span>
                <span className="ps-quickadd-selected-val">{selectedBottle}</span>
              </div>
              <div className="ps-quickadd-pills">
                {availableBottles.map((bt) => {
                  const isSelected = selectedBottle === bt;
                  return (
                    <button
                      key={bt}
                      type="button"
                      className={`ps-quickadd-pill ${isSelected ? 'is-selected' : ''}`}
                      onClick={() => handleBottleChange(bt)}
                    >
                      {bt}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* 2. Size */}
          <div className="ps-quickadd-section">
            <div className="ps-quickadd-label-row">
              <span className="ps-quickadd-label">SIZE</span>
              <span className="ps-quickadd-selected-val">{selectedSize}</span>
            </div>
            <div className="ps-quickadd-pills">
              {availableSizes.map((sz) => {
                const isSelected = selectedSize === sz;
                return (
                  <button
                    key={sz}
                    type="button"
                    className={`ps-quickadd-pill ${isSelected ? 'is-selected' : ''}`}
                    onClick={() => setSelectedSize(sz)}
                  >
                    {sz}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 3. Stock Status & Quantity Row */}
          <div className="ps-quickadd-meta-row">
            <div className="ps-quickadd-stock-info">
              {isOutOfStock ? (
                <span className="ps-stock-out">Out of Stock</span>
              ) : stock <= 5 ? (
                <span className="ps-stock-low">Only {stock} left in stock</span>
              ) : (
                <span className="ps-stock-available">✓ In Stock</span>
              )}
            </div>

            {/* Quantity Controls */}
            {!isOutOfStock && (
              <div className="ps-quickadd-qty-wrap">
                <button
                  type="button"
                  className="ps-quickadd-qty-btn"
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  aria-label="Decrease quantity"
                  disabled={quantity <= 1}
                >
                  <Minus size={13} />
                </button>
                <span className="ps-quickadd-qty-num">{quantity}</span>
                <button
                  type="button"
                  className="ps-quickadd-qty-btn"
                  onClick={() => setQuantity((q) => Math.min(stock, q + 1))}
                  aria-label="Increase quantity"
                  disabled={isOutOfStock || quantity >= stock}
                >
                  <Plus size={13} />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Primary Action Button */}
        <button
          type="button"
          className={`ps-quickadd-submit-btn ${isAddedAnim ? 'is-success' : ''}`}
          onClick={handleAddToCart}
          disabled={isOutOfStock}
          aria-label={`Add ${product.name} to cart`}
        >
          {isAddedAnim ? (
            <>
              <Check size={16} strokeWidth={2.4} />
              <span>ADDED TO BAG</span>
            </>
          ) : isOutOfStock ? (
            <span>OUT OF STOCK</span>
          ) : (
            <>
              <ShoppingBag size={16} strokeWidth={1.8} />
              <span>
                ADD TO CART &bull; {formatINR(price * quantity)}
              </span>
            </>
          )}
        </button>
      </div>
    </div>,
    document.body
  );
}
