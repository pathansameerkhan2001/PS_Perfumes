import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

// How long a #section link waits for its section to appear (sections render after their data)
const HASH_WAIT_MS = 4000;

export default function ScrollToTop() {
  const { pathname, hash } = useLocation();

  useEffect(() => {
    if (!hash) {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      return undefined;
    }
    // A link such as /#combo-pack scrolls to that section once it exists
    const id = decodeURIComponent(hash.slice(1));
    const started = Date.now();
    let timer = null;
    const tryScroll = () => {
      const el = document.getElementById(id);
      if (el) {
        const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
      } else if (Date.now() - started < HASH_WAIT_MS) {
        timer = setTimeout(tryScroll, 120);
      }
    };
    tryScroll();
    return () => clearTimeout(timer);
  }, [pathname, hash]);

  return null;
}
