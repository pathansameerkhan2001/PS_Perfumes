import React, { useState, useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, Play, ExternalLink } from 'lucide-react';
import { getReels } from '../../services/reels';
import './InstagramReelsSection.css';

function InstagramIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
    </svg>
  );
}

export default function InstagramReelsSection() {
  const [reels, setReels] = useState([]);
  const [loading, setLoading] = useState(true);
  const trackRef = useRef(null);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const data = await getReels(false);
        if (mounted) {
          setReels(data);
          setLoading(false);
        }
      } catch {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => { mounted = false; };
  }, []);

  const scroll = (direction) => {
    if (trackRef.current) {
      const scrollAmount = trackRef.current.clientWidth * 0.7;
      trackRef.current.scrollBy({
        left: direction === 'next' ? scrollAmount : -scrollAmount,
        behavior: 'smooth',
      });
    }
  };

  return (
    <section className="ps-reels-section" id="instagram-reels" aria-label="PS PERFUMES on Instagram">
      <div className="ps-reels-container">
        {/* Section Header */}
        <div className="ps-reels-header">
          <div className="ps-reels-header-left">
            <span className="ps-reels-eyebrow">
              <InstagramIcon size={14} />
              <span>@PS_PERFUMES_KADAPA</span>
            </span>
            <h2 className="ps-reels-title">PS Perfumes on Instagram</h2>
            <p className="ps-reels-sub">
              Watch real sensory stories, unboxings, and distillation journals from our Kadapa atelier.
            </p>
          </div>

          <div className="ps-reels-header-right">
            <a
              href="https://www.instagram.com/ps_perfumes_kadapa/?hl=en"
              target="_blank"
              rel="noopener noreferrer"
              className="ps-reels-follow-btn"
            >
              <InstagramIcon size={16} />
              <span>FOLLOW ON INSTAGRAM</span>
              <ExternalLink size={14} />
            </a>

            <div className="ps-reels-carousel-arrows">
              <button
                type="button"
                className="ps-reels-arrow-btn"
                onClick={() => scroll('prev')}
                aria-label="Previous reels"
              >
                <ChevronLeft size={20} />
              </button>
              <button
                type="button"
                className="ps-reels-arrow-btn"
                onClick={() => scroll('next')}
                aria-label="Next reels"
              >
                <ChevronRight size={20} />
              </button>
            </div>
          </div>
        </div>

        {/* Carousel Reel Cards */}
        {loading ? (
          <div className="ps-reels-skeleton-row">
            {[1, 2, 3, 4].map((n) => (
              <div key={n} className="ps-reel-skeleton" />
            ))}
          </div>
        ) : (
          <div className="ps-reels-track" ref={trackRef}>
            {reels.map((reel) => (
              <a
                key={reel.id}
                href={reel.instagram_url || 'https://www.instagram.com/ps_perfumes_kadapa/?hl=en'}
                target="_blank"
                rel="noopener noreferrer"
                className="ps-reel-card"
                aria-label={reel.caption || 'Watch Reel on Instagram'}
              >
                {/* 9:16 Aspect Ratio Media Box */}
                <div className="ps-reel-media">
                  <img
                    src={reel.thumbnail_url}
                    alt={reel.caption || 'PS Perfumes Reel'}
                    className="ps-reel-thumbnail"
                    loading="lazy"
                    width="320"
                    height="568"
                  />
                  <div className="ps-reel-vignette" />

                  {/* Play & Instagram Badges */}
                  <div className="ps-reel-play-circle">
                    <Play size={18} fill="#ffffff" color="#ffffff" className="ps-play-svg" />
                  </div>

                  <div className="ps-reel-insta-tag">
                    <InstagramIcon size={15} />
                    <span>Watch Reel</span>
                  </div>

                  {/* Caption Overlay */}
                  {reel.caption && (
                    <div className="ps-reel-caption-wrap">
                      <p className="ps-reel-caption-text">{reel.caption}</p>
                    </div>
                  )}
                </div>
              </a>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
