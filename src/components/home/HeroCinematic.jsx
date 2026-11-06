import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Music, Pause, Play, RotateCcw, Volume2, VolumeX } from 'lucide-react';
import { getStoragePublicUrl } from '../../lib/storage';
import {
  getActiveHeroFilm,
  knownPosterForFilm,
  BUILT_IN_HERO_FILM_PATH,
  BUILT_IN_HERO_POSTER_DESKTOP as posterDesktop,
  BUILT_IN_HERO_POSTER_MOBILE as posterMobile,
} from '../../services/hero';
import Atmosphere from '../common/Atmosphere';
import './HeroCinematic.css';

// One automatic reload if the file fails to load (e.g. a dropped connection)
const LOAD_RETRY_DELAY_MS = 3000;
// How long to wait for the admin hero setting before using the default film. The default film
// is the one currently configured (services/hero.js), so even a very slow answer does not show
// a different film; the matching poster is shown meanwhile.
const SETTING_TIMEOUT_MS = 10000;
// The resolved setting is kept for this browser tab, so returning to the homepage starts the
// film at once; it is still re-checked every time. (v3: posters are now chosen per film.)
const SETTING_CACHE_KEY = 'ps_hero_film_v3';
// Starting volume of the sound (admin MP3 or the film's soundtrack); the visitor's own choice on
// the volume slider is remembered in this browser
const DEFAULT_VOLUME = 0.6;
const VOLUME_KEY = 'ps_hero_volume';
// No picture after this long (slow 4G, stalled download): the poster stays, the film keeps
// loading, and a clear Play button is offered
const SLOW_START_MS = 8000;
// Sound fades in and out instead of jumping (where the browser lets a page set the volume)
const FADE_IN_MS = 1400;
const FADE_OUT_MS = 380;
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

// iOS ignores volume set by a page (it always reads 1): the slider is hidden there, fades are
// skipped and the device's volume buttons apply
const volumeAdjustable = (() => {
  try {
    const probe = document.createElement('audio');
    probe.volume = 0.5;
    return Math.abs(probe.volume - 0.5) < 0.01;
  } catch {
    return false;
  }
})();

/** Smoothly moves a media element's volume to `to`; a newer ramp cancels an older one. */
function rampVolume(el, to, ms, done) {
  if (!el) return;
  if (el._psRamp) cancelAnimationFrame(el._psRamp);
  el._psRamp = 0;
  const target = Math.min(1, Math.max(0, to));
  if (!volumeAdjustable || ms <= 0 || typeof requestAnimationFrame !== 'function') {
    try {
      el.volume = target;
    } catch {
      // read-only volume (iOS)
    }
    done?.();
    return;
  }
  const from = el.volume;
  const start = performance.now();
  const step = (now) => {
    const t = Math.min(1, (now - start) / ms);
    el.volume = Math.min(1, Math.max(0, from + (target - from) * t));
    if (t < 1) {
      el._psRamp = requestAnimationFrame(step);
    } else {
      el._psRamp = 0;
      done?.();
    }
  };
  el._psRamp = requestAnimationFrame(step);
}

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

const sameSource = (a, b) => a && b && a.videoUrl === b.videoUrl && a.poster === b.poster && a.audioUrl === b.audioUrl;

/**
 * PS PERFUMES — full-screen cinematic hero film.
 *
 * Opening (never a black screen, never a different film):
 * - The poster is the film's real first frame: the admin poster when one is set, otherwise a
 *   first-frame poster bundled for the film (services/hero.js). It is preloaded by index.html
 *   and painted immediately. A film with neither shows a dark-gold backdrop, not another film.
 * - The film is attached as soon as the setting is known (at once from the tab's cache) and
 *   autoplays muted and inline. The poster stays until a real frame of the film has been
 *   presented (requestVideoFrameCallback, or time advancing), then cross-fades to the film.
 * - Slow start (weak 4G, stalled download): after SLOW_START_MS a clear Play button appears
 *   while the film keeps loading. Load error: one automatic retry, then the poster stays with
 *   a Play / Retry button.
 * - If the admin setting is slow, the default film is used after SETTING_TIMEOUT_MS; it is the
 *   configured film, and a late answer still replaces it while nothing has played yet.
 * - Autoplay is skipped for prefers-reduced-motion, Data Saver and 2G: the poster and a Play
 *   button are shown, and nothing is downloaded until the visitor presses it (preload none).
 * - The film pauses out of view and in hidden tabs, and resumes on return. A deliberate pause is
 *   never undone automatically.
 * - Phones play the lighter mobile film when one is set in Admin → Hero Sections.
 *
 * Sound: the admin's MP3 when one is set (the film then stays muted), otherwise the film's own
 * soundtrack; never both. It is tried automatically only where the browser allows sound (and
 * not on Data Saver / 2G / reduced motion). Where it needs an interaction, an "Enable Sound"
 * button is shown; it (or the visitor's first tap) starts the sound inside that same user
 * gesture, which iPhone Safari requires. Sound fades in and out; the volume slider (not on iOS,
 * which only honours the hardware buttons) is remembered in this browser.
 */
export default function HeroCinematic() {
  const sectionRef = useRef(null);
  const videoRef = useRef(null);
  const retriedLoadRef = useRef(false);
  const inViewRef = useRef(true);

  // Decided once per visit, so rotating a phone does not swap the film mid-play
  const [env] = useState(() => {
    const hasWindow = typeof window !== 'undefined';
    const connection = typeof navigator !== 'undefined' ? navigator.connection : undefined;
    const isNarrow = hasWindow && Boolean(window.matchMedia?.('(max-width: 768px)').matches);
    const reducedMotion = hasWindow && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
    const saveData = connection?.saveData === true;
    const slowNetwork = SLOW_NETWORKS.has(connection?.effectiveType);
    return { isNarrow, autoStart: !reducedMotion && !saveData && !slowNetwork };
  });
  const { isNarrow, autoStart } = env;
  const defaultPoster = isNarrow ? posterMobile : posterDesktop;

  // The film to play: resolved from the admin setting before any video is requested, so two
  // films are never both downloaded. null = still resolving (the default poster shows).
  const toSource = useCallback(
    (film) => {
      const videoUrl =
        (isNarrow && film?.mobileVideoUrl) || film?.videoUrl || getStoragePublicUrl(BUILT_IN_HERO_FILM_PATH);
      return {
        videoUrl,
        poster: film?.posterUrl || knownPosterForFilm(videoUrl, isNarrow),
        audioUrl: film?.audioUrl || '',
      };
    },
    [isNarrow]
  );
  const [source, setSource] = useState(() => {
    const cached = readCachedFilm();
    return cached === undefined ? null : toSource(cached);
  });

  // True once a real frame of the film has been presented (the poster then fades out)
  const [filmStarted, setFilmStarted] = useState(false);
  const filmStartedRef = useRef(false);

  useEffect(() => {
    let active = true;
    let settled = source !== null;
    const apply = (film) => {
      const fresh = toSource(film);
      setSource((current) => (sameSource(current, fresh) ? current : fresh));
    };
    const timer = settled
      ? null
      : window.setTimeout(() => {
          if (settled) return;
          settled = true;
          apply(null);
        }, SETTING_TIMEOUT_MS);
    // Always re-checked, so a film changed in Admin → Hero Sections shows on the next visit or
    // reload. A different answer replaces the current choice only while nothing has played yet
    // (no visible swap); otherwise it is used from the next visit (cached for this tab).
    getActiveHeroFilm().then((film) => {
      writeCachedFilm(film);
      if (!active) return;
      if (!settled) {
        settled = true;
        if (timer) window.clearTimeout(timer);
        apply(film);
        return;
      }
      if (!filmStartedRef.current) apply(film);
    });
    return () => {
      active = false;
      settled = true;
      if (timer) window.clearTimeout(timer);
    };
    // Resolved once per mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const videoUrl = source?.videoUrl || '';
  const poster = source ? source.poster : defaultPoster;

  // Whether the film should be playing. Every automatic start (initial, retries, coming back into
  // view) checks this, so reduced-motion / Data Saver visitors and a deliberate pause are respected.
  const wantsPlayRef = useRef(autoStart);

  // 'loading' → 'playing' | 'paused' | 'blocked' (autoplay refused) | 'slow' (no picture yet) |
  // 'error' (file failed to load)
  const [status, setStatus] = useState(() => (autoStart ? 'loading' : 'paused'));

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
  // Set when the visitor asks for sound before the film is attached
  const soundRequestedRef = useRef(false);
  // Sound volume (0–1), shared by the MP3 and the film's soundtrack
  const [volume, setVolume] = useState(readVolume);
  const volumeRef = useRef(volume);
  volumeRef.current = volume;

  const tryPlay = useCallback(() => {
    const video = videoRef.current;
    if (!video || !video.currentSrc && !video.getAttribute('src')) return;
    if (!inViewRef.current || !wantsPlayRef.current) return;
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
    // Sound starts silent and fades in once playing
    try {
      video.volume = trySound && volumeAdjustable ? 0 : volumeRef.current;
    } catch {
      // read-only volume (iOS)
    }
    if (trySound) setSound((s) => (s === 'off' ? 'pending' : s));
    video.playsInline = true;
    video.setAttribute('muted', '');
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');

    filmStartedRef.current = false;
    setFilmStarted(false);
    if (wantsPlayRef.current) setStatus((s) => (s === 'playing' ? s : 'loading'));

    let revealed = false;
    let frameHandle = 0;
    let retryTimer = null;
    let slowTimer = null;

    // The poster fades only once the film has really put a picture on screen
    const reveal = () => {
      if (revealed) return;
      revealed = true;
      filmStartedRef.current = true;
      setFilmStarted(true);
      window.clearTimeout(slowTimer);
    };
    const armSlowTimer = () => {
      window.clearTimeout(slowTimer);
      if (revealed || !wantsPlayRef.current) return;
      slowTimer = window.setTimeout(() => {
        if (!revealed) setStatus((s) => (s === 'loading' ? 'slow' : s));
      }, SLOW_START_MS);
    };

    const onPlaying = () => {
      setStatus('playing');
      // Playing with sound: the soundtrack is on, fading in
      if (soundFromFilmRef.current && !video.muted) {
        setSound('on');
        rampVolume(video, volumeRef.current, FADE_IN_MS);
      }
      if (!revealed && typeof video.requestVideoFrameCallback === 'function' && !frameHandle) {
        frameHandle = video.requestVideoFrameCallback(() => {
          frameHandle = 0;
          reveal();
        });
      }
    };
    // Fallback for browsers without requestVideoFrameCallback: time has moved, so a frame is up
    const onTimeUpdate = () => {
      if (!revealed && !video.paused && video.currentTime > 0.04) reveal();
    };
    // Paused by the visitor or by scrolling out of view (a refused autoplay keeps 'blocked')
    const onPause = () => setStatus((s) => (s === 'error' || s === 'blocked' || s === 'slow' ? s : 'paused'));
    const onCanPlay = () => {
      if (video.paused) tryPlay();
    };
    // Still buffering before the first frame: (re)start the slow-start countdown
    const onWaiting = () => {
      if (!revealed) armSlowTimer();
    };
    const onError = () => {
      const code = video.error?.code;
      console.warn(`Hero film failed to load${code ? ` (MediaError ${code})` : ''}: ${videoUrl}`);
      window.clearTimeout(slowTimer);
      if (!retriedLoadRef.current) {
        retriedLoadRef.current = true;
        setStatus('loading');
        retryTimer = window.setTimeout(() => {
          video.load();
          armSlowTimer();
          tryPlay();
        }, LOAD_RETRY_DELAY_MS);
        return;
      }
      setStatus('error');
    };
    // Recovery after a refused autoplay: retry on the next real interaction
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
    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('pause', onPause);
    video.addEventListener('canplay', onCanPlay);
    video.addEventListener('waiting', onWaiting);
    video.addEventListener('stalled', onWaiting);
    video.addEventListener('error', onError);
    RETRY_EVENTS.forEach((type) => window.addEventListener(type, onGesture, { passive: true }));
    document.addEventListener('visibilitychange', onVisibility);
    // The autoplay attribute may already have started the film before these listeners existed
    if (!video.paused && video.readyState >= 3) {
      onPlaying();
      if (video.currentTime > 0.04) reveal();
    }

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

    armSlowTimer();
    tryPlay();

    return () => {
      window.clearTimeout(retryTimer);
      window.clearTimeout(slowTimer);
      if (frameHandle && typeof video.cancelVideoFrameCallback === 'function') {
        video.cancelVideoFrameCallback(frameHandle);
      }
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('canplay', onCanPlay);
      video.removeEventListener('waiting', onWaiting);
      video.removeEventListener('stalled', onWaiting);
      video.removeEventListener('error', onError);
      RETRY_EVENTS.forEach((type) => window.removeEventListener(type, onGesture));
      document.removeEventListener('visibilitychange', onVisibility);
      observer?.disconnect();
    };
    // autoStart is fixed for the visit
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoUrl, tryPlay]);

  // Play / pause / retry. Runs inside the visitor's own tap, so iPhone Safari (Low Power Mode,
  // Data Saver) accepts the play() call.
  const togglePlayback = () => {
    const video = videoRef.current;
    wantsPlayRef.current = true;
    if (!video || !videoUrl) {
      // Pressed before the setting was known: the film starts as soon as it is attached
      setStatus('loading');
      return;
    }
    if (status === 'error') {
      retriedLoadRef.current = false;
      setStatus('loading');
      video.load();
      tryPlay();
      return;
    }
    // Anything but "playing" (paused, refused, or still buffering on a slow connection) means
    // the button reads "Play Film": it (re)starts playback and never pauses a buffering film
    if (status !== 'playing' || video.paused) {
      if (video.preload !== 'auto') video.preload = 'auto';
      tryPlay();
    } else {
      wantsPlayRef.current = false;
      video.pause();
    }
  };

  // ---------------------------------------------------------------------------
  // Sound (one player at a time): the admin's MP3 in its own Audio element, or the film's own
  // soundtrack (the video unmuted).
  // ---------------------------------------------------------------------------
  const audioRef = useRef(null);
  const audioPendingRef = useRef(false);

  const getAudio = useCallback(() => {
    if (audioRef.current) return audioRef.current;
    const audio = new Audio();
    audio.loop = true;
    audio.preload = 'auto';
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
    // The film's own soundtrack never plays alongside the MP3
    if (videoRef.current) videoRef.current.muted = true;
    if (!audio.paused) {
      setSound('on');
      rampVolume(audio, volumeRef.current, FADE_IN_MS);
      return;
    }
    // A start is already in progress (e.g. button and first-tap listener in the same tap)
    if (audioPendingRef.current) return;
    audioPendingRef.current = true;
    if (volumeAdjustable) audio.volume = 0;
    // play() is called synchronously here, inside the visitor's gesture when there is one
    const attempt = audio.play();
    Promise.resolve(attempt)
      .then(() => {
        audioPendingRef.current = false;
        setSound('on');
        rampVolume(audio, volumeRef.current, FADE_IN_MS);
      })
      .catch((err) => {
        audioPendingRef.current = false;
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
      // Pressed before the film was attached: it starts with sound once attached
      soundRequestedRef.current = true;
      setSound('pending');
      return;
    }
    if (video.muted && volumeAdjustable) video.volume = 0;
    video.muted = false;
    setSound('on');
    rampVolume(video, volumeRef.current, FADE_IN_MS);
    if (video.paused) {
      if (video.preload !== 'auto') video.preload = 'auto';
      tryPlay();
    }
  }, [audioUrl, playAudio, videoUrl, tryPlay]);

  const disableSound = useCallback(() => {
    soundWantedRef.current = false;
    setSound('paused');
    if (audioUrl) {
      const audio = audioRef.current;
      if (audio) rampVolume(audio, 0, FADE_OUT_MS, () => audio.pause());
      return;
    }
    const video = videoRef.current;
    if (video) {
      rampVolume(video, 0, FADE_OUT_MS, () => {
        video.muted = true;
        try {
          video.volume = volumeRef.current;
        } catch {
          // read-only volume (iOS)
        }
      });
    }
  }, [audioUrl]);

  // Admin music: tried with sound once the film is playing (never before), and only where the
  // visitor has not asked for less (Data Saver, 2G, reduced motion)
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

  // Volume slider: applied at once to whichever player carries the sound, and remembered
  const changeVolume = (value) => {
    const v = Math.min(1, Math.max(0, Number(value) || 0));
    setVolume(v);
    writeVolume(v);
    if (audioRef.current) rampVolume(audioRef.current, v, 0);
    if (videoRef.current && !videoRef.current.muted) rampVolume(videoRef.current, v, 0);
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
        if (audio._psRamp) cancelAnimationFrame(audio._psRamp);
        audio.pause();
        audio.removeAttribute('src');
        audio.load();
      }
      audioRef.current = null;
      audioPendingRef.current = false;
    };
  }, [audioUrl]);

  const toggleSound = () => {
    if (sound === 'on') disableSound();
    else enableSound();
  };

  // The sound control: with admin music, or with the film's own soundtrack while it can play
  const showSoundControl = Boolean(audioUrl) || status !== 'error';

  const isPlaying = status === 'playing';
  // No control while the film is simply loading (the poster is showing)
  const showControl = status !== 'loading';
  // When the film is not playing (refused autoplay, slow start, load error, reduced motion,
  // Data Saver, paused) the control is a clear labelled button, so the poster never looks like
  // a broken video
  const controlIsProminent = showControl && !isPlaying;
  const controlLabel = status === 'error' ? 'Retry film' : isPlaying ? 'Pause background film' : 'Play background film';

  return (
    <section
      ref={sectionRef}
      className={`ps-hero-cinematic is-${status}${filmStarted ? ' is-started' : ''}`}
      aria-label="PS PERFUMES fragrance film"
    >
      <div className="ps-hero-media-wrapper">
        <video
          ref={videoRef}
          className={`ps-hero-cinematic-video ps-hero-film${filmStarted ? ' is-visible' : ''}`}
          src={videoUrl || undefined}
          poster={poster || undefined}
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
          {poster && <img src={poster} alt="" className="ps-hero-cinematic-video ps-hero-poster-fallback" />}
        </video>

        {/* Poster layer: the film's real first frame, cropped exactly like the film (same
            class). It stays until a frame of the film is on screen, then cross-fades away. If the
            film never plays (refused, reduced motion, Data Saver, error) it simply remains.
            Without a poster for this film: a dark-gold backdrop instead (never a black box). */}
        {poster ? (
          <img
            key={poster}
            src={poster}
            alt=""
            aria-hidden="true"
            className={`ps-hero-cinematic-video ps-hero-poster-layer${filmStarted ? ' is-hidden' : ''}`}
            decoding="async"
            fetchPriority="high"
          />
        ) : (
          <div className={`ps-hero-backdrop${filmStarted ? ' is-hidden' : ''}`} aria-hidden="true" />
        )}

        {/* Arabian atmosphere over the film: incense smoke and slow gold particles (CSS only) */}
        <Atmosphere smoke particles tone="dark" className="ps-hero-atmos" />

        {/* Subtle cinematic depth (no text or controls) */}
        <div className="ps-hero-delicate-vignette" aria-hidden="true" />
        <div className="ps-hero-top-blend" aria-hidden="true" />
        <div className="ps-hero-bottom-blend" aria-hidden="true" />

        {/* Fine gold line while the film is still on its way (poster showing) */}
        {!filmStarted && (status === 'loading' || status === 'slow') && (
          <span className="ps-hero-loading-line" aria-hidden="true" />
        )}

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
              aria-pressed={sound === 'on'}
              aria-label={
                sound === 'on' ? 'Turn sound off' : sound === 'error' ? 'Sound unavailable' : 'Turn sound on'
              }
            >
              {sound === 'error' ? (
                <VolumeX size={16} strokeWidth={1.8} aria-hidden="true" />
              ) : sound === 'on' ? (
                <span className="ps-hero-music-bars" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </span>
              ) : sound === 'blocked' ? (
                <Volume2 size={17} strokeWidth={1.8} aria-hidden="true" />
              ) : (
                <Music size={16} strokeWidth={1.8} aria-hidden="true" />
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

        {/* Play / pause / retry: a discreet icon while playing, a clear labelled button otherwise */}
        {showControl && (
          <button
            type="button"
            className={`ps-hero-playback-toggle${controlIsProminent ? ' is-prominent' : ''}`}
            onClick={togglePlayback}
            aria-label={controlLabel}
            title={status === 'error' ? 'Retry' : isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? (
              <Pause size={14} aria-hidden="true" />
            ) : status === 'error' ? (
              <RotateCcw size={17} strokeWidth={1.9} aria-hidden="true" />
            ) : (
              <Play size={controlIsProminent ? 17 : 14} aria-hidden="true" className="ps-hero-play-icon" />
            )}
            {controlIsProminent && (
              <span className="ps-hero-playback-label">{status === 'error' ? 'Retry' : 'Play Film'}</span>
            )}
          </button>
        )}
      </div>
    </section>
  );
}
