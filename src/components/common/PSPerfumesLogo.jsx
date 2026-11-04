import React from 'react';
import './PSPerfumesLogo.css';

/*
 * The official PS PERFUMES logo (owner artwork, November 2026; master in docs/brand/).
 * Two versions made from it without changing the design (public/assets/brand/):
 * - light (default): the arch badge, its black interior kept and the outside transparent. For
 *   ivory, white and champagne backgrounds (header, mobile menu, admin).
 * - dark: transparent gold, the black background removed. For black backgrounds (footer).
 * Both keep the artwork's proportions (width : height = 948 : 1086); size sets the height.
 */
const SOURCES = {
  light: '/assets/brand/ps-logo-arch-v2.webp',
  dark: '/assets/brand/ps-logo-gold-v2.webp',
};
// Intrinsic size of the files (prevents layout shift while the image loads)
const WIDTH = 419;
const HEIGHT = 480;

export default function PSPerfumesLogo({
  size = 'md', // 'sm' | 'md' | 'lg'
  variant = 'header', // 'header' | 'footer' | 'standalone'
  tone = 'light', // 'light' background → arch badge · 'dark' background → transparent gold
  className = '',
  showTagline = false,
  priority = false,
}) {
  return (
    <span className={`ps-brand-logo-root ps-logo-${size} ps-logo-${variant} ${className}`}>
      <img
        className="ps-logo-img"
        src={SOURCES[tone] || SOURCES.light}
        alt="PS PERFUMES"
        width={WIDTH}
        height={HEIGHT}
        decoding="async"
        loading={priority ? 'eager' : 'lazy'}
        fetchPriority={priority ? 'high' : undefined}
        draggable="false"
      />
      {showTagline && <span className="ps-logo-tagline-text">HAUTE PARFUMERIE</span>}
    </span>
  );
}
