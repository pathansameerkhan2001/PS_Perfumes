import React, { useState } from 'react';
import { Star, CheckCircle, ChevronLeft, ChevronRight, Quote } from 'lucide-react';
import { REVIEWS } from '../data/reviews';
import './Sections.css';

export default function ReviewsSection() {
  const [startIndex, setStartIndex] = useState(0);

  const prevReview = () => {
    setStartIndex((prev) => (prev === 0 ? Math.max(0, REVIEWS.length - 3) : prev - 1));
  };

  const nextReview = () => {
    setStartIndex((prev) => (prev >= REVIEWS.length - 3 ? 0 : prev + 1));
  };

  const visibleReviews = REVIEWS.slice(startIndex, startIndex + 3);

  return (
    <section className="ps-reviews-section" aria-label="Customer Reviews">
      <div className="ps-reviews-container">
        {/* Header */}
        <div className="ps-reviews-header">
          <span className="ps-reviews-tag">PATRON TESTIMONIALS</span>
          <h2 className="ps-reviews-heading">Loved By Discerning Fragrance Connoisseurs</h2>
          <div className="ps-bestsellers-divider" />
          <p className="ps-reviews-subheading">
            Over 25,000+ luxury perfume orders delivered across 40 countries with an average 4.9/5 rating.
          </p>
        </div>

        {/* Reviews Cards Grid */}
        <div className="ps-reviews-grid">
          {visibleReviews.map((rev) => (
            <div key={rev.id} className="ps-review-card">
              <div className="ps-review-top">
                <div className="ps-review-stars">
                  {[...Array(5)].map((_, i) => (
                    <Star
                      key={i}
                      size={14}
                      fill="#c5a059"
                      color="#c5a059"
                    />
                  ))}
                </div>
                <Quote size={20} className="ps-review-quote-icon" />
              </div>

              <h4 className="ps-review-title">"{rev.title}"</h4>
              <p className="ps-review-comment">{rev.comment}</p>

              <div className="ps-review-author-row">
                <div className="ps-review-avatar">
                  {rev.author.charAt(0)}
                </div>
                <div className="ps-review-meta">
                  <div className="ps-review-name-wrap">
                    <span className="ps-review-author">{rev.author}</span>
                    {rev.verified && (
                      <span className="ps-review-verified">
                        <CheckCircle size={12} color="#10b981" />
                        <span>Verified Buyer</span>
                      </span>
                    )}
                  </div>
                  <span className="ps-review-product-name">{rev.productName} • {rev.location}</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Controls */}
        <div className="ps-reviews-controls">
          <button
            type="button"
            className="ps-reviews-nav-btn"
            onClick={prevReview}
            aria-label="Previous reviews"
          >
            <ChevronLeft size={18} />
          </button>
          <div className="ps-reviews-dots">
            {REVIEWS.map((_, idx) => (
              <button
                key={idx}
                type="button"
                className={`ps-review-dot ${idx === startIndex ? 'is-active' : ''}`}
                onClick={() => setStartIndex(Math.min(idx, REVIEWS.length - 3))}
                aria-label={`Go to review ${idx + 1}`}
              />
            ))}
          </div>
          <button
            type="button"
            className="ps-reviews-nav-btn"
            onClick={nextReview}
            aria-label="Next reviews"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>
    </section>
  );
}
