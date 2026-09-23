import React from 'react';
import heroDesktop from '../assets/hero-desktop.jpg';
import heroMobile from '../assets/hero-mobile.jpg';
import './Hero.css';

export default function Hero() {
  return (
    <section className="ps-hero-section" aria-label="PS PERFUMES Campaign">
      {/* Background Campaign Imagery */}
      <picture className="ps-hero-picture">
        <source media="(max-width: 768px)" srcSet={heroMobile} />
        <img
          src={heroDesktop}
          alt="PS PERFUMES Haute Parfumerie Campaign"
          className="ps-hero-bg-img"
          loading="eager"
        />
      </picture>

      {/* Subtle Right-Side Gradient for Flawless Text Legibility */}
      <div className="ps-hero-gradient-overlay" />

      {/* Hero Content Container */}
      <div className="ps-hero-container">
        <div className="ps-hero-content-right">
          <div className="ps-hero-badge-tag">HAUTE PARFUMERIE</div>
          <h1 className="ps-hero-title">
            The Art of<br />
            Signature Fragrance
          </h1>
          <p className="ps-hero-subline">
            Rare botanical extractions & timeless olfactory craftsmanship.
          </p>
          <div className="ps-hero-cta-wrapper">
            <a href="#shop-all" className="ps-hero-cta-btn">
              SHOP NOW
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
