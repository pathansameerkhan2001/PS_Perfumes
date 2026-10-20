import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Play, Pause } from 'lucide-react';
import { getStoragePublicUrl } from '../../lib/storage';
import { INITIAL_SECTIONS } from '../../services/homepage';
import posterDesktop from '../../assets/hero-luxury-cinematic.png';
import posterMobile from '../../assets/hero-luxury-cinematic-mobile.png';
import './HeroCinematic.css';

const HERO_VIDEO_PATH = 'hero/ps-perfumes-hero-desktop.mp4';
const DEFAULT_HERO = INITIAL_SECTIONS.find((s) => s.section_key === 'hero') || {};
// Placeholder copy from an earlier default layout; treated as "not set" so it never shows as text
const LEGACY_PLACEHOLDERS = new Set(['Pure visual luxury campaign showcasing the bespoke flacons of PS PERFUMES.']);

function cleanText(value) {
  const text = typeof value === 'string' ? value.trim() : '';
  return text && !LEGACY_PLACEHOLDERS.has(text) ? text : '';
}

/**
 * PS PERFUMES — Luxury Brand Automatic Hero Video
 *
 * - Video: configured bucket (VITE_SUPABASE_STORAGE_BUCKET), path 'hero/ps-perfumes-hero-desktop.mp4'
 *   of the configured project. No hard-coded project URL.
 * - Muted, looping, inline autoplay. The poster image stays visible until the first frame plays,
 *   and remains if the video cannot load, so the hero is never blank.
 * - When autoplay is refused (browser "block autoplay" settings, iOS Low Power Mode) or the visitor
 *   asked for reduced motion, the poster stays and a small Play button lets them start the film.
 *   While playing, the same button pauses it (WCAG 2.2.2: moving content needs a pause control).
 * - No sound is ever played.
 * - Heading, eyebrow, line and main button come from the homepage "hero" section
 *   (Admin → Homepage), falling back to the built-in defaults in services/homepage.js.
 */
export default function HeroCinematic({ section = null }) {
  const videoRef = useRef(null);
  // Phones get the lighter mobile poster (620×384, ~0.6 MB instead of ~1 MB)
  const isNarrow = typeof window !== 'undefined' && window.matchMedia?.('(max-width: 768px)').matches;
  const posterFallback = isNarrow ? posterMobile : posterDesktop;

  const hero = section || DEFAULT_HERO;
  const heading = cleanText(hero.title) || cleanText(DEFAULT_HERO.title);
  const eyebrow = cleanText(hero.metadata?.collection);
  const subline = cleanText(hero.subtitle);
  const ctaText = cleanText(hero.cta_text) || 'Shop the Collection';
  // Internal paths or http(s) URLs only (the value is admin-editable data)
  const rawLink = cleanText(hero.cta_link);
  const ctaLink = /^\/(?!\/)/.test(rawLink) || /^https?:\/\//i.test(rawLink) ? rawLink : '/shop';
  const ctaIsInternal = ctaLink.startsWith('/');
  // Set when the visitor pauses on purpose, so the first-gesture fallback never restarts it
  const userPausedRef = useRef(false);
  const videoUrl = getStoragePublicUrl(HERO_VIDEO_PATH);
  // Visitors who asked their OS for reduced motion are not shown a looping video automatically
  const prefersReducedMotion =
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  // 'loading' → 'playing' | 'paused' (autoplay refused, reduced motion or paused by the visitor) | 'error'
  const [status, setStatus] = useState(videoUrl ? 'loading' : 'error');

  const tryPlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    const playPromise = video.play();
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch((err) => {
        // AbortError: a newer play()/pause() or a source change interrupted this call — not a failure
        if (err?.name === 'AbortError') return;
        // NotAllowedError: autoplay refused by the browser. Keep the poster and offer the Play button.
        if (err?.name !== 'NotAllowedError') console.warn('Hero video could not start:', err?.name, err?.message);
        setStatus((s) => (s === 'error' ? s : 'paused'));
      });
    }
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoUrl) return undefined;

    // Mobile browsers only autoplay muted, inline video: set the DOM properties explicitly
    // (React does not reliably reflect the muted attribute)
    video.defaultMuted = true;
    video.muted = true;
    video.playsInline = true;
    video.setAttribute('muted', '');
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');

    const onPlaying = () => setStatus('playing');
    const onPause = () => setStatus((s) => (s === 'error' ? s : 'paused'));
    const onError = () => {
      const code = video.error?.code;
      console.warn('Hero video failed to load', code ? `(MediaError ${code})` : '', videoUrl);
      setStatus('error');
    };
    video.addEventListener('playing', onPlaying);
    video.addEventListener('pause', onPause);
    video.addEventListener('error', onError);

    if (prefersReducedMotion) {
      video.pause();
      setStatus('paused');
      return () => {
        video.removeEventListener('playing', onPlaying);
        video.removeEventListener('pause', onPause);
        video.removeEventListener('error', onError);
      };
    }

    tryPlay();

    // If autoplay was deferred (power saving, interaction policy), start on the first tap/click,
    // unless the visitor paused the film themselves
    const handleFirstGesture = () => {
      if (video.paused && !userPausedRef.current) tryPlay();
    };
    window.addEventListener('touchstart', handleFirstGesture, { once: true, passive: true });
    window.addEventListener('click', handleFirstGesture, { once: true });

    return () => {
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('error', onError);
      window.removeEventListener('touchstart', handleFirstGesture);
      window.removeEventListener('click', handleFirstGesture);
    };
  }, [videoUrl, prefersReducedMotion, tryPlay]);

  const togglePlayback = (e) => {
    // Do not let this click also count as the "first gesture" above
    e.stopPropagation();
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      userPausedRef.current = false;
      tryPlay();
    } else {
      userPausedRef.current = true;
      video.pause();
    }
  };

  const showControl = status === 'playing' || status === 'paused';

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
          preload="metadata"
          disablePictureInPicture
          controls={false}
          controlsList="nodownload nofullscreen noremoteplayback"
          aria-label="PS PERFUMES Haute Parfumerie Showcase"
        >
          {/* Shown only by browsers without HTML5 video support */}
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
        {/* Desktop/tablet legibility for the text; hidden on mobile where text is below the film */}
        <div className="ps-hero-scrim" aria-hidden="true" />

        {showControl && (
          <button
            type="button"
            className={`ps-hero-playback-toggle${status === 'paused' ? ' is-paused' : ''}`}
            onClick={togglePlayback}
            aria-label={status === 'playing' ? 'Pause the background film' : 'Play the background film'}
            title={status === 'playing' ? 'Pause' : 'Play film'}
          >
            {status === 'playing' ? <Pause size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}
          </button>
        )}
      </div>

      {heading && (
        <div className="ps-hero-content">
          <div className="ps-hero-content-inner">
            {eyebrow && <span className="ps-hero-eyebrow">{eyebrow}</span>}
            <h1 className="ps-hero-heading">{heading}</h1>
            <span className="ps-hero-rule" aria-hidden="true" />
            {subline && <p className="ps-hero-sub">{subline}</p>}
            <div className="ps-hero-actions">
              {ctaIsInternal ? (
                <Link to={ctaLink} className="ps-hero-btn ps-hero-btn--primary">{ctaText}</Link>
              ) : (
                <a href={ctaLink} className="ps-hero-btn ps-hero-btn--primary" rel="noopener noreferrer">{ctaText}</a>
              )}
              <Link to="/about" className="ps-hero-btn ps-hero-btn--ghost">Our Story</Link>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
