import React, { useRef, useState } from 'react';
import { ChevronRight, ChevronLeft, Play, ShoppingBag, X } from 'lucide-react';
import { REELS_DATA, PRODUCTS, COMBO_PRODUCTS } from '../data/products';
import { formatINR } from '../utils/formatCurrency';
import { useCart } from '../context/CartContext';
import './ShoppableVideoSection.css';

export default function ShoppableVideoSection() {
  const trackRef = useRef(null);
  const [activeReel, setActiveReel] = useState(null);
  const { setSelectedProduct, addToCart } = useCart();

  const scroll = (direction) => {
    if (trackRef.current) {
      const scrollAmount = trackRef.current.clientWidth * 0.75;
      trackRef.current.scrollBy({
        left: direction === 'next' ? scrollAmount : -scrollAmount,
        behavior: 'smooth',
      });
    }
  };

  const handleProductClick = (e, reel) => {
    e.stopPropagation();
    const all = [...PRODUCTS, ...COMBO_PRODUCTS];
    const match = all.find((p) => p.id === reel.productId);
    if (match) {
      setSelectedProduct(match);
    }
  };

  const handleQuickAdd = (e, reel) => {
    e.stopPropagation();
    const all = [...PRODUCTS, ...COMBO_PRODUCTS];
    const match = all.find((p) => p.id === reel.productId);
    if (match) {
      addToCart(match, 1);
    }
  };

  return (
    <section className="ps-shoppable-section" aria-label="Shoppable Video Section">
      <div className="ps-shoppable-container">
        {/* Section Heading matching reference */}
        <div className="ps-shoppable-header">
          <h2 className="ps-shoppable-heading">Shoppable Video</h2>
        </div>

        {/* Carousel Wrapper */}
        <div className="ps-reels-carousel-wrapper">
          {/* Navigation Arrows */}
          <button
            type="button"
            className="ps-carousel-nav-btn is-prev"
            onClick={() => scroll('prev')}
            aria-label="Previous reels"
          >
            <ChevronLeft size={24} />
          </button>

          <button
            type="button"
            className="ps-carousel-nav-btn is-next"
            onClick={() => scroll('next')}
            aria-label="Next reels"
          >
            <ChevronRight size={24} />
          </button>

          {/* Scrollable Track */}
          <div className="ps-reels-track" ref={trackRef}>
            {REELS_DATA.map((reel) => (
              <div
                key={reel.id}
                className="ps-reel-card"
                onClick={() => setActiveReel(reel)}
                role="button"
                tabIndex={0}
                aria-label={`View reel: ${reel.title}`}
              >
                {/* Visual Media */}
                <div className="ps-reel-media">
                  <img
                    src={reel.videoThumb}
                    alt={reel.title}
                    className="ps-reel-img"
                    loading="lazy"
                  />
                  <div className="ps-reel-top-gradient" />
                  <div className="ps-reel-bottom-gradient" />
                </div>

                {/* Top Quote / Overlay matching screenshot */}
                <div className="ps-reel-top-overlay">
                  <span className="ps-reel-quote-badge">{reel.quote}</span>
                  <div className="ps-reel-play-icon">
                    <Play size={14} fill="#ffffff" />
                  </div>
                </div>

                {/* Bottom Product Card matching screenshot */}
                <div
                  className="ps-reel-product-bar"
                  onClick={(e) => handleProductClick(e, reel)}
                  title={`View details for ${reel.productName}`}
                >
                  <div className="ps-reel-prod-thumb">
                    <img
                      src={reel.productThumbnail}
                      alt={reel.productName}
                      loading="lazy"
                    />
                  </div>

                  <div className="ps-reel-prod-info">
                    <span className="ps-reel-prod-title">{reel.productName}</span>
                    <div className="ps-reel-pricing">
                      <span className="ps-reel-price">{formatINR(reel.price)}</span>
                      {reel.originalPrice && (
                        <span className="ps-reel-orig-price">{formatINR(reel.originalPrice)}</span>
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    className="ps-reel-bag-btn"
                    onClick={(e) => handleQuickAdd(e, reel)}
                    aria-label={`Add ${reel.productName} to bag`}
                    title="Add to bag"
                  >
                    <ShoppingBag size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Interactive Reel Viewer Modal */}
      {activeReel && (
        <div
          className="ps-reel-modal-backdrop"
          onClick={() => setActiveReel(null)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="ps-reel-modal-container"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="ps-reel-modal-close"
              onClick={() => setActiveReel(null)}
              aria-label="Close reel"
            >
              <X size={20} />
            </button>

            <div className="ps-reel-modal-media">
              <img
                src={activeReel.videoThumb}
                alt={activeReel.title}
                className="ps-reel-modal-img"
              />
            </div>

            <div className="ps-reel-modal-bottom-bar">
              <p className="ps-reel-modal-desc">{activeReel.description}</p>
              <div className="ps-reel-modal-action-row">
                <div>
                  <strong style={{ color: '#ffffff', display: 'block', fontSize: '14px' }}>
                    {activeReel.productName}
                  </strong>
                  <span style={{ color: '#c5a059', fontWeight: 800, fontSize: '15px' }}>
                    {formatINR(activeReel.price)}
                  </span>
                </div>

                <button
                  type="button"
                  className="ps-reel-modal-buy-btn"
                  onClick={(e) => {
                    handleQuickAdd(e, activeReel);
                    setActiveReel(null);
                  }}
                >
                  ADD TO CART
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
