import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';

const LOGO_FALLBACK = '/assets/ps-perfumes-logo.webp';

/*
 * path: storefront route (built-in families keep /attar …; other categories use /category/<slug>).
 * isBuiltIn: the seven built-in families get their accent colours (.ps-family-<slug>); other
 * categories use the neutral :root tokens. Without artwork the brand logo is shown.
 */
export default function FragranceCategoryCard({ name, slug, path, image, isBuiltIn = true }) {
  return (
    <Link
      to={path || `/${slug}`}
      className={`ps-category-card${isBuiltIn ? ` ps-family-${slug}` : ''}`}
      aria-label={`Shop ${name} Fragrances`}
    >
      {/* Circular Image Container with Delicate Gold Rim */}
      <div className="ps-category-circle-wrapper">
        <div className="ps-category-circle-frame">
          <img
            src={image || LOGO_FALLBACK}
            alt={`PS PERFUMES ${name} Collection`}
            className="ps-category-img"
            loading="lazy"
            width="240"
            height="240"
            style={image ? undefined : { objectFit: 'contain', background: '#0D0D0D' }}
            onError={(e) => {
              // Deleted or broken category image: show the brand logo instead of a broken image
              const img = e.currentTarget;
              if (img.dataset.fallback !== '1') {
                img.dataset.fallback = '1';
                img.src = LOGO_FALLBACK;
                img.style.objectFit = 'contain';
                img.style.background = '#0D0D0D';
              }
            }}
          />
        </div>
      </div>

      {/* Category Name */}
      <span className="ps-category-name">{name}</span>

      {/* Circular Gold Arrow Button */}
      <div className="ps-category-arrow-btn" aria-hidden="true">
        <ArrowRight size={16} strokeWidth={1.8} className="ps-category-arrow-icon" />
      </div>
    </Link>
  );
}
