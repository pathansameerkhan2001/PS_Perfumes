import React, { useEffect, useRef, useState } from 'react';
import { ShoppingBag, Heart } from 'lucide-react';
import { useCart } from '../context/CartContext';
import './Sections.css';

export default function FloatingCartButton() {
  const { itemCount, setIsCartOpen, wishlist, setIsWishlistOpen } = useCart();

  // The bag gives a small bump (and its count pops) whenever something is added
  const [bumpKey, setBumpKey] = useState(0);
  const prevCount = useRef(itemCount);
  useEffect(() => {
    if (itemCount > prevCount.current) setBumpKey((n) => n + 1);
    prevCount.current = itemCount;
  }, [itemCount]);

  return (
    <div className="ps-floating-actions" aria-label="Quick Access Shopping Bag and Wishlist">
      {/* Wishlist Pill */}
      {wishlist.length > 0 && (
        <button
          type="button"
          className="ps-floating-btn ps-floating-wishlist"
          onClick={() => setIsWishlistOpen(true)}
          aria-label={`View Wishlist (${wishlist.length} saved)`}
        >
          <Heart size={18} fill="#eb1c24" color="#eb1c24" />
          <span className="ps-floating-badge">{wishlist.length}</span>
        </button>
      )}

      {/* Cart Pill */}
      <button
        key={`bag-${bumpKey}`}
        type="button"
        className={`ps-floating-btn ps-floating-cart${bumpKey > 0 ? ' is-bumped' : ''}`}
        onClick={() => setIsCartOpen(true)}
        aria-label={`View Shopping Bag (${itemCount} items)`}
      >
        <ShoppingBag size={18} color="#0c0b0a" />
        <span className="ps-floating-cart-text">BAG</span>
        <span className={`ps-floating-badge ps-floating-cart-badge${bumpKey > 0 ? ' is-pop' : ''}`}>{itemCount}</span>
      </button>
    </div>
  );
}
