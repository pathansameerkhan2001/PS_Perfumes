import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import { getStoragePublicUrl } from '../../lib/storage';
import {
  getActiveHeroFilm,
  BUILT_IN_HERO_POSTER_DESKTOP as posterDesktop,
  BUILT_IN_HERO_POSTER_MOBILE as posterMobile,
} from '../../services/hero';
import './HeroCinematic.css';

// Built-in film (Supabase Storage, configured bucket "Ps-perfumes-media"), used when no active
// hero film is set in Admin → Hero Sections
const HERO_VIDEO_PATH = 'hero/ps-perfumes-hero-desktop.mp4';
// One reload attempt if the file fails to load (e.g. a dropped connection)
const LOAD_RETRY_DELAY_MS = 4000;
// How long to wait for the admin hero setting before using the built-in film
const SETTING_TIMEOUT_MS = 1500;
// The resolved setting is kept for this browser tab, so returning to the homepage starts the
// film at once instead of waiting for the database; it is still re-checked every time
const SETTING_CACHE_KEY = 'ps_hero_film_v1';
// The film is requested once the page has finished loading (or after this long at most), so it
// never competes with the poster, scripts and above-the-fold images for bandwidth
const FILM_DEFER_MAX_MS = 2500;
// Network classes on which a multi-megabyte film is not started on its own
const SLOW_NETWORKS = new Set(['slow-2g', '2g', '3g']);

function readCachedFilm() {
  try {
    const raw = sessionStorage.getItem(SETTING_CACHE_KEY);
    return raw ? JSON.parse(raw) : undefined; // undefined = not resolved yet in this tab
  } catch {
    return undefined;
  }
}

function writeCachedFilm(film) {
  try {
    sessionStorage.setItem(SETTING_CACHE_KEY, JSON.stringify(film || null));
  } catch {
    // private mode / storage disabled: the setting is simply fetched again next time
  }
}

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
 * - Visitors who ask for reduced motion (prefers-reduced-motion: reduce), use Data Saver or are on
 *   a 2G/3G-class connection see the poster and a clear play control; the film is not downloaded
 *   until they press it.
 * - Otherwise the film is requested only after the page has loaded (poster first), so it does not
 *   delay the first render or the rest of the page.
 * - A small, discreet pause/resume control (bottom-right corner, icon only) lets anyone stop or
 *   start the film. A deliberate pause is never undone automatically.
 * - The film and poster come from Admin → Hero Sections (active record with the lowest display
 *   order that has an MP4); otherwise the built-in film and poster are used.
 * - No sound is ever played.
 */
export default function HeroCinematic() {
  const sectionRef = useRef(null);
  const videoRef = useRef(null);
  const retriedLoadRef = useRef(false);
  const inViewRef = useRef(true);
  const defaultVideoUrl = getStoragePublicUrl(HERO_VIDEO_PATH);
  // Phones get the lighter built-in poster (620×384 instead of 1024×384; same breakpoint as the
  // preload in index.html)
  const isNarrow = typeof window !== 'undefined' && window.matchMedia?.('(max-width: 768px)').matches;
  const defaultPoster = isNarrow ? posterMobile : posterDesktop;
  const prefersReducedMotion =
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  // Data Saver / "Lite mode" or a 2G/3G-class connection: do not start a multi-megabyte film on
  // its own; the poster and the play control stay, and the visitor can start it with one tap
  const connection = typeof navigator !== 'undefined' ? navigator.connection : undefined;
  const saveData = connection?.saveData === true;
  const slowNetwork = SLOW_NETWORKS.has(connection?.effectiveType);
  const autoStart = !prefersReducedMotion && !saveData && !slowNetwork;

  // True once the page has finished loading (immediately when returning to the homepage)
  const [pageLoaded, setPageLoaded] = useState(
    () => typeof document !== 'undefined' && document.readyState === 'complete'
  );
  useEffect(() => {
    if (pageLoaded) return undefined;
    const done = () => setPageLoaded(true);
    window.addEventListener('load', done, { once: true });
    const timer = window.setTimeout(done, FILM_DEFER_MAX_MS);
    return () => {
      window.removeEventListener('load', done);
      window.clearTimeout(timer);
    };
  }, [pageLoaded]);

  // The film to play: resolved once from the admin setting before any video is requested, so
  // the built-in film and a configured one are never both downloaded. null = still resolving.
  const toSource = (film) => ({
    videoUrl: film?.videoUrl || defaultVideoUrl,
    poster: film?.posterUrl || defaultPoster,
  });
  const [source, setSource] = useState(() => {
    const cached = readCachedFilm();
    return cached === undefined ? null : toSource(cached);
  });
  useEffect(() => {
    let active = true;
    const startedFromCache = source !== null;
    let settled = startedFromCache;
    const settle = (film) => {
      if (settled) return;
      settled = true;
      setSource(toSource(film));
    };
    const timer = settled ? null : window.setTimeout(() => settle(null), SETTING_TIMEOUT_MS);
    // Always re-checked, so a film changed in Admin → Hero Sections shows on the next visit or
    // reload; a cached film is replaced only when the setting actually changed
    getActiveHeroFilm().then((film) => {
      writeCachedFilm(film);
      if (!active) return;
      if (!settled) {
        settle(film);
        return;
      }
      // Fell back to the built-in film after the timeout: keep it for this visit (no second
      // download); the cached answer is used next time
      if (!startedFromCache) return;
      const fresh = toSource(film);
      setSource((current) =>
        current && current.videoUrl === fresh.videoUrl && current.poster === fresh.poster ? current : fresh
      );
    });
    return () => {
      active = false;
      settled = true;
      if (timer) window.clearTimeout(timer);
    };
    // Resolved once per mount; the defaults do not change during a visit
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // The film is attached only after the page has loaded (see pageLoaded); until then only the
  // poster is shown
  const videoUrl = pageLoaded ? source?.videoUrl || '' : '';
  const poster = source?.poster || defaultPoster;

  // Whether the film should be playing. Every automatic start (initial, retries, coming back into
  // view) checks this, so reduced-motion visitors and a deliberate pause are respected.
  const wantsPlayRef = useRef(autoStart);

  // 'loading' → 'playing' | 'paused' | 'blocked' (autoplay refused) | 'error' (file failed to load)
  const [status, setStatus] = useState(() => (autoStart ? 'loading' : 'paused'));

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
      // Pressed before the page finished loading: attach the film now (its effect starts playback)
      if (!pageLoaded) {
        setPageLoaded(true);
        return;
      }
      tryPlay();
    } else {
      wantsPlayRef.current = false;
      video.pause();
    }
  };

  const isPlaying = status === 'playing';
  // No control while loading or when the file failed (there is nothing to play or pause)
  const showControl = status === 'playing' || status === 'paused' || status === 'blocked';
  // When the film is not playing (refused autoplay, reduced motion, Data Saver, paused) the
  // control is shown larger and fully visible so the poster never looks like a broken video
  const controlIsProminent = showControl && !isPlaying;

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
          autoPlay={autoStart}
          muted
          loop
          playsInline
          webkit-playsinline="true"
          /* Nothing is downloaded until the visitor asks for it when autoplay is off */
          preload={autoStart ? 'auto' : 'none'}
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
            className={`ps-hero-playback-toggle${controlIsProminent ? ' is-prominent' : ''}`}
            onClick={togglePlayback}
            aria-label={isPlaying ? 'Pause background film' : 'Play background film'}
            title={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? (
              <Pause size={14} aria-hidden="true" />
            ) : (
              <Play size={controlIsProminent ? 20 : 14} aria-hidden="true" style={{ marginLeft: 2 }} />
            )}
          </button>
        )}
      </div>
    </section>
  );
}
