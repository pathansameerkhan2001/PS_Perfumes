import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import ProductCard from '../ProductCard';
import '../ProductCard.css';
import './NewArrivalsSection.css';

/**
 * Homepage "Discover Our New Arrivals".
 * Products come from getNewArrivalProducts (homepageService): active products flagged
 * "New Arrival" in Admin → Products, in their display order; if none are flagged, the most
 * recently added active products. Cards are the shared ProductCard (variant pricing, bottle
 * options, sold-out state, product page on click). Nothing is shown that is not in the catalogue.
 * Mobile: a swipeable row inside the section (no page-wide horizontal scroll).
 */
const SKELETON_COUNT = 4;

export default function NewArrivalsSection({
  title = 'Discover Our New Arrivals',
  subtitle = 'Meet your next signature fragrance.',
  products = [],
  loaded = true,
  limit = 8,
}) {
  const list = products.slice(0, limit);

  // Loaded and nothing to show: the section is left out instead of showing an empty block
  if (loaded && list.length === 0) return null;

  return (
    <section className="ps-newarr-section" id="new-arrivals" aria-labelledby="ps-newarr-title">
      <div className="ps-newarr-container">
        <header className="ps-newarr-header">
          <span className="ps-newarr-eyebrow">JUST ARRIVED</span>
          <h2 id="ps-newarr-title" className="ps-newarr-title">
            {title || 'Discover Our New Arrivals'}
          </h2>
          {subtitle && <p className="ps-newarr-subtitle">{subtitle}</p>}
          <span className="ps-newarr-rule" aria-hidden="true" />
        </header>

        <div className="ps-newarr-track" role="list">
          {loaded
            ? list.map((product) => (
                <div className="ps-newarr-item" role="listitem" key={product.id}>
                  <ProductCard product={product} />
                </div>
              ))
            : Array.from({ length: SKELETON_COUNT }, (_, i) => (
                <div className="ps-newarr-item" key={i} aria-hidden="true">
                  <div className="ps-newarr-skeleton" />
                </div>
              ))}
        </div>

        <div className="ps-newarr-footer">
          <Link to="/shop" className="ps-newarr-viewall">
            <span>View All Products</span>
            <ArrowRight size={15} strokeWidth={1.8} aria-hidden="true" />
          </Link>
        </div>
      </div>
    </section>
  );
}
