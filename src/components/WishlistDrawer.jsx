import React, { useEffect } from 'react';
import { X, Heart, Trash2, ShoppingBag } from 'lucide-react';
import { useCart } from '../context/CartContext';
import { formatINR } from '../utils/formatCurrency';
import './WishlistDrawer.css';

export default function WishlistDrawer() {
  const { wishlist, isWishlistOpen, setIsWishlistOpen, toggleWishlist, addToCart } = useCart();

  useEffect(() => {
    if (isWishlistOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isWishlistOpen]);

  if (!isWishlistOpen) return null;

  return (
    <div className="ps-wishlist-overlay" onClick={() => setIsWishlistOpen(false)}>
      <aside
        className="ps-wishlist-drawer"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Saved Fragrances"
      >
        <div className="ps-wishlist-header">
          <div className="ps-wishlist-title-wrap">
            <Heart size={20} color="#eb1c24" fill="#eb1c24" />
            <h2 className="ps-wishlist-title">SAVED FRAGRANCES</h2>
            <span className="ps-wishlist-badge">{wishlist.length}</span>
          </div>
          <button
            type="button"
            className="ps-wishlist-close"
            onClick={() => setIsWishlistOpen(false)}
            aria-label="Close saved items"
          >
            <X size={20} />
          </button>
        </div>

        <div className="ps-wishlist-body">
          {wishlist.length === 0 ? (
            <div className="ps-wishlist-empty">
              <Heart size={48} strokeWidth={1.2} color="#c5a059" />
              <h3>Your Wishlist is Empty</h3>
              <p>Explore our master extractions and click the heart icon to save your favorite fragrances.</p>
              <button
                type="button"
                className="ps-wishlist-empty-btn"
                onClick={() => setIsWishlistOpen(false)}
              >
                EXPLORE COLLECTIONS
              </button>
            </div>
          ) : (
            <div className="ps-wishlist-list">
              {wishlist.map((product) => (
                <div key={product.id} className="ps-wishlist-item">
                  <div className="ps-wishlist-thumb">
                    <img src={product.image} alt={product.name} />
                  </div>
                  <div className="ps-wishlist-item-info">
                    <span className="ps-wishlist-item-type">{product.type || product.category}</span>
                    <h4 className="ps-wishlist-item-name">{product.name}</h4>
                    <span className="ps-wishlist-item-price">{formatINR(product.price)}</span>
                    <button
                      type="button"
                      className="ps-wishlist-add-btn"
                      onClick={() => {
                        addToCart(product, 1);
                        setIsWishlistOpen(false);
                      }}
                    >
                      <ShoppingBag size={14} />
                      <span>ADD TO BAG</span>
                    </button>
                  </div>
                  <button
                    type="button"
                    className="ps-wishlist-remove-btn"
                    onClick={() => toggleWishlist(product)}
                    aria-label="Remove item"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
