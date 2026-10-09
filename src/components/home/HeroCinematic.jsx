import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Play } from 'lucide-react';
import { getStoragePublicUrl } from '../../lib/storage';
import posterDesktop from '../../assets/hero-luxury-cinematic.png';
import './HeroCinematic.css';

const HERO_VIDEO_PATH = 'hero/ps-perfumes-hero-desktop.mp4';
const HERO_VIDEO_FALLBACK =
  'https://jnrmmhzhhmjxefapkemv.supabase.co/storage/v1/object/public/ps-perfumes/hero/ps-perfumes-hero-desktop.mp4';

export default function HeroCinematic() {
  const videoRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isAutoplayBlocked, setIsAutoplayBlocked] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  const videoUrl = getStoragePublicUrl(HERO_VIDEO_PATH) || HERO_VIDEO_FALLBACK;

  // 1. Detect OS / browser reduced-motion accessibility preference
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);

    const handler = (e) => setPrefersReducedMotion(e.matches);
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  // 2. Playback Controller: explicitly sets DOM muted properties required by desktop Chrome & Safari
  const attemptPlay = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;

    // Strict requirements for desktop Chrome, Safari, Edge, Firefox muted autoplay:
    // React's JSX muted attribute does not reliably set the DOM property video.muted = true
    video.defaultMuted = true;
    video.muted = true;
    video.playsInline = true;

    try {
      await video.play();
      setIsPlaying(true);
      setIsAutoplayBlocked(false);
    } catch (err) {
      console.info('Hero video autoplay deferred by browser policy:', err?.message || err);
      setIsPlaying(false);
      setIsAutoplayBlocked(true);
    }
  }, []);

  // 3. Initiate playback on mount and handle readyState transitions
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // Synchronize DOM properties directly on video element
    video.defaultMuted = true;
    video.muted = true;
    video.playsInline = true;

    if (prefersReducedMotion) {
      // Respect accessibility preference: leave paused initially, provide accessible user play trigger
      video.pause();
      setIsPlaying(false);
      setIsAutoplayBlocked(true);
      return;
    }

    if (video.readyState >= 2) {
      attemptPlay();
    } else {
      const onCanPlay = () => attemptPlay();
      video.addEventListener('canplay', onCanPlay, { once: true });
      video.addEventListener('loadeddata', onCanPlay, { once: true });
      attemptPlay();

      return () => {
        video.removeEventListener('canplay', onCanPlay);
        video.removeEventListener('loadeddata', onCanPlay);
      };
    }
  }, [attemptPlay, prefersReducedMotion, videoUrl]);

  // 4. Accessible manual playback trigger for blocked autoplay or reduced-motion preference
  const handleManualPlay = (e) => {
    if (e && e.stopPropagation) e.stopPropagation();
    const video = videoRef.current;
    if (!video) return;

    video.defaultMuted = true;
    video.muted = true;
    video
      .play()
      .then(() => {
        setIsPlaying(true);
        setIsAutoplayBlocked(false);
      })
      .catch((err) => {
        console.warn('Manual hero video playback failed:', err);
      });
  };

  return (
    <section
      className="ps-hero-cinematic"
      aria-label="PS PERFUMES Royal Haute Parfumerie Campaign"
      onClick={() => {
        if (!isPlaying) {
          handleManualPlay();
        }
      }}
    >
      <div className="ps-hero-media-wrapper">
        <video
          ref={videoRef}
          className="ps-hero-cinematic-video"
          poster={posterDesktop}
          autoPlay
          muted
          loop
          playsInline
          controls={false}
          preload="metadata"
          disablePictureInPicture
          controlsList="nodownload nofullscreen noremoteplayback"
          aria-label="PS PERFUMES Royal Haute Parfumerie Showcase"
          onPlay={() => {
            setIsPlaying(true);
            setIsAutoplayBlocked(false);
          }}
          onPause={() => setIsPlaying(false)}
        >
          <source src={videoUrl} type="video/mp4" />
          {/* Fallback image if HTML5 video tag is not supported */}
          <img
            src={posterDesktop}
            alt="PS PERFUMES Royal Haute Parfumerie Showcase"
            className="ps-hero-cinematic-video ps-hero-poster-fallback"
          />
        </video>

        {/* Ambient Luxury Vignette & Soft Gradient Blends */}
        <div className="ps-hero-delicate-vignette" aria-hidden="true" />
        <div className="ps-hero-top-blend" aria-hidden="true" />
        <div className="ps-hero-bottom-blend" aria-hidden="true" />

        {/* Accessible Playback Trigger (Shown gracefully when autoplay is blocked or deferred) */}
        {(isAutoplayBlocked || !isPlaying) && (
          <div className="ps-hero-playback-overlay">
            <button
              type="button"
              className="ps-hero-playback-btn"
              onClick={handleManualPlay}
              aria-label="Play PS PERFUMES Royal Showcase Video"
            >
              <span className="ps-hero-playback-icon-circle" aria-hidden="true">
                <Play size={18} fill="currentColor" className="ps-hero-playback-svg" />
              </span>
              <span className="ps-hero-playback-label">PLAY SHOWCASE</span>
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

