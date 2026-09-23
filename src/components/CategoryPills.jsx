import React from 'react';
import { useCart } from '../context/CartContext';
import catBestSellers from '../assets/cat-bestsellers.jpg';
import catGiftSets from '../assets/cat-giftsets.jpg';
import catUnisex from '../assets/cat-unisex.jpg';
import catMen from '../assets/cat-men.jpg';
import catWomen from '../assets/cat-women.jpg';
import prodRoyalAmber from '../assets/prod-royal-amber.jpg';
import prodNoirAbsolu from '../assets/prod-noir-absolu.jpg';
import promoBanner from '../assets/promo-banner.jpg';
import comboAttarSet from '../assets/combo-attar-set.jpg';

const CATEGORIES = [
  { id: 'ALL', name: 'ALL COLLECTIONS', image: prodRoyalAmber },
  { id: 'Best Sellers', name: 'BEST SELLERS', image: catBestSellers },
  { id: 'Combo Pack', name: 'COMBO PACK', image: comboAttarSet, isAnchor: '#combo-pack' },
  { id: 'Gift Sets', name: 'GIFT SETS', image: catGiftSets },
  { id: 'Attar', name: 'ATTAR', image: catWomen },
  { id: 'Perfume', name: 'PERFUME', image: prodNoirAbsolu },
  { id: 'Bakhoor', name: 'BAKHOOR', image: catGiftSets },
  { id: 'Oud', name: 'OUD', image: promoBanner },
  { id: 'Unisex', name: 'UNISEX', image: catUnisex },
  { id: 'Men', name: 'MEN', image: catMen },
  { id: 'Women', name: 'WOMEN', image: catWomen },
];

export default function CategoryPills() {
  const { selectedCategory, setSelectedCategory } = useCart();

  const handleSelect = (cat) => {
    if (cat.isAnchor) {
      const el = document.getElementById(cat.isAnchor.replace('#', ''));
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
    }

    setSelectedCategory(cat.id);
    const target = document.getElementById('catalog-grid') || document.getElementById('best-sellers');
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <section className="ps-categories-section" aria-label="Find By Category">
      <div className="ps-categories-container">
        <h2 className="ps-categories-heading">Find By Category</h2>

        <div className="ps-categories-grid">
          {CATEGORIES.map((cat) => {
            const isActive = selectedCategory === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                className={`ps-category-pill-card ${isActive ? 'is-active' : ''}`}
                onClick={() => handleSelect(cat)}
              >
                <div className="ps-category-thumb-wrapper">
                  <img
                    src={cat.image}
                    alt={cat.name}
                    className="ps-category-thumb-img"
                    width="50"
                    height="50"
                    loading="lazy"
                  />
                </div>
                <span className="ps-category-pill-title">{cat.name}</span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
