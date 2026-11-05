import React, { useEffect, useRef } from 'react';

// One observer for every Reveal on the page; each element is revealed once, then forgotten
let sharedObserver = null;
function getObserver() {
  if (sharedObserver || typeof IntersectionObserver === 'undefined') return sharedObserver;
  sharedObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-revealed');
        sharedObserver.unobserve(entry.target);
      });
    },
    // Any part inside the viewport (minus a thin bottom band) counts. threshold 0, not a share
    // of the element: a very tall section could never show a fixed share and would stay hidden
    { rootMargin: '0px 0px -5% 0px', threshold: 0 }
  );
  return sharedObserver;
}

/**
 * Soft fade and upward reveal when the content scrolls into view (CSS in StorefrontTheme.css:
 * opacity and transform only, so no layout shift; no transform is left once revealed, so fixed
 * dialogs inside still position correctly). Visitors who prefer reduced motion, and browsers
 * without IntersectionObserver, see the content at once.
 *
 * delay: seconds, to stagger neighbours. as: the wrapper element (div by default).
 */
export default function Reveal({ as: Tag = 'div', delay = 0, className = '', style, children, ...rest }) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const observer = getObserver();
    if (!observer) {
      el.classList.add('is-revealed');
      return undefined;
    }
    observer.observe(el);
    return () => observer.unobserve(el);
  }, []);

  return (
    <Tag
      ref={ref}
      className={`ps-reveal ${className}`}
      style={delay ? { ...style, '--reveal-delay': `${delay}s` } : style}
      {...rest}
    >
      {children}
    </Tag>
  );
}
