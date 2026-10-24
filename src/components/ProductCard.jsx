import React, { useState } from 'react';
import { ShoppingBag, Check } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { formatINR } from '../utils/formatCurrency';
import { defaultVariant, variantPrice, variantStock, variantComparePrice } from '../utils/productVariants';
import './ProductCard.css';

/**
 * PS PERFUMES — storefront product card: image, name, price and a single ADD TO CART.
 * The price shown is the default variant's price (lowest-priced in stock), and ADD TO CART adds
 * exactly that variant; the bag confirms the bottle and size. Other bottles and sizes are chosen
 * on the product page.
 */
export default function ProductCard({ product, priority = false }) {
  const { addToCart } = useCart();
  const [isAddedAnim, setIsAddedAnim] = useState(false);
  const navigate = useNavigate();

  const imageSrc = product.main_image || product.image || '/assets/ps-perfumes-logo.webp';
  const slug = product.slug || product.id;

  const variant = defaultVariant(product);
  const price = variant ? variantPrice(variant) : 0;
  const comparePrice = variant ? variantComparePrice(variant) : 0;
  const isUnavailable = !variant;
  const isSoldOut = Boolean(variant) && variantStock(variant) <= 0;

  const handleCardClick = () => {
    navigate(`/product/${slug}`);
  };

  const handleAddToCart = (e) => {
    e.stopPropagation();
    // Nothing purchasable: the product page explains availability (never add an invented variant)
    if (isUnavailable || isSoldOut) {
      handleCardClick();
      return;
    }
    addToCart(product, 1, variant);
    setIsAddedAnim(true);
    setTimeout(() => setIsAddedAnim(false), 1800);
  };

  return (
    <article
      className="ps-pcard"
      onClick={handleCardClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        // Only when the card itself has focus: Enter on the button must not also navigate
        if (e.key === 'Enter' && e.target === e.currentTarget) handleCardClick();
      }}
      aria-label={`View ${product.name}`}
    >
      <div className="ps-pcard-media">
        <img
          src={imageSrc}
          alt={product.name}
          className="ps-pcard-img"
          loading={priority ? 'eager' : 'lazy'}
          width="400"
          height="440"
        />
      </div>

      <div className="ps-pcard-details">
        <h3 className="ps-pcard-title" title={product.name}>
          {product.name}
        </h3>

        <div className="ps-pcard-pricing-row">
          {isUnavailable ? (
            <span className="ps-pcard-price is-muted">Currently unavailable</span>
          ) : (
            <>
              <span className="ps-pcard-price">{formatINR(price)}</span>
              {comparePrice > 0 && <span className="ps-pcard-orig-price">{formatINR(comparePrice)}</span>}
            </>
          )}
        </div>

        <button
          type="button"
          className={`ps-pcard-add-btn ${isAddedAnim ? 'is-success' : ''} ${isSoldOut || isUnavailable ? 'is-soldout' : ''}`}
          onClick={handleAddToCart}
          aria-label={
            isUnavailable
              ? `${product.name} is unavailable — view details`
              : isSoldOut
              ? `${product.name} is sold out — view details`
              : `Add ${product.name} (${variant.bottle_type}, ${variant.size_ml}) to cart`
          }
        >
          {isSoldOut ? (
            <span>SOLD OUT</span>
          ) : isUnavailable ? (
            <span>VIEW DETAILS</span>
          ) : isAddedAnim ? (
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
  );
}
