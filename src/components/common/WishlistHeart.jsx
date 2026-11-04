import React, { useState } from 'react';
import { Heart } from 'lucide-react';
import { useCart } from '../../context/CartContext';
import './WishlistHeart.css';

/**
 * Wishlist toggle used on every product card and the product page: outlined gold heart when
 * not saved, filled gold when saved. Saves through CartContext (the one wishlist store).
 * Clicks never reach the card underneath (which would open the product page).
 */
export default function WishlistHeart({ product, size = 18, className = '' }) {
  const { toggleWishlist, isInWishlist } = useCart();
  // Bumped on every save so the pop animation restarts
  const [popKey, setPopKey] = useState(0);
  if (!product?.id) return null;
  const saved = isInWishlist(product.id);

  const handleClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!saved) setPopKey((n) => n + 1);
    toggleWishlist(product);
  };

  return (
    <button
      type="button"
      className={`ps-heart${saved ? ' is-saved' : ''} ${className}`}
      onClick={handleClick}
      onKeyDown={(e) => e.stopPropagation()}
      aria-pressed={saved}
      aria-label={saved ? `Remove ${product.name} from wishlist` : `Save ${product.name} to wishlist`}
      title={saved ? 'Saved to wishlist' : 'Save to wishlist'}
    >
      <Heart
        key={popKey}
        size={size}
        strokeWidth={1.6}
        className={popKey > 0 && saved ? 'ps-heart-icon is-pop' : 'ps-heart-icon'}
        aria-hidden="true"
      />
    </button>
  );
}
