import React, { useEffect, useRef } from 'react';
import { getStoragePublicUrl } from '../../lib/storage';
import posterFallback from '../../assets/hero-luxury-cinematic.png';
import './HeroCinematic.css';

const HERO_VIDEO_PATH = 'hero/ps-perfumes-hero-desktop.mp4';

/**
 * PS PERFUMES — Luxury Brand Automatic Hero Video
 *
 * Core Project Requirement:
 * - Displays the dedicated automatic cinematic brand video:
 *   Supabase Storage: configured bucket (VITE_SUPABASE_STORAGE_BUCKET), path 'hero/ps-perfumes-hero-desktop.mp4'
 *   of the configured project. No hard-coded project URL: the poster image shows if it is missing.
 * - HTML5 video element with autoPlay, muted, loop, playsInline across modern desktop and mobile browsers
 * - Pure luxury visual experience with zero obstructive play buttons, play icons, or click overlays
 * - Positioned seamlessly beneath the fixed brand navigation with object-fit: cover
 */
export default function HeroCinematic() {
  const videoRef = useRef(null);
  const videoUrl = getStoragePublicUrl(HERO_VIDEO_PATH);
  // Visitors who asked their OS for reduced motion see the still poster instead of a looping video
  const prefersReducedMotion =
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // Strict requirements for modern browsers (Chrome, Safari, iOS Safari, Android):
    // Setting muted and playsinline directly on DOM properties ensures autoplay is honored
    video.defaultMuted = true;
    video.muted = true;
    video.playsInline = true;
    video.setAttribute('muted', '');
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');

    if (prefersReducedMotion) {
      video.pause();
      return undefined;
    }

    const attemptPlay = () => {
      const playPromise = video.play();
      if (playPromise !== undefined) {
        playPromise.catch((err) => {
          console.info('Hero video autoplay deferred by browser policy:', err?.message || err);
        });
      }
    };

    if (video.readyState >= 2) {
      attemptPlay();
    } else {
      video.addEventListener('canplay', attemptPlay, { once: true });
      video.addEventListener('loadeddata', attemptPlay, { once: true });
      attemptPlay();
    }

    // Safety fallback: if autoplay was temporarily deferred by browser power/interaction policy,
    // ensure playback kicks off immediately on first user interaction anywhere on the page
    const handleFirstGesture = () => {
      if (video && video.paused) {
        video.play().catch(() => {});
      }
    };
    window.addEventListener('touchstart', handleFirstGesture, { once: true, passive: true });
    window.addEventListener('click', handleFirstGesture, { once: true });

    return () => {
      video.removeEventListener('canplay', attemptPlay);
      video.removeEventListener('loadeddata', attemptPlay);
      window.removeEventListener('touchstart', handleFirstGesture);
      window.removeEventListener('click', handleFirstGesture);
    };
  }, [videoUrl, prefersReducedMotion]);

  return (
    <section className="ps-hero-cinematic" aria-label="PS PERFUMES Haute Parfumerie Campaign">
      <div className="ps-hero-media-wrapper">
        <video
          ref={videoRef}
          className="ps-hero-cinematic-video"
          src={videoUrl || undefined}
          poster={posterFallback}
          autoPlay={!prefersReducedMotion}
          muted
          loop
          playsInline
          webkit-playsinline="true"
          preload={prefersReducedMotion ? 'metadata' : 'auto'}
          disablePictureInPicture
          controls={false}
          controlsList="nodownload nofullscreen noremoteplayback"
          aria-label="PS PERFUMES Haute Parfumerie Showcase"
        >
          {videoUrl && <source src={videoUrl} type="video/mp4" />}
          <img
            src={posterFallback}
            alt="PS PERFUMES Haute Parfumerie Showcase"
            className="ps-hero-cinematic-video ps-hero-poster-fallback"
          />
        </video>

        {/* Ambient Luxury Vignette & Soft Gradient Blends */}
        <div className="ps-hero-delicate-vignette" aria-hidden="true" />
        <div className="ps-hero-top-blend" aria-hidden="true" />
        <div className="ps-hero-bottom-blend" aria-hidden="true" />
      </div>
    </section>
  );
}
