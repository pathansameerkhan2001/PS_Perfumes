import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import FragranceCategoryCard from './FragranceCategoryCard';
import { getCategories } from '../../services/categories';

import attarImg from '../../assets/categories/fragrance-attar.png';
import perfumeImg from '../../assets/categories/fragrance-perfume.png';
import bakhoorImg from '../../assets/categories/fragrance-bakhoor.png';
import muskyImg from '../../assets/categories/fragrance-musky.png';
import oudImg from '../../assets/categories/fragrance-oud.png';
import floralImg from '../../assets/categories/fragrance-floral.png';
import woodyImg from '../../assets/categories/fragrance-woody.png';

import './ShopByFragrance.css';

const DEFAULT_FRAGRANCES = [
  { name: 'ATTAR', slug: 'attar', image: attarImg },
  { name: 'PERFUME', slug: 'perfume', image: perfumeImg },
  { name: 'BAKHOOR', slug: 'bakhoor', image: bakhoorImg },
  { name: 'MUSKY', slug: 'musky', image: muskyImg },
  { name: 'OUD', slug: 'oud', image: oudImg },
  { name: 'FLORAL', slug: 'floral', image: floralImg },
  { name: 'WOODY', slug: 'woody', image: woodyImg },
];

export default function ShopByFragrance() {
  const [categories, setCategories] = useState(DEFAULT_FRAGRANCES);

  useEffect(() => {
    let isMounted = true;
    async function loadDynamicCategories() {
      try {
        const remoteCats = await getCategories();
        if (isMounted && Array.isArray(remoteCats) && remoteCats.length > 0) {
          // Merge dynamic image_url if provided by Supabase admin and valid
          const merged = DEFAULT_FRAGRANCES.map((def) => {
            const found = remoteCats.find(
              (rc) => rc.slug?.toLowerCase() === def.slug.toLowerCase()
            );
            if (found && found.image_url && !found.image_url.startsWith('/assets/')) {
              return { ...def, image: found.image_url };
            }
            return def;
          });
          setCategories(merged);
        }
      } catch (err) {
        console.warn('Using local fragrance category defaults:', err);
      }
    }
    loadDynamicCategories();
    return () => {
      isMounted = false;
    };
  }, []);

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
            <h2 className="ps-fragrance-title">Shop by Fragrance</h2>
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

        {/* 7 Luxury Fragrance Categories Carousel / Row */}
        <div className="ps-fragrance-carousel-track">
          <div className="ps-fragrance-cards-row">
            {categories.map((cat) => (
              <FragranceCategoryCard
                key={cat.slug}
                name={cat.name}
                slug={cat.slug}
                image={cat.image}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
