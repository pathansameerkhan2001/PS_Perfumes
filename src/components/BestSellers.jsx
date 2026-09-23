import React from 'react';
import prodRoyalAmber from '../assets/prod-royal-amber.jpg';
import prodNoirAbsolu from '../assets/prod-noir-absolu.jpg';
import prodVelvetSantal from '../assets/cat-unisex.jpg';
import prodRoseImperiale from '../assets/cat-women.jpg';

const BEST_SELLER_PRODUCTS = [
  {
    id: 1,
    name: 'Royal Amber Extrait',
    category: 'Extrait de Parfum',
    notes: 'Warm Amber • Precious Oud • Madagascan Vanilla',
    price: '$185',
    volume: '100ml / 3.4 FL. OZ.',
    image: prodRoyalAmber,
    badge: 'BESTSELLER',
  },
  {
    id: 2,
    name: 'Noir Absolu',
    category: 'Eau de Parfum',
    notes: 'Smoked Birch • Dark Leather • Indonesian Patchouli',
    price: '$165',
    volume: '100ml / 3.4 FL. OZ.',
    image: prodNoirAbsolu,
    badge: 'NEW',
  },
  {
    id: 3,
    name: 'Velvet Santal',
    category: 'Pure Fragrance Extrait',
    notes: 'Mysore Sandalwood • Ceylon Cardamom • Golden Amber',
    price: '$145',
    volume: '50ml / 1.7 FL. OZ.',
    image: prodVelvetSantal,
    badge: 'ICONIC',
  },
  {
    id: 4,
    name: 'Rose Impériale',
    category: 'Extrait de Parfum',
    notes: 'Damascena Rose • Crimson Saffron • White Cashmere',
    price: '$195',
    volume: '100ml / 3.4 FL. OZ.',
    image: prodRoseImperiale,
    badge: 'LIMITED',
  },
];

export default function BestSellers() {
  return (
    <section className="ps-bestsellers-section" aria-label="Explore Best Sellers">
      <div className="ps-bestsellers-container">
        <div className="ps-bestsellers-header">
          <span className="ps-bestsellers-tag">THE ATELIER COLLECTION</span>
          <h2 className="ps-bestsellers-heading">Explore Our Best Sellers</h2>
          <div className="ps-bestsellers-divider" />
        </div>

        <div className="ps-bestsellers-grid">
          {BEST_SELLER_PRODUCTS.map((product) => (
            <div key={product.id} className="ps-product-card">
              <div className="ps-product-image-container">
                <img
                  src={product.image}
                  alt={product.name}
                  className="ps-product-img"
                  loading="lazy"
                />
                {product.badge && (
                  <span className="ps-product-badge">{product.badge}</span>
                )}
              </div>

              <div className="ps-product-info">
                <span className="ps-product-category">{product.category}</span>
                <h3 className="ps-product-title">{product.name}</h3>
                <p className="ps-product-notes">{product.notes}</p>
                <div className="ps-product-footer">
                  <div className="ps-product-pricing">
                    <span className="ps-product-price">{product.price}</span>
                    <span className="ps-product-volume">{product.volume}</span>
                  </div>
                  <button type="button" className="ps-product-add-btn">
                    ADD TO BAG
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
