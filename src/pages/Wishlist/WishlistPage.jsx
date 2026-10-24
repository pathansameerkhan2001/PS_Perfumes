import React from 'react';
import { Link } from 'react-router-dom';
import { Heart, ArrowRight } from 'lucide-react';
import { useCart } from '../../context/CartContext';
import ProductCard from '../../components/ProductCard';
import { useSeo } from '../../utils/useSeo';

export default function WishlistPage() {
  useSeo({ title: 'Wishlist', path: '/wishlist', noindex: true });
  const { wishlist, toggleWishlist } = useCart();

  return (
    <div className="ps-shop-page">
      <div className="ps-shop-hero-banner">
        <div className="ps-shop-hero-inner">
          <span className="ps-shop-tag">PATRON VAULT</span>
          <h1 className="ps-shop-title">Your Private Wishlist</h1>
          <p className="ps-shop-sub">
            Curated fragrances saved for your personal scent wardrobe and special occasions.
          </p>
        </div>
      </div>

      <div className="ps-shop-container">
        {wishlist.length === 0 ? (
          <div className="ps-shop-empty-state" style={{ margin: '40px auto', maxWidth: 560 }}>
            <Heart size={48} color="#c8a45d" style={{ margin: '0 auto 16px' }} />
            <h2 className="ps-empty-title">Your Wishlist is Empty</h2>
            <p className="ps-empty-desc">
              Tap the heart icon on any product page to save it to your private selection.
            </p>
            <Link to="/shop" className="ps-btn-gold-primary">
              <span>EXPLORE FRAGRANCES</span>
              <ArrowRight size={15} />
            </Link>
          </div>
        ) : (
          <div className="ps-shop-products-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
            {wishlist.map((prod) => (
              // Product cards carry only Add to Cart, so removal lives below each saved card
              <div key={prod.id} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <ProductCard product={prod} />
                <button
                  type="button"
                  onClick={() => toggleWishlist(prod)}
                  aria-label={`Remove ${prod.name} from wishlist`}
                  style={{
                    alignSelf: 'center',
                    background: 'transparent',
                    border: 'none',
                    color: '#8C7343',
                    fontSize: 12,
                    fontWeight: 600,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    textDecoration: 'underline',
                    textUnderlineOffset: 3,
                    cursor: 'pointer',
                    padding: '4px 8px',
                  }}
                >
                  Remove from wishlist
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
