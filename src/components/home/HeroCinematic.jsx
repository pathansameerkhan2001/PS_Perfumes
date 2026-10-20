import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import { getStoragePublicUrl } from '../../lib/storage';
import posterDesktop from '../../assets/hero-luxury-cinematic.png';
import posterMobile from '../../assets/hero-luxury-cinematic-mobile.png';
import './HeroCinematic.css';

// Supabase Storage, configured bucket (VITE_SUPABASE_STORAGE_BUCKET = "Ps-perfumes-media")
const HERO_VIDEO_PATH = 'hero/ps-perfumes-hero-desktop.mp4';
// One reload attempt if the file fails to load (e.g. a dropped connection)
const LOAD_RETRY_DELAY_MS = 4000;

/**
 * PS PERFUMES — full-screen cinematic hero film.
 *
 * - The film is the whole hero: no heading, buttons or overlays with text.
 * - Muted, looping, inline autoplay (the only kind browsers allow without a click). No
 *   interaction is required to start it.
 * - If the browser refuses autoplay (data saver, iOS Low Power Mode, "block autoplay" settings),
 *   the poster stays and playback is retried silently on the next tap/click/key press or when
 *   the tab becomes visible again. If the file fails to load, it is retried once; otherwise
 *   the poster remains, so the hero is never blank.
 * - The film pauses while scrolled out of view (saves battery and CPU) and resumes on return.
 * - Visitors who ask for reduced motion (prefers-reduced-motion: reduce) see the poster; the
 *   film does not autoplay for them.
 * - A small, discreet pause/resume control (bottom-right corner, icon only) lets anyone stop or
 *   start the film. A deliberate pause is never undone automatically.
 * - No sound is ever played.
 */
export default function HeroCinematic() {
  const sectionRef = useRef(null);
  const videoRef = useRef(null);
  const retriedLoadRef = useRef(false);
  const inViewRef = useRef(true);
  const videoUrl = getStoragePublicUrl(HERO_VIDEO_PATH);
  // Phones get the lighter poster (620×384, ~0.6 MB instead of ~1 MB)
  const isNarrow = typeof window !== 'undefined' && window.matchMedia?.('(max-width: 768px)').matches;
  const poster = isNarrow ? posterMobile : posterDesktop;
  const prefersReducedMotion =
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  // Whether the film should be playing. Every automatic start (initial, retries, coming back into
  // view) checks this, so reduced-motion visitors and a deliberate pause are respected.
  const wantsPlayRef = useRef(!prefersReducedMotion);

  // 'loading' → 'playing' | 'paused' | 'blocked' (autoplay refused) | 'error' (file failed to load)
  const [status, setStatus] = useState(() => {
    if (!videoUrl) return 'error';
    return prefersReducedMotion ? 'paused' : 'loading';
  });

  const tryPlay = useCallback(() => {
    const video = videoRef.current;
    if (!video || !inViewRef.current || !wantsPlayRef.current) return;
    const attempt = video.play();
    if (attempt && typeof attempt.catch === 'function') {
      attempt.catch((err) => {
        // AbortError: interrupted by a newer play()/pause()/load() — not a failure
        if (err?.name === 'AbortError') return;
        console.warn(`Hero film autoplay was refused (${err?.name || 'unknown'}): ${err?.message || ''}`);
        setStatus((s) => (s === 'error' ? s : 'blocked'));
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

    let retryTimer = null;
    const onPlaying = () => setStatus('playing');
    // Paused by the visitor or by scrolling out of view (a refused autoplay keeps 'blocked')
    const onPause = () => setStatus((s) => (s === 'error' || s === 'blocked' ? s : 'paused'));
    const onCanPlay = () => {
      if (video.paused) tryPlay();
    };
    const onError = () => {
      const code = video.error?.code;
      console.warn(`Hero film failed to load${code ? ` (MediaError ${code})` : ''}: ${videoUrl}`);
      setStatus('error');
      if (!retriedLoadRef.current) {
        retriedLoadRef.current = true;
        retryTimer = window.setTimeout(() => {
          setStatus(wantsPlayRef.current ? 'loading' : 'paused');
          video.load();
          tryPlay();
        }, LOAD_RETRY_DELAY_MS);
      }
    };
    // Recovery after a refused autoplay: retry on the next real interaction or when visible again
    const onGesture = () => {
      if (video.paused) tryPlay();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible' && video.paused) tryPlay();
    };

    video.addEventListener('playing', onPlaying);
    video.addEventListener('pause', onPause);
    video.addEventListener('canplay', onCanPlay);
    video.addEventListener('error', onError);
    window.addEventListener('pointerdown', onGesture, { passive: true });
    window.addEventListener('keydown', onGesture);
    document.addEventListener('visibilitychange', onVisibility);

    // Pause while the hero is out of view; resume when it returns
    let observer = null;
    if (typeof IntersectionObserver !== 'undefined' && sectionRef.current) {
      observer = new IntersectionObserver(
        ([entry]) => {
          inViewRef.current = entry.isIntersecting;
          if (entry.isIntersecting) {
            if (video.paused) tryPlay();
          } else if (!video.paused) {
            video.pause();
          }
        },
        { threshold: 0.05 }
      );
      observer.observe(sectionRef.current);
    }

    tryPlay();

    return () => {
      window.clearTimeout(retryTimer);
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('canplay', onCanPlay);
      video.removeEventListener('error', onError);
      window.removeEventListener('pointerdown', onGesture);
      window.removeEventListener('keydown', onGesture);
      document.removeEventListener('visibilitychange', onVisibility);
      observer?.disconnect();
    };
  }, [videoUrl, tryPlay]);

  const togglePlayback = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      wantsPlayRef.current = true;
      tryPlay();
    } else {
      wantsPlayRef.current = false;
      video.pause();
    }
  };

  const isPlaying = status === 'playing';
  // No control while loading or when the file failed (there is nothing to play or pause)
  const showControl = status === 'playing' || status === 'paused' || status === 'blocked';

  return (
    <section
      ref={sectionRef}
      className={`ps-hero-cinematic is-${status}`}
      aria-label="PS PERFUMES fragrance film"
    >
      <div className="ps-hero-media-wrapper">
        <video
          ref={videoRef}
          className="ps-hero-cinematic-video"
          src={videoUrl || undefined}
          poster={poster}
          autoPlay={!prefersReducedMotion}
          muted
          loop
          playsInline
          webkit-playsinline="true"
          preload={prefersReducedMotion ? 'metadata' : 'auto'}
          disablePictureInPicture
          disableRemotePlayback
          controls={false}
          controlsList="nodownload nofullscreen noremoteplayback"
          tabIndex={-1}
          aria-hidden="true"
        >
          {/* Shown only by browsers without HTML5 video support */}
          <img src={poster} alt="" className="ps-hero-cinematic-video ps-hero-poster-fallback" />
        </video>

        {/* Subtle cinematic depth (no text or controls) */}
        <div className="ps-hero-delicate-vignette" aria-hidden="true" />
        <div className="ps-hero-top-blend" aria-hidden="true" />
        <div className="ps-hero-bottom-blend" aria-hidden="true" />

        {/* Discreet pause/resume control (icon only, no text over the film) */}
        {showControl && (
          <button
            type="button"
            className="ps-hero-playback-toggle"
            onClick={togglePlayback}
            aria-label={isPlaying ? 'Pause background film' : 'Play background film'}
            title={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? <Pause size={14} aria-hidden="true" /> : <Play size={14} aria-hidden="true" />}
          </button>
        )}
      </div>
    </section>
  );
}
