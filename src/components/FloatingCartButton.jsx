import React from 'react';
import { ShoppingBag, Heart } from 'lucide-react';
import { useCart } from '../context/CartContext';
import './Sections.css';

export default function FloatingCartButton() {
  const { itemCount, setIsCartOpen, wishlist, setIsWishlistOpen } = useCart();

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
        type="button"
        className="ps-floating-btn ps-floating-cart"
        onClick={() => setIsCartOpen(true)}
        aria-label={`View Shopping Bag (${itemCount} items)`}
      >
        <ShoppingBag size={18} color="#0c0b0a" />
        <span className="ps-floating-cart-text">BAG</span>
        <span className="ps-floating-badge ps-floating-cart-badge">{itemCount}</span>
      </button>
    </div>
  );
}
