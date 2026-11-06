import { useEffect } from 'react';

/**
 * Keeps the active item of a horizontally scrolling row (category tabs, filter pills) in view:
 * when the selection changes, the row scrolls sideways so the active item sits in the middle.
 * Only the row scrolls, never the page; nothing happens when the row fits on screen.
 */
export function useCenterActiveTab(trackRef, activeKey, selector = '.is-active') {
  useEffect(() => {
    const track = trackRef.current;
    if (!track || activeKey == null || activeKey === '') return;
    const active = track.querySelector(selector);
    if (!active || track.scrollWidth <= track.clientWidth + 1) return;
    const trackRect = track.getBoundingClientRect();
    const itemRect = active.getBoundingClientRect();
    const target = track.scrollLeft + (itemRect.left - trackRect.left) - (track.clientWidth - itemRect.width) / 2;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    try {
      track.scrollTo({ left: Math.max(0, target), behavior: reduce ? 'auto' : 'smooth' });
    } catch {
      track.scrollLeft = Math.max(0, target);
    }
  }, [trackRef, activeKey, selector]);
}
