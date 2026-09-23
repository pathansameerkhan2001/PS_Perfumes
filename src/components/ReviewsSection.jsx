import React, { useState, useEffect, useRef } from 'react';
import { Star, ChevronLeft, ChevronRight, Heart } from 'lucide-react';
import { REVIEWS } from '../data/reviews';
import './ReviewsSection.css';

export default function ReviewsSection() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [touchStart, setTouchStart] = useState(null);
  const [touchEnd, setTouchEnd] = useState(null);
  const autoPlayRef = useRef(null);

  const totalReviews = REVIEWS.length;

  const prevSlide = () => {
    setCurrentIndex((prev) => (prev === 0 ? totalReviews - 1 : prev - 1));
  };

  const nextSlide = () => {
    setCurrentIndex((prev) => (prev === totalReviews - 1 ? 0 : prev + 1));
  };

  // Keyboard navigation
  const handleKeyDown = (e) => {
    if (e.key === 'ArrowLeft') prevSlide();
    if (e.key === 'ArrowRight') nextSlide();
  };

  // Touch swipe support for mobile
  const handleTouchStart = (e) => {
    setTouchStart(e.targetTouches[0].clientX);
  };

  const handleTouchMove = (e) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const handleTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > 50;
    const isRightSwipe = distance < -50;

    if (isLeftSwipe) {
      nextSlide();
    } else if (isRightSwipe) {
      prevSlide();
    }

    setTouchStart(null);
    setTouchEnd(null);
  };

  return (
    <section
      className="ps-reviews-section"
      aria-label="What Our Customers Have to Say"
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      <div className="ps-reviews-container">
        {/* Section Header */}
        <div className="ps-reviews-header">
          <h2 className="ps-reviews-heading">What Our Customers Have to Say</h2>
        </div>

        {/* Editorial Carousel Viewport */}
        <div
          className="ps-reviews-carousel-viewport"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <div
            className="ps-reviews-track"
            style={{
              transform: `translateX(calc(-0.5 * var(--slide-width) - (${currentIndex} * (var(--slide-width) + var(--slide-gap)))))`,
            }}
          >
            {REVIEWS.map((rev, index) => {
              const isActive = index === currentIndex;
              const isPrev =
                index === (currentIndex - 1 + totalReviews) % totalReviews;
              const isNext = index === (currentIndex + 1) % totalReviews;

              let cardClass = 'ps-review-slide';
              if (isActive) cardClass += ' is-active';
              else if (isPrev) cardClass += ' is-prev';
              else if (isNext) cardClass += ' is-next';
              else cardClass += ' is-hidden';

              return (
                <div
                  key={rev.id}
                  className={cardClass}
                  onClick={() => {
                    if (isPrev) prevSlide();
                    if (isNext) nextSlide();
                  }}
                  role={isActive ? 'group' : 'button'}
                  tabIndex={isActive ? 0 : -1}
                  aria-label={`Review ${index + 1} of ${totalReviews} by ${rev.author}`}
                >
                  <div className="ps-review-slide-inner">
                    {/* 5 Gold Stars */}
                    <div className="ps-review-stars" aria-label="5 out of 5 stars">
                      {[...Array(rev.rating || 5)].map((_, i) => (
                        <Star
                          key={i}
                          size={18}
                          className="ps-review-star-icon"
                          fill="#D4AF37"
                          color="#D4AF37"
                        />
                      ))}
                    </div>

                    {/* Review Quote Body */}
                    <blockquote className="ps-review-quote">
                      <p>
                        “{rev.comment}”
                        {rev.hasHeart && (
                          <span className="ps-review-heart" aria-label="love">
                            {' '}
                            ❤️
                          </span>
                        )}
                      </p>
                    </blockquote>

                    {/* Attribution: Bold Title & Customer Name */}
                    <div className="ps-review-attribution">
                      <span className="ps-review-title">“{rev.title}”</span>
                      <span className="ps-review-author-name"> — {rev.author}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Carousel Navigation Controls (< 1 / 6 >) */}
        <div className="ps-reviews-controls">
          <button
            type="button"
            className="ps-reviews-nav-btn ps-reviews-prev-btn"
            onClick={prevSlide}
            aria-label="Previous review"
          >
            <ChevronLeft size={20} />
          </button>

          <div className="ps-reviews-counter" aria-live="polite">
            <span className="ps-reviews-current-num">{currentIndex + 1}</span>
            <span className="ps-reviews-counter-divider">/</span>
            <span className="ps-reviews-total-num">{totalReviews}</span>
          </div>

          <button
            type="button"
            className="ps-reviews-nav-btn ps-reviews-next-btn"
            onClick={nextSlide}
            aria-label="Next review"
          >
            <ChevronRight size={20} />
          </button>
        </div>
      </div>
    </section>
  );
}
