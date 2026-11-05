import React, { useEffect, useRef, useState } from 'react';
import './Atmosphere.css';

// Fixed positions and timings: no random values, so renders are stable
const PETALS = [
  { left: '6%', delay: '0s', duration: '14s', scale: 1 },
  { left: '22%', delay: '5s', duration: '17s', scale: 0.75 },
  { left: '41%', delay: '9s', duration: '15s', scale: 0.9 },
  { left: '63%', delay: '2.5s', duration: '18s', scale: 0.7 },
  { left: '80%', delay: '7s', duration: '16s', scale: 1.05 },
  { left: '93%', delay: '11s', duration: '19s', scale: 0.8 },
];

// Gold motes rising slowly (phones show the first six)
const PARTICLES = [
  { left: '8%', bottom: '12%', size: 3, delay: '0s', duration: '13s' },
  { left: '17%', bottom: '30%', size: 2, delay: '4s', duration: '16s' },
  { left: '29%', bottom: '8%', size: 4, delay: '7.5s', duration: '15s' },
  { left: '44%', bottom: '22%', size: 2, delay: '2s', duration: '18s' },
  { left: '57%', bottom: '6%', size: 3, delay: '10s', duration: '14s' },
  { left: '70%', bottom: '26%', size: 2, delay: '5.5s', duration: '17s' },
  { left: '82%', bottom: '10%', size: 4, delay: '1s', duration: '16s' },
  { left: '91%', bottom: '34%', size: 2, delay: '8.5s', duration: '19s' },
  { left: '36%', bottom: '40%', size: 2, delay: '12s', duration: '15s' },
  { left: '64%', bottom: '44%', size: 3, delay: '14s', duration: '17s' },
];

// Incense wisps: soft gradients that rise and fade (phones show two)
const WISPS = [
  { left: '12%', delay: '0s', duration: '22s' },
  { left: '58%', delay: '8s', duration: '26s' },
  { left: '34%', delay: '15s', duration: '24s' },
];

// One observer for every Atmosphere on the page: marks layers scrolled out of view, so their
// animations pause (CSS: .ps-atmos.is-offscreen)
let sharedObserver = null;
function getObserver() {
  if (sharedObserver || typeof IntersectionObserver === 'undefined') return sharedObserver;
  sharedObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => entry.target.classList.toggle('is-offscreen', !entry.isIntersecting));
  });
  return sharedObserver;
}

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

/**
 * Decorative atmosphere for selected sections: rose petals, gold particles and incense smoke.
 *
 * - CSS only (transform and opacity, no filters or canvas); a handful of elements each.
 * - Paused while scrolled out of view and while the tab is hidden (PublicLayout sets
 *   html[data-page-hidden]). Not rendered at all for visitors who prefer reduced motion (CSS
 *   also hides it if the setting changes during the visit).
 * - Fills its parent, which must be position: relative; never takes clicks.
 * - tone: 'light' on ivory sections, 'dark' over the hero film.
 */
export default function Atmosphere({ petals = false, particles = false, smoke = false, tone = 'light', className = '' }) {
  const ref = useRef(null);
  // Read once per mount: nothing to animate (or observe) for reduced motion
  const [reduced] = useState(prefersReducedMotion);

  useEffect(() => {
    const el = ref.current;
    const observer = getObserver();
    if (!el || !observer) return undefined;
    observer.observe(el);
    return () => observer.unobserve(el);
  }, [reduced]);

  if (reduced) return null;

  return (
    <span ref={ref} className={`ps-atmos ps-atmos--${tone} ${className}`} aria-hidden="true">
      {smoke && (
        <span className="ps-atmos-smoke">
          {WISPS.map((w, i) => (
            <span key={i} className="ps-wisp" style={{ left: w.left, animationDelay: w.delay, animationDuration: w.duration }} />
          ))}
        </span>
      )}
      {particles && (
        <span className="ps-atmos-particles">
          {PARTICLES.map((p, i) => (
            <span
              key={i}
              className="ps-mote-lane"
              style={{ left: p.left, animationDelay: p.delay, animationDuration: p.duration }}
            >
              <span className="ps-mote" style={{ bottom: p.bottom, width: p.size, height: p.size }} />
            </span>
          ))}
        </span>
      )}
      {petals && (
        <span className="ps-petals">
          {PETALS.map((p, i) => (
            <span
              key={i}
              className="ps-petal-lane"
              style={{ left: p.left, animationDelay: p.delay, animationDuration: p.duration }}
            >
              <span className="ps-petal" style={{ '--petal-scale': p.scale, animationDelay: p.delay }} />
            </span>
          ))}
        </span>
      )}
    </span>
  );
}
