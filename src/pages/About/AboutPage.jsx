import React from 'react';
import { Link } from 'react-router-dom';
import { MapPin, Compass, ShieldCheck, ArrowRight } from 'lucide-react';
import promoBanner from '../../assets/promo-banner.webp';
import catBestSellers from '../../assets/cat-bestsellers.webp';
import './AboutPage.css';

export default function AboutPage() {
  return (
    <div className="ps-about-page">
      {/* Editorial Hero */}
      <section className="ps-about-hero">
        <div className="ps-about-hero-container">
          <span className="ps-about-eyebrow">THE ATELIER HERITAGE</span>
          <h1 className="ps-about-title">The Art of Pure Olfactory Distinction</h1>
          <div className="ps-gold-divider" />
          <p className="ps-about-hero-sub">
            Born in Kadapa, Andhra Pradesh, PS PERFUMES was founded on an uncompromising devotion to royal Eastern fragrance traditions and modern Haute Parfumerie.
          </p>
        </div>
      </section>

      {/* Philosophy Section */}
      <section className="ps-about-philosophy-section">
        <div className="ps-about-container">
          <div className="ps-about-split-grid">
            <div className="ps-about-split-text">
              <span className="ps-section-eyebrow">OUR DEVOTION</span>
              <h2 className="ps-about-section-heading">
                Where Time-Honored Distillation Meets Modern Sophistication
              </h2>
              <p>
                In an era of synthetic mass-production, PS PERFUMES remains an uncompromising sanctuary of authentic perfumery. Every flacon we release represents months of patience—from hand-selecting aged Cambodian agarwood and wild Persian saffron to resting pure attars in vintage glass decanters.
              </p>
              <p>
                Our roots in Kadapa inspire our ethos: warmth, authenticity, and enduring hospitality. Whether formulating concentrated non-alcoholic attars for intimate rituals or crafting high-projection extraits for international galas, our fragrances leave an indelible impression.
              </p>
              <div className="ps-about-highlights">
                <div className="ps-about-highlight-item">
                  <ShieldCheck size={20} color="#c8a45d" />
                  <div>
                    <strong>100% Genuine Botanicals</strong>
                    <span>Non-alcoholic attars & certified extractions</span>
                  </div>
                </div>
                <div className="ps-about-highlight-item">
                  <Compass size={20} color="#c8a45d" />
                  <div>
                    <strong>Artisanal Small Batches</strong>
                    <span>Hand-blended and bottled with utmost reverence</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="ps-about-split-visual">
              <img
                src={promoBanner}
                alt="PS PERFUMES Artisanal Distillation"
                className="ps-about-visual-img"
              />
              <div className="ps-about-visual-border" />
            </div>
          </div>
        </div>
      </section>

      {/* The Kadapa Flagship */}
      <section className="ps-about-atelier-section" id="kadapa">
        <div className="ps-about-container">
          <div className="ps-about-split-grid ps-reverse-grid">
            <div className="ps-about-split-visual">
              <img
                src={catBestSellers}
                alt="PS PERFUMES Kadapa Boutique"
                className="ps-about-visual-img"
              />
              <div className="ps-about-visual-border" />
            </div>

            <div className="ps-about-split-text">
              <span className="ps-section-eyebrow">OUR FLAGSHIP SANCTUARY</span>
              <h2 className="ps-about-section-heading">The Kadapa Atelier</h2>
              <div className="ps-about-location-badge">
                <MapPin size={16} color="#c8a45d" />
                <span>Kadapa, Andhra Pradesh – 516001, India</span>
              </div>
              <p>
                Located in the heart of Kadapa, our atelier invites patrons to discover the nuance of pure scent. From private consultations exploring bespoke fragrance pairing to sampling rare oud chips and floral hydro-distillates, we welcome fragrance enthusiasts from across India.
              </p>
              <p>
                For our nationwide clientele, we maintain daily express temperature-monitored dispatches to ensure flacons arrive in immaculate royal presentation.
              </p>
              <div className="ps-about-actions">
                <Link to="/contact" className="ps-btn-gold-primary">
                  <span>VISIT THE ATELIER</span>
                  <ArrowRight size={15} />
                </Link>
                <Link to="/shop" className="ps-btn-outline-gold">
                  <span>EXPLORE THE COLLECTION</span>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
