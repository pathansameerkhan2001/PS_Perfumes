import React, { useState, useEffect, useRef } from 'react';
import { getStoragePublicUrl } from '../../lib/storage';
import posterDesktop from '../../assets/hero-luxury-cinematic.png';
import './HeroCinematic.css';

const HERO_VIDEO_PATH = 'hero/ps-perfumes-hero-desktop.mp4';
const HERO_VIDEO_FALLBACK =
  'https://jnrmmhzhhmjxefapkemv.supabase.co/storage/v1/object/public/ps-perfumes/hero/ps-perfumes-hero-desktop.mp4';

export default function HeroCinematic() {
  const videoRef = useRef(null);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const videoUrl = getStoragePublicUrl(HERO_VIDEO_PATH) || HERO_VIDEO_FALLBACK;

  // Respect OS / browser reduced-motion accessibility preference
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);

    const handler = (e) => setPrefersReducedMotion(e.matches);
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  // Ensure autoplay fires reliably across mobile and desktop browsers
  useEffect(() => {
    if (videoRef.current && !prefersReducedMotion) {
      const playPromise = videoRef.current.play();
      if (playPromise !== undefined) {
        playPromise.catch(() => {
          // Video will display fallback poster if browser strictly blocks autoplay
        });
      }
    }
  }, [prefersReducedMotion, videoUrl]);

  return (
    <section
      className="ps-hero-cinematic"
      aria-label="PS PERFUMES Royal Haute Parfumerie Campaign"
    >
      <div className="ps-hero-media-wrapper">
        {prefersReducedMotion ? (
          <img
            src={posterDesktop}
            alt="PS PERFUMES Royal Haute Parfumerie Showcase"
            className="ps-hero-cinematic-video ps-hero-poster-only"
            loading="eager"
            fetchPriority="high"
          />
        ) : (
          <video
            ref={videoRef}
            className="ps-hero-cinematic-video"
            src={videoUrl}
            poster={posterDesktop}
            autoPlay
            muted
            loop
            playsInline
            controls={false}
            preload="metadata"
            aria-label="PS PERFUMES Royal Haute Parfumerie Showcase"
          >
            <source src={videoUrl} type="video/mp4" />
            {/* Fallback image if video cannot be decoded */}
            <img
              src={posterDesktop}
              alt="PS PERFUMES Royal Haute Parfumerie Showcase"
              className="ps-hero-cinematic-video"
            />
          </video>
        )}

        {/* Ambient Luxury Vignette & Soft Gradient Blends */}
        <div className="ps-hero-delicate-vignette" aria-hidden="true" />
        <div className="ps-hero-top-blend" aria-hidden="true" />
        <div className="ps-hero-bottom-blend" aria-hidden="true" />
      </div>
    </section>
  );
}
