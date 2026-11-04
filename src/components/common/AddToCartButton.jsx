import React, { useEffect, useRef, useState } from 'react';
import { ShoppingBag, Check } from 'lucide-react';
import './AddToCartButton.css';

const ADDED_MS = 1800;

/**
 * The storefront's gold Add to Cart button (cards, collections, product page, wishlist).
 *
 * - onAdd does the real work (CartContext.addToCart with the chosen variant) and returns true
 *   when the bag changed; only then is "Added to Cart" shown.
 * - loading: product data is still being confirmed, so the button waits.
 * - disabled: nothing purchasable; disabledLabel says why (Sold out, Unavailable).
 */
export default function AddToCartButton({
  onAdd,
  disabled = false,
  loading = false,
  label = 'Add to Cart',
  addedLabel = 'Added to Cart',
  disabledLabel = 'Unavailable',
  ariaLabel,
  size = 'md',
  className = '',
}) {
  const [added, setAdded] = useState(false);
  const timer = useRef(null);

  useEffect(() => () => clearTimeout(timer.current), []);

  const handleClick = (e) => {
    e.stopPropagation();
    if (disabled || loading) return;
    if (onAdd?.() === false) return;
    setAdded(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setAdded(false), ADDED_MS);
  };

  const state = loading ? 'is-loading' : disabled ? 'is-disabled' : added ? 'is-added' : '';

  return (
    <button
      type="button"
      className={`ps-atc ps-atc--${size} ${state} ${className}`}
      onClick={handleClick}
      onKeyDown={(e) => e.stopPropagation()}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      aria-label={ariaLabel}
    >
      {loading ? (
        <>
          <span className="ps-atc-spinner" aria-hidden="true" />
          <span>Loading</span>
        </>
      ) : disabled ? (
        <span>{disabledLabel}</span>
      ) : added ? (
        <>
          <Check size={size === 'lg' ? 18 : 15} strokeWidth={2.4} aria-hidden="true" />
          <span>{addedLabel}</span>
        </>
      ) : (
        <>
          <ShoppingBag size={size === 'lg' ? 18 : 15} strokeWidth={1.8} aria-hidden="true" />
          <span>{label}</span>
        </>
      )}
      {/* Screen readers hear the confirmation */}
      <span className="ps-atc-sr" aria-live="polite">
        {added ? addedLabel : ''}
      </span>
    </button>
  );
}
