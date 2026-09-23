import React from 'react';
import catBestSellers from '../assets/cat-bestsellers-thumb.webp';
import catGiftSets from '../assets/cat-giftsets-thumb.webp';
import catUnisex from '../assets/cat-unisex-thumb.webp';
import catMen from '../assets/cat-men-thumb.webp';
import catWomen from '../assets/cat-women-thumb.webp';

const CATEGORIES = [
  { name: 'BEST SELLERS', href: '#best-sellers', image: catBestSellers },
  { name: 'GIFT SETS', href: '#gift-sets', image: catGiftSets },
  { name: 'UNISEX', href: '#unisex', image: catUnisex },
  { name: 'MEN', href: '#men', image: catMen },
  { name: 'WOMEN', href: '#women', image: catWomen },
];

export default function Categories() {
  return (
    <section className="ps-categories-section" aria-label="Product Categories">
      <div className="ps-categories-container">
        <h2 className="ps-categories-heading">Find By Category</h2>

        <div className="ps-categories-grid">
          {CATEGORIES.map((cat) => (
            <a key={cat.name} href={cat.href} className="ps-category-pill-card">
              <div className="ps-category-thumb-wrapper">
                <img
                  src={cat.image}
                  alt={cat.name}
                  className="ps-category-thumb-img"
                  width="52"
                  height="52"
                />
              </div>
              <span className="ps-category-pill-title">{cat.name}</span>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
