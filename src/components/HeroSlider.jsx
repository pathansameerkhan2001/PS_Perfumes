import React, { useState, useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import heroDesktop1 from '../assets/hero-desktop.jpg';
import heroMobile1 from '../assets/hero-mobile.jpg';
import heroSlide2 from '../assets/hero-slide2.jpg';
import promoBanner from '../assets/promo-banner.jpg';
import './HeroSlider.css';

const SLIDES = [
  {
    id: 1,
    desktop: heroDesktop1,
    mobile: heroMobile1,
    alt: 'PS PERFUMES Haute Parfumerie Campaign Collection',
  },
  {
    id: 2,
    desktop: heroSlide2,
    mobile: heroSlide2,
    alt: 'PS PERFUMES Royal Oud & Amber Fragrance Showcase',
  },
  {
    id: 3,
    desktop: promoBanner,
    mobile: promoBanner,
    alt: 'PS PERFUMES Pure Artisanal Distillation & Incense',
  },
];

export default function HeroSlider() {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const timerRef = useRef(null);
  const touchStartXRef = useRef(0);
  const touchEndXRef = useRef(0);

  const nextSlide = () => {
    setCurrentSlide((prev) => (prev + 1) % SLIDES.length);
  };

  const prevSlide = () => {
    setCurrentSlide((prev) => (prev - 1 + SLIDES.length) % SLIDES.length);
  };

  const goToSlide = (index) => {
    setCurrentSlide(index);
  };

  const handleTouchStart = (e) => {
    touchStartXRef.current = e.touches[0].clientX;
    touchEndXRef.current = e.touches[0].clientX;
    setIsPaused(true);
  };

  const handleTouchMove = (e) => {
    touchEndXRef.current = e.touches[0].clientX;
  };

  const handleTouchEnd = () => {
    setIsPaused(false);
    const diff = touchStartXRef.current - touchEndXRef.current;
    if (diff > 45) {
      nextSlide(); // Swiped left -> next slide
    } else if (diff < -45) {
      prevSlide(); // Swiped right -> prev slide
    }
  };

  useEffect(() => {
    if (!isPaused) {
      timerRef.current = setInterval(() => {
        nextSlide();
      }, 5500);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isPaused, currentSlide]);

  return (
    <div
      className="ps-hero-slider-section"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      aria-label="PS PERFUMES Campaign Banner"
    >
      <div className="ps-hero-slider-wrapper">
        {SLIDES.map((slide, idx) => {
          const isActive = idx === currentSlide;
          return (
            <div
              key={slide.id}
              className={`ps-hero-slide ${isActive ? 'is-active' : ''}`}
              aria-hidden={!isActive}
            >
              <picture className="ps-hero-picture">
                <source media="(max-width: 768px)" srcSet={slide.mobile} />
                <img
                  src={slide.desktop}
                  alt={slide.alt}
                  className="ps-hero-slide-img"
                  loading={idx === 0 ? 'eager' : 'lazy'}
                />
              </picture>
            </div>
          );
        })}
      </div>

      {/* Manual Navigation Arrows */}
      <button
        type="button"
        className="ps-slider-arrow ps-slider-arrow-prev"
        onClick={prevSlide}
        aria-label="Previous Slide"
      >
        <ChevronLeft size={24} />
      </button>

      <button
        type="button"
        className="ps-slider-arrow ps-slider-arrow-next"
        onClick={nextSlide}
        aria-label="Next Slide"
      >
        <ChevronRight size={24} />
      </button>

      {/* Slide Indicators / Dots */}
      <div className="ps-slider-dots-container">
        {SLIDES.map((slide, idx) => (
          <button
            key={`dot-${slide.id}`}
            type="button"
            className={`ps-slider-dot ${idx === currentSlide ? 'is-active' : ''}`}
            onClick={() => goToSlide(idx)}
            aria-label={`Go to slide ${idx + 1}`}
          />
        ))}
      </div>
    </div>
  );
}
