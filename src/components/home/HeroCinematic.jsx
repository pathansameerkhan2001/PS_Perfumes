import React, { useEffect, useRef } from 'react';
import { getStoragePublicUrl } from '../../lib/storage';
import posterFallback from '../../assets/hero-luxury-cinematic.png';
import './HeroCinematic.css';

const HERO_VIDEO_PATH = 'hero/ps-perfumes-hero-desktop.mp4';
const HERO_VIDEO_FALLBACK =
  'https://jnrmmhzhhmjxefapkemv.supabase.co/storage/v1/object/public/ps-perfumes/hero/ps-perfumes-hero-desktop.mp4';

/**
 * PS PERFUMES — Luxury Brand Automatic Hero Video
 *
 * Core Project Requirement:
 * - Displays the dedicated automatic cinematic brand video:
 *   Supabase Storage: bucket 'ps-perfumes', path 'hero/ps-perfumes-hero-desktop.mp4'
 * - HTML5 video element with autoPlay, muted, loop, playsInline across modern desktop and mobile browsers
 * - Pure luxury visual experience with zero obstructive play buttons, play icons, or click overlays
 * - Positioned seamlessly beneath the fixed brand navigation with object-fit: cover
 */
export default function HeroCinematic() {
  const videoRef = useRef(null);
  const videoUrl = getStoragePublicUrl(HERO_VIDEO_PATH) || HERO_VIDEO_FALLBACK;

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
  }, [videoUrl]);

  return (
    <section className="ps-hero-cinematic" aria-label="PS PERFUMES Haute Parfumerie Campaign">
      <div className="ps-hero-media-wrapper">
        <video
          ref={videoRef}
          className="ps-hero-cinematic-video"
          src={videoUrl}
          poster={posterFallback}
          autoPlay
          muted
          loop
          playsInline
          webkit-playsinline="true"
          preload="auto"
          disablePictureInPicture
          controls={false}
          controlsList="nodownload nofullscreen noremoteplayback"
          aria-label="PS PERFUMES Haute Parfumerie Showcase"
        >
          <source src={videoUrl} type="video/mp4" />
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
