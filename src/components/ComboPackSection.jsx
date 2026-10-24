import React, { useState, useEffect } from 'react';
import { ShoppingBag, Heart, Check } from 'lucide-react';
import { getCombos, toComboCartProduct } from '../services/combos';
import { formatINR } from '../utils/formatCurrency';
import { useCart } from '../context/CartContext';
import OptimizedImage from './OptimizedImage';
import './ComboPackSection.css';

export default function ComboPackSection({ title = 'Combo Collections', subtitle = '' }) {
  const { addToCart, toggleWishlist, isInWishlist, setSelectedProduct } = useCart();
  const [combos, setCombos] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [addedIds, setAddedIds] = useState({});

  useEffect(() => {
    let mounted = true;
    async function loadCombos() {
      try {
        const data = await getCombos({ activeOnly: true });
        if (mounted) setCombos(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error('Could not load combos:', err);
      } finally {
        if (mounted) setLoaded(true);
      }
    }
    loadCombos();
    return () => { mounted = false; };
  }, []);

  // Nothing to show (no active combos in the database): hide the section
  if (loaded && combos.length === 0) return null;

  const handleAddToCart = (e, combo) => {
    e.stopPropagation();
    // Out of stock, inactive or containing an unavailable product: cannot be bought
    if (!combo.is_purchasable) return;
    const { product, variant } = toComboCartProduct(combo);
    addToCart(product, 1, variant);

    setAddedIds((prev) => ({ ...prev, [combo.id]: true }));
    setTimeout(() => {
      setAddedIds((prev) => ({ ...prev, [combo.id]: false }));
    }, 1800);
  };

  const handleWishlist = (e, combo) => {
    e.stopPropagation();
    toggleWishlist(combo);
  };

  return (
    <section id="combo-pack" className="ps-combopack-section" aria-label="Combo Pack Offers">
      <div className="ps-combopack-container">
        {/* Section Heading */}
        <div className="ps-combopack-header">
          <span className="ps-section-eyebrow" style={{ color: '#c8a45d', letterSpacing: '0.15em', fontSize: '11px', textTransform: 'uppercase', marginBottom: '6px', display: 'block' }}>
            CURATED LUXURY SETS
          </span>
          <h2 className="ps-combopack-heading">{title || 'Combo Collections'}</h2>
          {subtitle && <p className="ps-section-subtitle">{subtitle}</p>}
        </div>

        {/* 3–4 Column Product Grid */}
        <div className="ps-combopack-grid">
          {combos.map((combo) => {
            const isWishlisted = isInWishlist(combo.id);
            const isAdded = !!addedIds[combo.id];
            const currentPrice = Number(combo.combo_price) || 0;
            const origPrice = Number(combo.original_price) || 0;
            const discountPct = combo.discount || (origPrice > currentPrice ? Math.round(((origPrice - currentPrice) / origPrice) * 100) : null);

            return (
              <div
                key={combo.id}
                className="ps-combopack-card"
                onClick={() => setSelectedProduct(combo)}
                role="button"
                tabIndex={0}
                aria-label={`View ${combo.name}`}
              >
                {/* Media Container with Discount Badge & Wishlist */}
                <div className="ps-combopack-media">
                  <OptimizedImage
                    src={combo.image_url || combo.image}
                    alt={combo.name}
                    className="ps-combopack-img"
                    aspectRatio="1 / 1"
                    width="400"
                    height="400"
                  />

                  {/* Badges: Bestseller & Discount */}
                  <div style={{ position: 'absolute', top: 12, left: 12, display: 'flex', flexDirection: 'column', gap: 6, zIndex: 3 }}>
                    {combo.featured && (
                      <span className="ps-pcard-badge ps-badge-primary" style={{ background: '#000', color: '#c8a45d', border: '1px solid #c8a45d', fontSize: '10px', padding: '3px 8px', letterSpacing: '0.08em', fontWeight: 600, borderRadius: 4, lineHeight: 1.2 }}>
                        FEATURED
                      </span>
                    )}
                    {Number(discountPct) > 0 && (
                      <span className="ps-combopack-discount-badge" style={{ position: 'static' }}>
                        {discountPct}% OFF
                      </span>
                    )}
                  </div>

                  {/* Top-Right Wishlist Button */}
                  <button
                    type="button"
                    className="ps-combopack-wishlist-btn"
                    onClick={(e) => handleWishlist(e, combo)}
                    aria-label={isWishlisted ? 'Remove from wishlist' : 'Add to wishlist'}
                  >
                    <Heart
                      size={16}
                      fill={isWishlisted ? '#eb1c24' : 'none'}
                      color={isWishlisted ? '#eb1c24' : '#111111'}
                    />
                  </button>
                </div>

                {/* Card Content underneath */}
                <div className="ps-combopack-content">
                  <span className="ps-combopack-brand">PS PERFUMES</span>
                  <h3 className="ps-combopack-title">{combo.name}</h3>

                  {/* Included Products List (Section 10 Requirement) */}
                  {Array.isArray(combo.items) && combo.items.length > 0 && (
                    <div className="ps-combopack-includes-block">
                      <span className="ps-includes-title">Includes:</span>
                      <ul className="ps-includes-items">
                        {combo.items.map((it, idx) => (
                          <li key={idx}>
                            <strong>{it.product_name}</strong>
                            {Number(it.quantity) > 1 && <span> × {it.quantity}</span>}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Pricing Row in Indian Rupees */}
                  <div className="ps-combopack-prices">
                    <span className="ps-combopack-sale-price">
                      {formatINR(currentPrice)}
                    </span>
                    {origPrice > currentPrice && (
                      <span className="ps-combopack-orig-price">
                        {formatINR(origPrice)}
                      </span>
                    )}
                  </div>
                </div>

                {/* Bottom Full-Width Gold ADD TO CART Button */}
                <button
                  type="button"
                  className={`ps-combopack-add-btn ${isAdded ? 'is-added' : ''}`}
                  onClick={(e) => handleAddToCart(e, combo)}
                  disabled={!combo.is_purchasable}
                  title={combo.is_purchasable ? undefined : combo.unavailable_message}
                  aria-label={
                    combo.is_purchasable
                      ? `Add ${combo.name} to cart`
                      : `${combo.name}: ${combo.unavailable_reason === 'out_of_stock' ? 'out of stock' : 'currently unavailable'}`
                  }
                >
                  {isAdded ? (
                    <>
                      <Check size={16} />
                      <span>ADDED TO CART</span>
                    </>
                  ) : !combo.is_purchasable ? (
                    <span>{combo.unavailable_reason === 'out_of_stock' ? 'OUT OF STOCK' : 'CURRENTLY UNAVAILABLE'}</span>
                  ) : (
                    <>
                      <ShoppingBag size={16} />
                      <span>ADD TO CART</span>
                    </>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
