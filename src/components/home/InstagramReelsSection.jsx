import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Play } from 'lucide-react';
import { getReels } from '../../services/reels';
import { SITE_CONFIG } from '../../config/siteConfig';
import { cardImageUrl, fullImageFallback } from '../../lib/storage';
import './InstagramReelsSection.css';

// The homepage shows the first reels only; the full list is on /instagram
const HOMEPAGE_REEL_LIMIT = 10;
const LOGO_FALLBACK = '/assets/ps-perfumes-logo.webp';

function InstagramIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
    </svg>
  );
}

/** Only https Instagram links are opened; anything else falls back to the store's profile. */
function safeInstagramUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    const host = url.hostname.toLowerCase().replace(/^(www|m)\./, '');
    if (url.protocol === 'https:' && host === 'instagram.com') return url.toString();
  } catch {
    // invalid URL: use the profile below
  }
  return SITE_CONFIG.instagramUrl;
}

/**
 * Homepage "Follow Our Fragrance Journey" — reels managed in Admin → Instagram Reels
 * (instagram_reels: URL, thumbnail, caption, display order, active). Only active reels are
 * listed by the database for visitors. Thumbnails only: no video is downloaded or played here;
 * a card opens the reel on Instagram in a new tab.
 */
export default function InstagramReelsSection({
  title = 'Follow Our Fragrance Journey',
  subtitle = 'Discover our fragrances, stories, and moments.',
}) {
  const [reels, setReels] = useState([]);
  const [loading, setLoading] = useState(true);
  const trackRef = useRef(null);

  useEffect(() => {
    let mounted = true;
    getReels(false, { limit: HOMEPAGE_REEL_LIMIT })
      .then((data) => {
        if (mounted) setReels(Array.isArray(data) ? data : []);
      })
      .catch((err) => console.error('Could not load Instagram reels:', err?.message || err))
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
    track.scrollBy({ left: (direction === 'next' ? 1 : -1) * track.clientWidth * 0.8, behavior: reduce ? 'auto' : 'smooth' });
  };

  const isEmpty = !loading && reels.length === 0;

  return (
    <section className="ps-reels-section" id="instagram-reels" aria-labelledby="ps-reels-title">
      <div className="ps-reels-container">
        <header className="ps-reels-header">
          <div className="ps-reels-header-left">
            <span className="ps-reels-eyebrow">
              <InstagramIcon size={13} />
              <span>@ps_perfumes_kadapa</span>
            </span>
            <h2 id="ps-reels-title" className="ps-reels-title">
              {title || 'Follow Our Fragrance Journey'}
            </h2>
            {subtitle && <p className="ps-reels-sub">{subtitle}</p>}
          </div>

          <div className="ps-reels-header-right">
            <a href={SITE_CONFIG.instagramUrl} target="_blank" rel="noopener noreferrer" className="ps-reels-follow-btn">
              <InstagramIcon size={15} />
              <span>Follow on Instagram</span>
            </a>
            {reels.length > 3 && (
              <div className="ps-reels-carousel-arrows">
                <button type="button" className="ps-reels-arrow-btn" onClick={() => scroll('prev')} aria-label="Previous reels">
                  <ChevronLeft size={18} />
                </button>
                <button type="button" className="ps-reels-arrow-btn" onClick={() => scroll('next')} aria-label="Next reels">
                  <ChevronRight size={18} />
                </button>
              </div>
            )}
          </div>
        </header>

        {loading ? (
          <div className="ps-reels-track" aria-hidden="true">
            {[1, 2, 3, 4, 5].map((n) => (
              <div key={n} className="ps-reel-card ps-reel-skeleton" />
            ))}
          </div>
        ) : isEmpty ? (
          <p className="ps-reels-empty">
            New reels are on their way. Follow{' '}
            <a href={SITE_CONFIG.instagramUrl} target="_blank" rel="noopener noreferrer">
              @ps_perfumes_kadapa
            </a>{' '}
            to see them first.
          </p>
        ) : (
          <>
            <ul className="ps-reels-track" ref={trackRef}>
              {reels.map((reel) => (
                <li key={reel.id} className="ps-reel-item">
                  <a
                    href={safeInstagramUrl(reel.instagram_url)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ps-reel-card"
                    aria-label={`${reel.caption || 'PS PERFUMES reel'} (opens Instagram in a new tab)`}
                  >
                    <span className="ps-reel-media">
                      <img
                        src={cardImageUrl(reel.thumbnail_url) || LOGO_FALLBACK}
                        onError={(e) => {
                          if (fullImageFallback(reel.thumbnail_url)(e)) return;
                          // Missing or deleted thumbnail: show the brand logo instead of a broken image
                          const img = e.currentTarget;
                          if (img.dataset.fallback !== '1') {
                            img.dataset.fallback = '1';
                            img.src = LOGO_FALLBACK;
                            img.classList.add('is-fallback');
                          }
                        }}
                        alt=""
                        className="ps-reel-thumbnail"
                        loading="lazy"
                        decoding="async"
                        width="270"
                        height="480"
                      />
                      <span className="ps-reel-vignette" aria-hidden="true" />
                      <span className="ps-reel-play" aria-hidden="true">
                        <Play size={14} fill="currentColor" />
                      </span>
                      <span className="ps-reel-insta" aria-hidden="true">
                        <InstagramIcon size={13} />
                      </span>
                      {reel.caption && <span className="ps-reel-caption">{reel.caption}</span>}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
            <div className="ps-reels-more">
              <Link to="/instagram" className="ps-reels-more-link">
                View all reels
              </Link>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
