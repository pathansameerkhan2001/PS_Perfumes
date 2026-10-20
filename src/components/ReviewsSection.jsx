import React, { useState, useEffect, useRef } from 'react';
import { Star, ChevronLeft, ChevronRight } from 'lucide-react';
import { getReviews } from '../services/reviews';
import './ReviewsSection.css';

// The homepage shows a few reviews only (featured first, then newest)
const HOMEPAGE_REVIEW_LIMIT = 6;
// Long reviews are shortened on the card; "Read more" shows the rest in place
const LONG_REVIEW_CHARS = 220;

function Stars({ rating }) {
  return (
    <span className="ps-rev-stars" role="img" aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          size={14}
          aria-hidden="true"
          fill={i <= rating ? '#B08A48' : 'none'}
          color={i <= rating ? '#B08A48' : '#CFC6B8'}
          strokeWidth={1.6}
        />
      ))}
    </span>
  );
}

function ReviewCard({ review }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = review.comment.length > LONG_REVIEW_CHARS;
  return (
    <article className="ps-rev-card">
      <Stars rating={review.rating} />
      {review.title && <h3 className="ps-rev-title">{review.title}</h3>}
      <p className={`ps-rev-text${isLong && !expanded ? ' is-clamped' : ''}`}>{review.comment}</p>
      {isLong && (
        <button type="button" className="ps-rev-more" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded}>
          {expanded ? 'Show less' : 'Read more'}
        </button>
      )}
      <footer className="ps-rev-footer">
        <span className="ps-rev-author">{review.author}</span>
        {review.product && <span className="ps-rev-product">on {review.product}</span>}
      </footer>
    </article>
  );
}

/**
 * Homepage "Loved by Fragrance Enthusiasts": approved reviews from the reviews table, managed
 * in Admin → Reviews (approve / hide / feature / edit). Nothing is invented: name, rating and
 * text are shown as stored, and there is no "verified purchase" badge because the database
 * does not record purchase verification.
 */
export default function ReviewsSection({
  title = 'Loved by Fragrance Enthusiasts',
  subtitle = 'Experiences shared by our customers.',
}) {
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const trackRef = useRef(null);

  useEffect(() => {
    let mounted = true;
    getReviews(false, { featuredFirst: true, limit: HOMEPAGE_REVIEW_LIMIT })
      .then((rows) => {
        if (!mounted) return;
        setReviews(
          rows
            .filter((r) => r.comment && r.comment.trim())
            .map((r) => ({
              id: r.id,
              title: r.title || '',
              comment: r.comment.trim(),
              author: r.customer_name || 'Customer',
              product: r.product_name || '',
              rating: Math.max(1, Math.min(5, Math.round(Number(r.rating) || 5))),
            }))
        );
      })
      .catch((err) => console.error('Could not load reviews:', err?.message || err))
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const scroll = (direction) => {
    const track = trackRef.current;
    if (!track) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    track.scrollBy({ left: (direction === 'next' ? 1 : -1) * track.clientWidth * 0.9, behavior: reduce ? 'auto' : 'smooth' });
  };

  // Still loading: render nothing yet (the section is below the fold; avoids a flash of the empty state)
  if (loading) return null;

  return (
    <section className="ps-reviews-section" aria-labelledby="ps-reviews-title">
      <div className="ps-reviews-container">
        <header className="ps-reviews-header">
          <span className="ps-reviews-eyebrow">CUSTOMER STORIES</span>
          <h2 id="ps-reviews-title" className="ps-reviews-heading">
            {title || 'Loved by Fragrance Enthusiasts'}
          </h2>
          {subtitle && <p className="ps-reviews-subtitle">{subtitle}</p>}
          <span className="ps-reviews-rule" aria-hidden="true" />
        </header>

        {reviews.length === 0 ? (
          <p className="ps-reviews-empty">Customer reviews will appear here soon.</p>
        ) : (
          <>
            <div className="ps-reviews-track" ref={trackRef} role="list">
              {reviews.map((rev) => (
                <div className="ps-reviews-item" role="listitem" key={rev.id}>
                  <ReviewCard review={rev} />
                </div>
              ))}
            </div>
            {reviews.length > 3 && (
              <div className="ps-reviews-controls">
                <button type="button" className="ps-reviews-nav-btn" onClick={() => scroll('prev')} aria-label="Previous reviews">
                  <ChevronLeft size={18} />
                </button>
                <button type="button" className="ps-reviews-nav-btn" onClick={() => scroll('next')} aria-label="Next reviews">
                  <ChevronRight size={18} />
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
