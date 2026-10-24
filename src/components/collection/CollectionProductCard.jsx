import React, { useState } from 'react';
import { ShoppingBag, Check } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useCart } from '../../context/CartContext';
import { formatINR } from '../../utils/formatCurrency';
import { defaultVariant, variantPrice, variantStock, variantComparePrice } from '../../utils/productVariants';
import './CollectionProductCard.css';

/**
 * Collection (category page) card: image, name, price and a single ADD TO CART.
 * Same rule as the homepage/shop card: the price shown belongs to the default variant and
 * ADD TO CART adds exactly that variant; other bottles and sizes are chosen on the product page.
 */
export default function CollectionProductCard({ product, viewMode = 'grid', priority = false }) {
  const { addToCart } = useCart();
  const [isAddedAnim, setIsAddedAnim] = useState(false);
  const navigate = useNavigate();

  const imageSrc = product.main_image || product.image || '/assets/ps-perfumes-logo.webp';
  const slug = product.slug || product.id;

  const variant = defaultVariant(product);
  const price = variant ? variantPrice(variant) : 0;
  // Boolean/number guards: a bare 0 here would be rendered by React next to the price
  const comparePrice = variant ? variantComparePrice(variant) : 0;
  const isUnavailable = !variant;
  const isOutOfStock = Boolean(variant) && variantStock(variant) <= 0;

  const handleCardClick = () => {
    navigate(`/product/${slug}`);
  };

  const handleAddToCart = (e) => {
    e.stopPropagation();
    if (isUnavailable || isOutOfStock) {
      handleCardClick();
      return;
    }
    addToCart(product, 1, variant);
    setIsAddedAnim(true);
    setTimeout(() => setIsAddedAnim(false), 1800);
  };

  const isListView = viewMode === 'list';

  return (
    <article
      className={`ps-col-card ${isListView ? 'is-list-view' : ''}`}
      onClick={handleCardClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        // Only when the card itself has focus: Enter on the button must not also navigate
        if (e.key === 'Enter' && e.target === e.currentTarget) handleCardClick();
      }}
      aria-label={`View ${product.name}`}
    >
      <div className="ps-col-card-media">
        <img
          src={imageSrc}
          alt={product.name}
          className="ps-col-card-img"
          loading={priority ? 'eager' : 'lazy'}
          width="400"
          height="400"
        />
      </div>

      <div className="ps-col-card-body">
        <h3 className="ps-col-card-name" title={product.name}>
          {product.name}
        </h3>

        <div className="ps-col-card-pricing">
          {isUnavailable ? (
            <span className="ps-col-card-unavailable">Currently unavailable</span>
          ) : (
            <>
              <span className="ps-col-card-price">{formatINR(price)}</span>
              {comparePrice > 0 && <span className="ps-col-card-compare-price">{formatINR(comparePrice)}</span>}
            </>
          )}
        </div>

        <div className="ps-col-card-actions">
          <button
            type="button"
            className={`ps-col-card-add-btn ${isAddedAnim ? 'is-success' : ''} ${isUnavailable || isOutOfStock ? 'is-muted' : ''}`}
            onClick={handleAddToCart}
            aria-label={
              isUnavailable
                ? `View details of ${product.name}`
                : isOutOfStock
                ? `${product.name} is sold out — view details`
                : `Add ${product.name} (${variant.bottle_type}, ${variant.size_ml}) to cart`
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
              <span>SOLD OUT</span>
            ) : (
              <>
                <ShoppingBag size={14} strokeWidth={1.8} />
                <span>ADD TO CART</span>
              </>
            )}
          </button>
        </div>
      </div>
    </article>
  );
}
