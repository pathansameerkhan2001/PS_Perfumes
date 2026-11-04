import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Heart, ArrowRight, X } from 'lucide-react';
import { useCart } from '../../context/CartContext';
import ProductCard from '../../components/ProductCard';
import GoldOrnament from '../../components/common/GoldOrnament';
import RosePetals from '../../components/common/RosePetals';
import { getProducts } from '../../services/products';
import { isComboRecord } from '../../services/combos';
import { useSeo } from '../../utils/useSeo';
import './WishlistPage.css';

/*
 * Wishlist page. Saved items live in CartContext (localStorage, guest wishlist; there is no
 * customer login to sync with). The saved copy of a product can be old, so the active catalogue
 * (the same cached request as the shop) supplies current prices, stock and availability; until
 * it answers, Add to Cart waits. A product no longer on sale shows as unavailable. Combo sets
 * keep their saved copy (checkout prices them from the database either way).
 */
export default function WishlistPage() {
  useSeo({ title: 'Wishlist', path: '/wishlist', noindex: true });
  const { wishlist, removeFromWishlist } = useCart();
  // null while loading; a Map of active products by id; false if it could not be loaded
  const [catalog, setCatalog] = useState(null);

  const hasProducts = wishlist.some((p) => !isComboRecord(p));
  useEffect(() => {
    if (!hasProducts) return undefined;
    let active = true;
    getProducts({ throwOnError: true })
      .then((list) => active && setCatalog(new Map((list || []).map((p) => [p.id, p]))))
      .catch((err) => {
        console.error('Could not refresh wishlist products:', err);
        if (active) setCatalog(false);
      });
    return () => {
      active = false;
    };
  }, [hasProducts]);

  const items = useMemo(
    () =>
      wishlist.map((saved) => {
        if (isComboRecord(saved) || !catalog) return { product: saved, pending: catalog === null && !isComboRecord(saved) };
        // Not in the active catalogue any more: shown, but nothing can be added
        return { product: catalog.get(saved.id) || { ...saved, variants: [] }, pending: false };
      }),
    [wishlist, catalog]
  );

  return (
    <div className="ps-wl-page">
      <header className="ps-wl-hero ps-arabesque">
        <RosePetals />
        <div className="ps-wl-hero-inner">
          <span className="ps-wl-eyebrow">Your Private Selection</span>
          <h1 className="ps-wl-title">Wishlist</h1>
          <p className="ps-wl-sub">
            {wishlist.length === 0
              ? 'Fragrances you save will wait for you here.'
              : `${wishlist.length} ${wishlist.length === 1 ? 'fragrance' : 'fragrances'} saved for later.`}
          </p>
          <GoldOrnament />
        </div>
      </header>

      <div className="ps-wl-container">
        {wishlist.length === 0 ? (
          <div className="ps-wl-empty">
            <span className="ps-wl-empty-icon" aria-hidden="true">
              <Heart size={34} strokeWidth={1.2} />
            </span>
            <h2>Your wishlist is empty</h2>
            <p>Tap the gold heart on any fragrance to keep it here, ready for when you are.</p>
            <div className="ps-wl-empty-actions">
              <Link to="/collections" className="ps-wl-btn is-primary">
                <span>Explore collections</span>
                <ArrowRight size={15} aria-hidden="true" />
              </Link>
              <Link to="/shop" className="ps-wl-btn">
                Shop all fragrances
              </Link>
            </div>
          </div>
        ) : (
          <div className="ps-wl-grid">
            {items.map(({ product, pending }) => (
              <div key={product.id} className="ps-wl-item">
                <ProductCard product={product} pending={pending} />
                <button
                  type="button"
                  className="ps-wl-remove"
                  onClick={() => removeFromWishlist(product.id)}
                  aria-label={`Remove ${product.name} from wishlist`}
                >
                  <X size={14} aria-hidden="true" />
                  <span>Remove</span>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
