import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import FragranceCategoryCard from './FragranceCategoryCard';
import { useStorefrontCategories } from '../../utils/useStorefrontCategories';

import './ShopByFragrance.css';

export default function ShopByFragrance({ title = 'Shop by Fragrance', subtitle = '' }) {
  // Active categories in display order (shared with the header, mobile menu and footer); the
  // seven built-in families keep their artwork, others use an admin image or the brand logo
  const categories = useStorefrontCategories();

  return (
    <section
      className="ps-fragrance-showcase-section"
      id="shop-by-fragrance"
      aria-label="Shop by Fragrance Categories"
    >
      <div className="ps-fragrance-showcase-container">
        {/* Section Header: Eyebrow + Title + View All */}
        <div className="ps-fragrance-header">
          <div className="ps-fragrance-header-titles">
            <div className="ps-fragrance-eyebrow-row">
              <span className="ps-fragrance-eyebrow">EXPLORE OUR COLLECTION</span>
              <span className="ps-fragrance-eyebrow-line" aria-hidden="true" />
            </div>
            <h2 className="ps-fragrance-title">{title || 'Shop by Fragrance'}</h2>
            {subtitle && <p className="ps-section-subtitle">{subtitle}</p>}
          </div>

          <Link
            to="/shop"
            className="ps-fragrance-view-all-link"
            aria-label="View all fragrance collections"
          >
            <span className="ps-view-all-text">VIEW ALL</span>
            <ArrowRight size={15} strokeWidth={1.8} className="ps-view-all-arrow" />
          </Link>
        </div>

        {/* Fragrance Categories Carousel / Row */}
        <div className="ps-fragrance-carousel-track">
          <div className="ps-fragrance-cards-row">
            {categories.map((cat) => (
              <FragranceCategoryCard
                key={cat.slug}
                name={cat.name.toUpperCase()}
                slug={cat.slug}
                path={cat.path}
                image={cat.image}
                isBuiltIn={cat.isBuiltIn}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
