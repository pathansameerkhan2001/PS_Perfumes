import React from 'react';

/*
 * Line icons for the main categories, drawn in the current text colour (gold by default,
 * green when the tab is active). Unknown categories get the perfume bottle.
 */
const PATHS = {
  perfumes: (
    <>
      <rect x="9" y="3" width="6" height="3" rx="1" />
      <path d="M10.5 6v2M13.5 6v2" />
      <path d="M8 8h8l1.5 3.2a6.5 6.5 0 1 1-11 0Z" />
      <path d="M9 15.5a3 3 0 0 0 3 2.5" />
    </>
  ),
  attars: (
    <>
      <path d="M12 2.5c-.9 1.2-1.4 2.1-1.4 2.8a1.4 1.4 0 0 0 2.8 0c0-.7-.5-1.6-1.4-2.8Z" />
      <path d="M10.5 7.5h3v2h-3z" />
      <path d="M10.5 9.5 7.5 13v6a2 2 0 0 0 2 2h5a2 2 0 0 0 2-2v-6l-3-3.5" />
      <path d="M7.5 15h9" />
    </>
  ),
  'home-fragrance': (
    <>
      <path d="M9 2.5c1 1.2-1 2.3 0 3.5s-1 2.3 0 3.5M12 2c1 1.2-1 2.5 0 3.8s-1 2.5 0 3.7M15 2.5c1 1.2-1 2.3 0 3.5s-1 2.3 0 3.5" />
      <path d="M4 12h16a8 6 0 0 1-16 0Z" />
      <path d="M9 18.5 8 21h8l-1-2.5" />
    </>
  ),
  'body-care': (
    <>
      <path d="M5 11.5c0-2.5 3.1-4 7-4s7 1.5 7 4" />
      <path d="M4 11.5h16v2.5H4z" />
      <path d="M5 14v3.5c0 1.7 3.1 3 7 3s7-1.3 7-3V14" />
      <path d="M9.5 7.8c.6-1.6 1.6-2.6 2.5-2.6s1.9 1 2.5 2.6" />
    </>
  ),
};

export default function CategoryIcon({ slug, size = 30 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[slug] || PATHS.perfumes}
    </svg>
  );
}
