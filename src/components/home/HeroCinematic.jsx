import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Music, Pause, Play, Volume2, VolumeX } from 'lucide-react';
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
// How long to wait for the admin hero setting before using the built-in film. Generous, so a slow
// first answer does not swap the owner's film and music for the built-in film for the whole
// visit; the poster is shown meanwhile, and later visits in the tab use the cached answer
const SETTING_TIMEOUT_MS = 5000;
// The resolved setting is kept for this browser tab, so returning to the homepage starts the
// film at once instead of waiting for the database; it is still re-checked every time
const SETTING_CACHE_KEY = 'ps_hero_film_v2';
// Starting volume of the sound (admin MP3 or the film's soundtrack); the visitor's own choice on
// the volume slider is remembered in this browser
const DEFAULT_VOLUME = 0.6;
const VOLUME_KEY = 'ps_hero_volume';
// The film is requested once the page has finished loading (or after this long at most), so it
// never competes with the poster, scripts and above-the-fold images for bandwidth
const FILM_DEFER_MAX_MS = 1200;
// Network classes on which a multi-megabyte film is not started on its own ('3g' is not one:
// Chrome reports it for many ordinary mobile connections)
const SLOW_NETWORKS = new Set(['slow-2g', '2g']);
// Events browsers accept as the visitor's permission to start sound (pointerup for Chrome,
// touchend / click for iOS Safari)
const ACTIVATION_EVENTS = ['pointerup', 'touchend', 'click', 'keydown'];
// Events that retry a film whose autoplay was refused
const RETRY_EVENTS = ['pointerdown', 'touchend', 'click', 'keydown'];

function readVolume() {
  try {
    const raw = localStorage.getItem(VOLUME_KEY);
    const v = Number(raw);
    return raw !== null && v >= 0 && v <= 1 ? v : DEFAULT_VOLUME;
  } catch {
    return DEFAULT_VOLUME;
  }
}

function writeVolume(v) {
  try {
    localStorage.setItem(VOLUME_KEY, String(v));
  } catch {
    // storage blocked: the volume simply resets next visit
  }
}

// iOS ignores volume set by a page (it always reads 1): the slider is hidden there and the
// device's volume buttons apply
const volumeAdjustable = (() => {
  try {
    const probe = document.createElement('audio');
    probe.volume = 0.5;
    return Math.abs(probe.volume - 0.5) < 0.01;
  } catch {
    return false;
  }
})();

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
 * - Autoplay (owner request, 2026-11-05) applies to every visitor, including those who ask for
 *   reduced motion (the pause control is always there). Only visitors with Data Saver on or a
 *   2G-class connection see the poster and a clear play control; the film is not downloaded until
 *   they press it.
 * - The film is requested once the page has loaded, or after FILM_DEFER_MAX_MS at most (poster
 *   first), so it does not delay the first render or the rest of the page.
 * - A small, discreet pause/resume control (bottom-right corner, icon only) lets anyone stop or
 *   start the film. A deliberate pause is never undone automatically.
 * - The film and poster come from Admin → Hero Sections (active record with the lowest display
 *   order that has an MP4); otherwise the built-in film and poster are used.
 * - Sound (owner request): the admin's MP3 when one is set, otherwise the film's own soundtrack;
 *   never both. It starts with the film when the browser allows sound without a click; most
 *   browsers do not, so the film then plays muted, a prominent gold "Enable Sound" control
 *   appears (bottom-left) and the visitor's first tap or key press turns the sound on. The same
 *   control then turns the sound off and on, with a volume slider beside it (not on iOS, which
 *   only honours the device's volume buttons); a visitor who turned it off is never overridden.
 *   With sound on, the film keeps playing while the visitor scrolls the homepage; it pauses
 *   while the tab is hidden and stops when they leave the homepage.
 * - Phones play the lighter mobile film when one is set.
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
  // Data Saver / "Lite mode" or a 2G/3G-class connection: do not start a multi-megabyte film on
  // its own; the poster and the play control stay, and the visitor can start it with one tap
  const connection = typeof navigator !== 'undefined' ? navigator.connection : undefined;
  const saveData = connection?.saveData === true;
  const slowNetwork = SLOW_NETWORKS.has(connection?.effectiveType);
  const autoStart = !saveData && !slowNetwork;

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
    videoUrl: (isNarrow && film?.mobileVideoUrl) || film?.videoUrl || defaultVideoUrl,
    poster: film?.posterUrl || defaultPoster,
    audioUrl: film?.audioUrl || '',
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
        current && current.videoUrl === fresh.videoUrl && current.poster === fresh.poster && current.audioUrl === fresh.audioUrl
          ? current
          : fresh
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
  // The poster layer covers the film until it has really started (its first 'playing' event), so
  // a refresh never shows a blank frame or a different picture in between; then it fades out
  const [filmStarted, setFilmStarted] = useState(false);

  // Sound: the admin's MP3 when one is set (its own player; the film stays muted), otherwise the
  // film's own soundtrack. Only one ever plays.
  const audioUrl = source?.audioUrl || '';
  const soundFromFilmRef = useRef(true);
  soundFromFilmRef.current = !audioUrl;
  // 'off' | 'pending' (trying to start with sound) | 'on' | 'blocked' (the browser wants an
  // interaction first) | 'paused' (the visitor turned it off) | 'error'
  const [sound, setSound] = useState('off');
  // False once the visitor has turned the sound off: nothing turns it back on by itself
  const soundWantedRef = useRef(true);
  // Set when the visitor asks for sound before the film is attached (e.g. Data Saver)
  const soundRequestedRef = useRef(false);
  // Sound volume (0–1), shared by the MP3 and the film's soundtrack
  const [volume, setVolume] = useState(readVolume);
  const volumeRef = useRef(volume);
  volumeRef.current = volume;

  const tryPlay = useCallback(() => {
    const video = videoRef.current;
    if (!video || !inViewRef.current || !wantsPlayRef.current) return;
    const attempt = video.play();
    if (attempt && typeof attempt.catch === 'function') {
      attempt.catch((err) => {
        // AbortError: interrupted by a newer play()/pause()/load() — not a failure
        if (err?.name === 'AbortError') return;
        // Autoplay with sound refused: play muted now and offer "Enable Sound"
        if (err?.name === 'NotAllowedError' && !video.muted) {
          video.muted = true;
          setSound((s) => (s === 'pending' || s === 'on' ? 'blocked' : s));
          tryPlay();
          return;
        }
        console.warn(`Hero film autoplay was refused (${err?.name || 'unknown'}): ${err?.message || ''}`);
        setStatus((s) => (s === 'error' ? s : 'blocked'));
      });
    }
    // tryPlay calls itself only for the muted retry
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoUrl) return undefined;

    // Mobile browsers only autoplay muted, inline video: set the DOM properties explicitly
    // (React does not reliably reflect the muted attribute)
    video.defaultMuted = true;
    // With the film's own soundtrack, the first start is tried with sound (some browsers allow
    // it); a refusal falls back to muted at once (tryPlay). Otherwise the film is always muted.
    const trySound = soundFromFilmRef.current && soundWantedRef.current && (autoStart || soundRequestedRef.current);
    video.muted = !trySound;
    video.volume = volumeRef.current;
    if (trySound) setSound((s) => (s === 'off' ? 'pending' : s));
    video.playsInline = true;
    video.setAttribute('muted', '');
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');

    let retryTimer = null;
    setFilmStarted(false);
    const onPlaying = () => {
      setStatus('playing');
      setFilmStarted(true);
      // Playing with sound: the soundtrack is on
      if (soundFromFilmRef.current && !video.muted) setSound('on');
    };
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
    // Another tab: the film (and its sound) pauses; back on this tab it continues
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        if (!video.paused) video.pause();
      } else if (video.paused) {
        tryPlay();
      }
    };

    video.addEventListener('playing', onPlaying);
    video.addEventListener('pause', onPause);
    video.addEventListener('canplay', onCanPlay);
    video.addEventListener('error', onError);
    RETRY_EVENTS.forEach((type) => window.addEventListener(type, onGesture, { passive: true }));
    document.addEventListener('visibilitychange', onVisibility);
    // The autoplay attribute may already have started the film before these listeners existed
    if (!video.paused && video.readyState >= 3) onPlaying();

    // Pause while the hero is out of view; resume when it returns
    let observer = null;
    if (typeof IntersectionObserver !== 'undefined' && sectionRef.current) {
      observer = new IntersectionObserver(
        ([entry]) => {
          inViewRef.current = entry.isIntersecting;
          if (entry.isIntersecting) {
            if (video.paused) tryPlay();
          } else if (!video.paused && video.muted) {
            // A silent film pauses out of view; with its soundtrack on it keeps playing, so the
            // music continues while the visitor scrolls the homepage
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
      RETRY_EVENTS.forEach((type) => window.removeEventListener(type, onGesture));
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

  // ---------------------------------------------------------------------------
  // Sound (one player at a time): the admin's MP3 in its own Audio element, or the film's own
  // soundtrack (the video unmuted). Started with sound when the browser allows it; otherwise
  // "Enable Sound" is offered and the visitor's first tap or key press turns it on.
  // ---------------------------------------------------------------------------
  const audioRef = useRef(null);

  const getAudio = useCallback(() => {
    if (audioRef.current) return audioRef.current;
    const audio = new Audio();
    audio.loop = true;
    audio.preload = 'auto';
    audio.volume = volumeRef.current;
    audio.addEventListener('error', () => {
      console.warn(`Hero music failed to load: ${audioUrl}`);
      setSound('error');
    });
    audio.src = audioUrl;
    audioRef.current = audio;
    return audio;
  }, [audioUrl]);

  const playAudio = useCallback(() => {
    const audio = getAudio();
    audio
      .play()
      .then(() => setSound('on'))
      .catch((err) => {
        if (err?.name === 'AbortError') return;
        // Sound needs an interaction first
        setSound(err?.name === 'NotAllowedError' ? 'blocked' : 'error');
      });
  }, [getAudio]);

  // Turns the sound on (button or first interaction: both count as the visitor's permission)
  const enableSound = useCallback(() => {
    soundWantedRef.current = true;
    if (audioUrl) {
      playAudio();
      return;
    }
    const video = videoRef.current;
    wantsPlayRef.current = true;
    if (!videoUrl || !video) {
      // Pressed before the film was attached: attach it now; it starts with sound
      soundRequestedRef.current = true;
      setPageLoaded(true);
      setSound('pending');
      return;
    }
    video.muted = false;
    setSound('on');
    if (video.paused) tryPlay();
  }, [audioUrl, playAudio, videoUrl, tryPlay]);

  const disableSound = useCallback(() => {
    soundWantedRef.current = false;
    if (audioUrl) audioRef.current?.pause();
    else if (videoRef.current) videoRef.current.muted = true;
    setSound('paused');
  }, [audioUrl]);

  // Admin music: tried with sound once the film is playing (never before)
  const audioTriedRef = useRef(false);
  useEffect(() => {
    if (!audioUrl || !autoStart || status !== 'playing' || audioTriedRef.current) return;
    audioTriedRef.current = true;
    if (soundWantedRef.current) {
      setSound('pending');
      playAudio();
    }
  }, [audioUrl, autoStart, status, playAudio]);

  // Sound refused by the browser: the visitor's first tap or key press anywhere turns it on.
  // See ACTIVATION_EVENTS (touchstart is not accepted by any browser).
  useEffect(() => {
    if (sound !== 'blocked') return undefined;
    const onFirstInteraction = (e) => {
      if (!soundWantedRef.current) return;
      // The hero's own controls handle their own press (the film control must not turn sound on)
      if (e.target?.closest?.('.ps-hero-sound-controls, .ps-hero-playback-toggle')) return;
      enableSound();
    };
    ACTIVATION_EVENTS.forEach((type) => window.addEventListener(type, onFirstInteraction, { passive: true }));
    return () => {
      ACTIVATION_EVENTS.forEach((type) => window.removeEventListener(type, onFirstInteraction));
    };
  }, [sound, enableSound]);

  // Volume slider: applied to whichever player carries the sound, and remembered
  const changeVolume = (value) => {
    const v = Math.min(1, Math.max(0, Number(value) || 0));
    setVolume(v);
    writeVolume(v);
    if (audioRef.current) audioRef.current.volume = v;
    if (videoRef.current) videoRef.current.volume = v;
  };

  // Admin music: pauses with the tab and stops when the visitor leaves the homepage
  useEffect(() => {
    if (!audioUrl) return undefined;
    // Remembers whether the music was playing when the tab was hidden, to resume only then
    let resumeOnReturn = false;
    const onVisibility = () => {
      const audio = audioRef.current;
      if (!audio) return;
      if (document.visibilityState === 'hidden') {
        resumeOnReturn = !audio.paused;
        audio.pause();
      } else if (resumeOnReturn && soundWantedRef.current) {
        resumeOnReturn = false;
        audio.play().catch(() => {});
      }
    };
    // Leaving the site (or a page kept in the back/forward cache): the music stops
    const onPageHide = () => audioRef.current?.pause();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
      const audio = audioRef.current;
      if (audio) {
        audio.pause();
        audio.removeAttribute('src');
        audio.load();
      }
      audioRef.current = null;
    };
  }, [audioUrl]);

  const toggleSound = () => {
    if (sound === 'on') disableSound();
    else enableSound();
  };

  // The sound control: with admin music, or with the built-in / admin film (its soundtrack)
  const showSoundControl = Boolean(audioUrl) || status !== 'error';

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

        {/* Poster layer: the same picture as the film's first frame, cropped exactly like the
            film (same class); it stays until playback starts, then fades away. If the film never
            plays (autoplay refused, reduced motion, Data Saver, load error) it simply remains. */}
        <img
          src={poster}
          alt=""
          aria-hidden="true"
          className={`ps-hero-cinematic-video ps-hero-poster-layer${filmStarted ? ' is-hidden' : ''}`}
          decoding="async"
          fetchPriority="high"
        />

        {/* Subtle cinematic depth (no text or controls) */}
        <div className="ps-hero-delicate-vignette" aria-hidden="true" />
        <div className="ps-hero-top-blend" aria-hidden="true" />
        <div className="ps-hero-bottom-blend" aria-hidden="true" />

        {/* Sound: "Enable Sound" (prominent) while the browser waits for an interaction, then
            Sound Off / Enable Sound, plus the volume slider. One control for the film's soundtrack
            or the admin MP3. */}
        {showSoundControl && (
          <div className="ps-hero-sound-controls">
            <button
              type="button"
              className={`ps-hero-music-toggle is-${sound}`}
              onClick={toggleSound}
              disabled={sound === 'error'}
              aria-label={
                sound === 'on'
                  ? 'Turn sound off'
                  : sound === 'error'
                  ? 'Sound unavailable'
                  : 'Turn sound on'
              }
            >
              {sound === 'error' ? (
                <VolumeX size={15} aria-hidden="true" />
              ) : sound === 'on' ? (
                <span className="ps-hero-music-bars" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </span>
              ) : sound === 'blocked' ? (
                <Volume2 size={17} aria-hidden="true" />
              ) : (
                <Music size={15} aria-hidden="true" />
              )}
              <span className="ps-hero-music-label">
                {sound === 'on'
                  ? 'Sound Off'
                  : sound === 'pending'
                  ? 'Starting…'
                  : sound === 'error'
                  ? 'Sound unavailable'
                  : 'Enable Sound'}
              </span>
            </button>
            {sound === 'on' && volumeAdjustable && (
              <input
                type="range"
                className="ps-hero-volume"
                min="0"
                max="1"
                step="0.05"
                value={volume}
                onChange={(e) => changeVolume(e.target.value)}
                aria-label="Sound volume"
                aria-valuetext={`${Math.round(volume * 100)}%`}
              />
            )}
          </div>
        )}

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
