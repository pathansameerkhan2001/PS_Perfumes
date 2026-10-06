import React from 'react';
import './PSPerfumesLogo.css';

/**
 * PSPerfumesLogo - Reusable Luxury Vector/SVG Brand Identity Component
 * Supports: header, footer, compact, mobile, desktop
 * Pure vector typography, champagne/gold gradients, 100% transparent background.
 */
export default function PSPerfumesLogo({
  size = 'md', // 'sm' | 'md' | 'lg'
  variant = 'header', // 'header' | 'footer' | 'standalone'
  className = '',
  showTagline = false,
}) {
  return (
    <div
      className={`ps-brand-logo-root ps-logo-${size} ps-logo-${variant} ${className}`}
      aria-label="PS PERFUMES Haute Parfumerie"
    >
      <svg
        className="ps-logo-svg"
        viewBox="0 0 240 120"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-hidden="true"
      >
        <defs>
          {/* Metallic Champagne & Luxury Gold Gradient */}
          <linearGradient id="psGoldMonogramGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#F0D89A" />
            <stop offset="25%" stopColor="#E5C77A" />
            <stop offset="60%" stopColor="#C9A45C" />
            <stop offset="85%" stopColor="#D8B76A" />
            <stop offset="100%" stopColor="#A88238" />
          </linearGradient>

          {/* Hairline Rim Gradient */}
          <linearGradient id="psGoldRimGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#F0D89A" stopOpacity="0.85" />
            <stop offset="50%" stopColor="#C9A45C" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#9B7830" stopOpacity="0.75" />
          </linearGradient>

          {/* Subtle Glow Filter */}
          <filter id="psGoldGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="1" stdDeviation="1.5" floodColor="#000000" floodOpacity="0.6" />
          </filter>
        </defs>

        {/* ==========================================================
            1. LUXURY EMBLEM ORNAMENT & CIRCLE (Flacon Motif)
            ========================================================== */}
        <g filter="url(#psGoldGlow)">
          {/* Subtle Outer Thin Arch/Circle */}
          <circle
            cx="120"
            cy="46"
            r="38"
            stroke="url(#psGoldRimGrad)"
            strokeWidth="1.25"
            strokeDasharray="210 20"
            strokeLinecap="round"
            opacity="0.85"
          />

          {/* Perfume Flacon Cap Ornament Top-Left on the Rim */}
          <g transform="translate(93, 11) scale(0.7)" stroke="url(#psGoldMonogramGrad)" strokeWidth="1.2" fill="none">
            {/* Faceted Cap Diamond */}
            <polygon points="12,2 20,2 24,9 8,9" fill="url(#psGoldMonogramGrad)" opacity="0.3" />
            <polygon points="12,2 20,2 24,9 8,9" stroke="url(#psGoldMonogramGrad)" />
            <line x1="8" y1="12" x2="24" y2="12" strokeWidth="1.5" />
            <rect x="11" y="9" width="10" height="3" fill="url(#psGoldMonogramGrad)" />
          </g>

          {/* Inner Accent Ring Arc */}
          <path
            d="M 96 30 A 34 34 0 0 1 146 32"
            stroke="url(#psGoldRimGrad)"
            strokeWidth="0.75"
            strokeLinecap="round"
            opacity="0.5"
          />

          {/* ==========================================================
              2. INTERLOCKING "PS" LUXURY MONOGRAM
              ========================================================== */}
          {/* Stylized Serif Letter 'P' */}
          <g fill="url(#psGoldMonogramGrad)">
            {/* P Main Stem with Serifs */}
            <path
              d="M 103 26 
                 L 115 26 
                 L 115 29 
                 L 110.5 29 
                 L 110.5 63 
                 L 115 63 
                 L 115 66 
                 L 103 66 
                 L 103 63 
                 L 107.5 63 
                 L 107.5 29 
                 L 103 29 
                 Z"
            />
            {/* P Curved Bowl */}
            <path
              d="M 110.5 27 
                 C 118 26.5 129 27.5 129 39 
                 C 129 49.5 119 50.5 110.5 50.5 
                 L 110.5 47.5 
                 C 116.5 47.5 124.5 46.5 124.5 39 
                 C 124.5 30.5 116.5 29.5 110.5 29.5 
                 Z"
            />
          </g>

          {/* Intertwined Calligraphic Letter 'S' */}
          <g fill="url(#psGoldMonogramGrad)">
            <path
              d="M 137 32
                 C 134 29 128 27.5 122.5 28.5
                 C 117.5 29.5 115 32.5 115 36
                 C 115 42 124 44 129 47
                 C 135 50.5 137.5 54.5 137 60
                 C 136 65.5 130 68 122 68
                 C 115 68 109 64.5 107 60.5
                 L 110 59
                 C 111.5 62 116 65.5 122 65.5
                 C 127 65.5 133 63.5 133.5 59.5
                 C 134 55 130 52 125 49
                 C 119.5 45.5 111.5 43 112 36
                 C 112.5 30 117.5 26.5 124 26.5
                 C 129 26.5 134 28.5 136.5 31
                 Z"
            />
          </g>

          {/* Intersecting Monogram Fine Accent Dot/Terminals */}
          <circle cx="137.5" cy="32.5" r="1" fill="url(#psGoldMonogramGrad)" />
          <circle cx="106.5" cy="61" r="1.2" fill="url(#psGoldMonogramGrad)" />

          {/* ==========================================================
              3. "PERFUMES" LUXURY SERIF TYPOGRAPHY
              ========================================================== */}
          <text
            x="120"
            y="94"
            textAnchor="middle"
            fill="url(#psGoldMonogramGrad)"
            fontFamily="'Cinzel', 'Cormorant Garamond', serif"
            fontSize="14.5"
            fontWeight="600"
            letterSpacing="0.34em"
            className="ps-logo-text-perfumes"
          >
            PERFUMES
          </text>

          {/* ==========================================================
              4. DELICATE HORIZONTAL FLACON HAIRLINE ORNAMENT
              ========================================================== */}
          {/* Left Hairline */}
          <line
            x1="40"
            y1="108"
            x2="106"
            y2="108"
            stroke="url(#psGoldRimGrad)"
            strokeWidth="0.85"
            strokeLinecap="round"
          />
          {/* Miniature Left Flourish Leaf */}
          <path
            d="M 103 108 C 105 106 109 106 111 108 C 109 110 105 110 103 108 Z"
            fill="url(#psGoldMonogramGrad)"
            opacity="0.8"
          />

          {/* Center Miniature Perfume Flacon Icon */}
          <g transform="translate(114, 101) scale(0.7)" stroke="url(#psGoldMonogramGrad)" strokeWidth="1" fill="none">
            {/* Bottle Body */}
            <rect x="2" y="5" width="13" height="12" rx="1.5" stroke="url(#psGoldMonogramGrad)" />
            {/* Bottle Neck */}
            <line x1="6" y1="5" x2="6" y2="3" />
            <line x1="11" y1="5" x2="11" y2="3" />
            {/* Bottle Cap */}
            <rect x="5" y="1" width="7" height="2.5" rx="0.5" fill="url(#psGoldMonogramGrad)" />
          </g>

          {/* Miniature Right Flourish Leaf */}
          <path
            d="M 137 108 C 135 106 131 106 129 108 C 131 110 135 110 137 108 Z"
            fill="url(#psGoldMonogramGrad)"
            opacity="0.8"
          />
          {/* Right Hairline */}
          <line
            x1="134"
            y1="108"
            x2="200"
            y2="108"
            stroke="url(#psGoldRimGrad)"
            strokeWidth="0.85"
            strokeLinecap="round"
          />
        </g>
      </svg>

      {showTagline && (
        <span className="ps-logo-tagline-text">HAUTE PARFUMERIE</span>
      )}
    </div>
  );
}
