import React from 'react';
import promoBannerWebp from '../assets/promo-banner.webp';
import promoBannerMobileWebp from '../assets/promo-banner-mobile.webp';
import { useCart } from '../context/CartContext';
import { Sparkles, ArrowRight } from 'lucide-react';
import './Sections.css';

export default function PromoBanner() {
  const { setSelectedProduct, setSelectedCategory } = useCart();

  const handleExploreCoffret = () => {
    setSelectedCategory('Gift Sets');
    const target = document.getElementById('catalog-grid');
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <section className="ps-promo-banner-section" aria-label="Atelier Heritage Feature">
      <div className="ps-promo-banner-inner">
        {/* Background Visual with luxury gradient overlay */}
        <div className="ps-promo-image-wrapper">
          <picture>
            <source media="(max-width: 768px)" srcSet={promoBannerMobileWebp} type="image/webp" />
            <source media="(min-width: 769px)" srcSet={promoBannerWebp} type="image/webp" />
            <img
              src={promoBannerWebp}
              alt="Artisanal Oud and Amber Distillation"
              className="ps-promo-bg-img"
              loading="lazy"
              decoding="async"
              width="1600"
              height="600"
            />
          </picture>
          <div className="ps-promo-overlay" />
        </div>

        {/* Content Box */}
        <div className="ps-promo-content-container">
          <div className="ps-promo-content">
            <div className="ps-promo-badge">
              <Sparkles size={14} color="#c5a059" />
              <span>THE PS PERFUMES ATELIER</span>
            </div>

            <h2 className="ps-promo-heading">
              Pure Artisanal Distillation, Aged in Rare French Oak
            </h2>

            <p className="ps-promo-desc">
              From the wild mountain agarwood forests of Assam to the rose fields of Kannauj and Grasse,
              our perfumers hand-extract every botanical resin according to ancient royal recipes.
              Experience unmatched concentration, infinite longevity, and an intoxicating sillage.
            </p>

            <div className="ps-promo-actions">
              <button
                type="button"
                className="ps-promo-cta-btn"
                onClick={handleExploreCoffret}
              >
                <span>EXPLORE DISCOVERY COFFRETS</span>
                <ArrowRight size={16} />
              </button>

              <div className="ps-promo-guarantee">
                <span className="ps-promo-dot" />
                <span>Complimentary 2x2ml Travel Vial With Every Order</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
