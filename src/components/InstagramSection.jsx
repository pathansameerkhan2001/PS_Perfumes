import React, { useState, useRef, useEffect } from 'react';
import poster1 from '../assets/insta-poster-1.webp';
import poster2 from '../assets/insta-poster-2.webp';
import poster3 from '../assets/insta-poster-3.webp';
import poster4 from '../assets/insta-poster-4.webp';
import './InstagramSection.css';

function InstagramIcon({ size = 24, color = 'currentColor' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
    </svg>
  );
}

const INSTA_POSTS = [
  {
    id: 1,
    videoUrl: '/assets/insta-video-1.mp4',
    poster: poster1,
    caption: 'Boutique fragrance unboxing & bespoke gift presentation',
    handle: '@ps_perfumes_kadapa',
  },
  {
    id: 2,
    videoUrl: '/assets/insta-video-2.mp4',
    poster: poster2,
    caption: 'Haute couture runway featuring our signature amber extractions',
    handle: '@ps_perfumes_kadapa',
  },
  {
    id: 3,
    videoUrl: '/assets/insta-video-3.mp4',
    poster: poster3,
    caption: 'Artisanal atelier compounding & rare agarwood distillation',
    handle: '@ps_perfumes_kadapa',
  },
  {
    id: 4,
    videoUrl: '/assets/insta-video-4.mp4',
    poster: poster4,
    caption: 'Royal crystal coffret packaging with handcrafted gold stopper',
    handle: '@ps_perfumes_kadapa',
  },
];

const INSTAGRAM_URL = 'https://www.instagram.com/ps_perfumes_kadapa/?hl=en';

function InstaCard({ post, isSectionVisible }) {
  const [shouldLoadVideo, setShouldLoadVideo] = useState(false);
  const videoRef = useRef(null);

  // Load video only when section is visible AND user either hovers or taps or has good connection
  useEffect(() => {
    if (isSectionVisible && !shouldLoadVideo) {
      // Delay video mounting slightly to allow critical UI thread to remain smooth
      const timer = setTimeout(() => {
        setShouldLoadVideo(true);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [isSectionVisible]);

  useEffect(() => {
    if (shouldLoadVideo && videoRef.current) {
      videoRef.current.play().catch(() => {
        // Autoplay policy fallback (silent)
      });
    }
  }, [shouldLoadVideo]);

  return (
    <a
      href={INSTAGRAM_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="ps-insta-card"
      aria-label={`View Instagram post: ${post.caption}`}
      onMouseEnter={() => setShouldLoadVideo(true)}
      onTouchStart={() => setShouldLoadVideo(true)}
    >
      <div className="ps-insta-media-wrapper">
        {shouldLoadVideo ? (
          <video
            ref={videoRef}
            src={post.videoUrl}
            poster={post.poster}
            autoPlay
            loop
            muted
            playsInline
            className="ps-insta-video"
            preload="metadata"
          />
        ) : (
          <img
            src={post.poster}
            alt={post.caption}
            className="ps-insta-video"
            loading="lazy"
            decoding="async"
            width="320"
            height="400"
          />
        )}

        {/* Hover overlay with Instagram icon and handle */}
        <div className="ps-insta-overlay">
          <div className="ps-insta-overlay-content">
            <span className="ps-insta-icon-badge">
              <InstagramIcon size={24} />
            </span>
            <span className="ps-insta-overlay-handle">@ps_perfumes_kadapa</span>
            <span className="ps-insta-overlay-cta">View On Instagram</span>
          </div>
        </div>
      </div>
    </a>
  );
}

export default function InstagramSection() {
  const sectionRef = useRef(null);
  const [isSectionVisible, setIsSectionVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting) {
          setIsSectionVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '250px' }
    );

    if (sectionRef.current) {
      observer.observe(sectionRef.current);
    }

    return () => observer.disconnect();
  }, []);

  return (
    <section ref={sectionRef} className="ps-insta-section" aria-label="Follow us on Instagram">
      <div className="ps-insta-container">
        {/* Section Header */}
        <div className="ps-insta-header">
          <h2 className="ps-insta-heading">Follow us Instagram</h2>
          <p className="ps-insta-description">
            Tag{' '}
            <a
              href={INSTAGRAM_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="ps-insta-tag-link"
            >
              @ps_perfumes_kadapa
            </a>{' '}
            in your Instagram photos or video for a chance to be featured here.
            <br />
            Find more inspiration on{' '}
            <a
              href={INSTAGRAM_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="ps-insta-bold-link"
            >
              our Instagram.
            </a>
          </p>
        </div>

        {/* 4 Media Cards */}
        <div className="ps-insta-grid">
          {INSTA_POSTS.map((post) => (
            <InstaCard
              key={post.id}
              post={post}
              isSectionVisible={isSectionVisible}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
