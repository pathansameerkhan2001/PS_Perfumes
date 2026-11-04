import React from 'react';

/**
 * Gold ornamental separator: hairlines either side of an eight-point star (Rub el Hizb motif).
 * Decorative only.
 */
export default function GoldOrnament({ className = '' }) {
  return (
    <span className={`ps-ornament ${className}`} aria-hidden="true">
      <svg viewBox="0 0 168 16" width="168" height="16" focusable="false">
        <path d="M0 8h64M104 8h64" stroke="currentColor" strokeWidth="0.8" />
        <path d="M68 8l2.5-2.5L73 8l-2.5 2.5zM95 8l2.5-2.5L100 8l-2.5 2.5z" fill="currentColor" />
        <g fill="none" stroke="currentColor" strokeWidth="0.9">
          <rect x="79" y="3" width="10" height="10" />
          <rect x="79" y="3" width="10" height="10" transform="rotate(45 84 8)" />
        </g>
        <circle cx="84" cy="8" r="1.4" fill="currentColor" />
      </svg>
    </span>
  );
}
