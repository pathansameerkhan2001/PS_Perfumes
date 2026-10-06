import React from 'react';
import { Link } from 'react-router-dom';
import { Heart, ArrowRight } from 'lucide-react';
import { useCart } from '../../context/CartContext';
import ProductCard from '../../components/ProductCard';

export default function WishlistPage() {
  const { wishlist } = useCart();

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
              Tap the heart icon on any master extraction to save it to your private selection.
            </p>
            <Link to="/shop" className="ps-btn-gold-primary">
              <span>EXPLORE FRAGRANCES</span>
              <ArrowRight size={15} />
            </Link>
          </div>
        ) : (
          <div className="ps-shop-products-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
            {wishlist.map((prod) => (
              <ProductCard key={prod.id} product={prod} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
