import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';

export default function FragranceCategoryCard({ name, slug, image }) {
  return (
    <Link
      to={`/${slug}`}
      className="ps-category-card"
      aria-label={`Shop ${name} Fragrances`}
    >
      {/* Circular Image Container with Delicate Gold Rim */}
      <div className="ps-category-circle-wrapper">
        <div className="ps-category-circle-frame">
          <img
            src={image}
            alt={`PS PERFUMES ${name} Collection`}
            className="ps-category-img"
            loading="lazy"
            width="240"
            height="240"
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
