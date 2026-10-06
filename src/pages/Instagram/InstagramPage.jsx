import React, { useState, useEffect } from 'react';
import { ExternalLink, Play } from 'lucide-react';
import { getReels } from '../../services/reels';
import './InstagramPage.css';

function InstagramIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
    </svg>
  );
}

export default function InstagramPage() {
  const [reels, setReels] = useState([]);
  const [loading, setLoading] = useState(true);

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

  return (
    <div className="ps-instagram-page">
      <div className="ps-insta-hero">
        <div className="ps-insta-hero-container">
          <div className="ps-insta-pill">
            <InstagramIcon size={14} />
            <span>@PS_PERFUMES_KADAPA</span>
          </div>
          <h1 className="ps-insta-title">PS Perfumes on Instagram</h1>
          <p className="ps-insta-sub">
            Follow our sensory journeys, fragrance unboxings, and distillation craftsmanship live from Kadapa.
          </p>
          <a
            href="https://www.instagram.com/ps_perfumes_kadapa/?hl=en"
            target="_blank"
            rel="noopener noreferrer"
            className="ps-btn-gold-primary ps-insta-cta"
          >
            <InstagramIcon size={16} />
            <span>OPEN @PS_PERFUMES_KADAPA</span>
            <ExternalLink size={14} />
          </a>
        </div>
      </div>

      <div className="ps-insta-container">
        {loading ? (
          <div className="ps-insta-grid">
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <div key={n} className="ps-insta-card-skeleton" />
            ))}
          </div>
        ) : reels.length === 0 ? (
          <div className="ps-insta-empty">
            <p>No reels active currently. Follow us on Instagram for daily updates.</p>
          </div>
        ) : (
          <div className="ps-insta-grid">
            {reels.map((reel) => (
              <a
                key={reel.id}
                href={reel.instagram_url || 'https://www.instagram.com/ps_perfumes_kadapa/?hl=en'}
                target="_blank"
                rel="noopener noreferrer"
                className="ps-insta-card"
              >
                <div className="ps-insta-media">
                  <img
                    src={reel.thumbnail_url}
                    alt={reel.caption || 'PS Perfumes Reel'}
                    className="ps-insta-img"
                    loading="lazy"
                  />
                  <div className="ps-insta-vignette" />

                  <div className="ps-insta-play-badge">
                    <Play size={18} fill="#ffffff" color="#ffffff" style={{ marginLeft: 3 }} />
                  </div>

                  <div className="ps-insta-tag-top">
                    <InstagramIcon size={14} />
                    <span>Watch Reel</span>
                  </div>

                  {reel.caption && (
                    <div className="ps-insta-caption-box">
                      <p className="ps-insta-caption-p">{reel.caption}</p>
                    </div>
                  )}
                </div>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
