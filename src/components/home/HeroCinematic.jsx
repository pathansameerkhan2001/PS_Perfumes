import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import heroLuxuryDesktop from '../../assets/hero-luxury-cinematic.png';
import heroLuxuryMobile from '../../assets/hero-luxury-cinematic-mobile.png';
import heroSlide2 from '../../assets/hero-slide2.webp';
import heroSlide2Mobile from '../../assets/hero-slide2-mobile.webp';
import promoBanner from '../../assets/promo-banner.webp';
import promoBannerMobile from '../../assets/promo-banner-mobile.webp';
import './HeroCinematic.css';

const HERO_SLIDES = [
  {
    id: 1,
    desktop: heroLuxuryDesktop,
    mobile: heroLuxuryMobile,
    collectionTag: 'ROYAL OUD & AMBER ESSENCE',
    link: '/shop',
    alt: 'PS PERFUMES Royal Oud, Golden Attar and Amber Essence Luxury Collection in Kadapa',
  },
  {
    id: 2,
    desktop: heroSlide2,
    mobile: heroSlide2Mobile,
    collectionTag: 'IMPERIAL ATTAR & EXTRACTS',
    link: '/category/attar',
    alt: 'PS PERFUMES Imperial Artisanal Attar and Pure Essential Extractions',
  },
  {
    id: 3,
    desktop: promoBanner,
    mobile: promoBannerMobile,
    collectionTag: 'SACRED BAKHOOR & DAHNAL OUD',
    link: '/category/bakhoor',
    alt: 'PS PERFUMES Pure Distilled Agarwood and Royal Bakhoor Incense',
  },
];

export default function HeroCinematic() {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    if (isHovered) return;
    const timer = setInterval(() => {
      setCurrentIdx((prev) => (prev + 1) % HERO_SLIDES.length);
    }, 7500);
    return () => clearInterval(timer);
  }, [isHovered]);

  const slide = HERO_SLIDES[currentIdx];

  const handleNext = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setCurrentIdx((prev) => (prev + 1) % HERO_SLIDES.length);
  };

  const handlePrev = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setCurrentIdx((prev) => (prev - 1 + HERO_SLIDES.length) % HERO_SLIDES.length);
  };

  return (
    <section
      className="ps-hero-cinematic"
      aria-label="PS PERFUMES Luxury Campaign Hero"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <Link to={slide.link} className="ps-hero-viewport-link" aria-label="Explore PS PERFUMES Fragrance Collection">
        {/* Cinematic Imagery Layer */}
        <div className="ps-hero-media-wrapper">
          <AnimatePresence mode="wait">
            <motion.div
              key={slide.id}
              initial={{ opacity: 0, scale: 1.02 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
              className="ps-hero-picture-container"
            >
              <picture>
                <source media="(max-width: 768px)" srcSet={slide.mobile} />
                <source media="(min-width: 769px)" srcSet={slide.desktop} />
                <img
                  src={slide.desktop}
                  alt={slide.alt}
                  className="ps-hero-cinematic-img"
                  loading="eager"
                  fetchPriority="high"
                  decoding="sync"
                  width="1600"
                  height="720"
                />
              </picture>
            </motion.div>
          </AnimatePresence>

          {/* Delicate Vignette — Preserves warm gold illumination and bottle details */}
          <div className="ps-hero-delicate-vignette" />
          <div className="ps-hero-top-blend" />
          <div className="ps-hero-bottom-blend" />
        </div>

        {/* Minimal Subtle Editorial Overlays (No bulky cards or heavy headlines) */}
        <div className="ps-hero-subtle-overlay">
          {/* Bottom Left: Micro Collection Indicator */}
          <div className="ps-hero-indicator-badge">
            <span className="ps-hero-index-num">0{currentIdx + 1} / 0{HERO_SLIDES.length}</span>
            <span className="ps-hero-sep-dot">•</span>
            <span className="ps-hero-collection-name">{slide.collectionTag}</span>
          </div>

          {/* Bottom Right: Minimalist Arrow Controls */}
          <div className="ps-hero-subtle-controls">
            <button
              type="button"
              className="ps-hero-ctrl-btn"
              onClick={handlePrev}
              aria-label="Previous Fragrance Showcase"
            >
              <ChevronLeft size={16} />
            </button>
            <div className="ps-hero-dots-indicator">
              {HERO_SLIDES.map((s, idx) => (
                <button
                  key={s.id}
                  type="button"
                  className={`ps-hero-micro-dot ${idx === currentIdx ? 'is-active' : ''}`}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setCurrentIdx(idx);
                  }}
                  aria-label={`Jump to presentation ${idx + 1}`}
                />
              ))}
            </div>
            <button
              type="button"
              className="ps-hero-ctrl-btn"
              onClick={handleNext}
              aria-label="Next Fragrance Showcase"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </Link>
    </section>
  );
}
