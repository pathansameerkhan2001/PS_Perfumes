import React, { useState } from 'react';
import ProductCard from './ProductCard';
import { useCart } from '../context/CartContext';
import './ProductCard.css';

export default function ProductGridSection({
  id = 'catalog-grid',
  tag = 'THE ATELIER COLLECTION',
  title = 'Explore Our Best Sellers',
  products = [],
  showFilterTabs = true,
  limit = 8,
}) {
  const { selectedCategory, setSelectedCategory } = useCart();
  const [activeTab, setActiveTab] = useState('ALL');

  const TABS = [
    { id: 'ALL', label: 'All Fragrances' },
    { id: 'Best Sellers', label: 'Best Sellers' },
    { id: 'Perfume', label: 'Perfumes' },
    { id: 'Attar', label: 'Pure Attar' },
    { id: 'Oud', label: 'Rare Oud' },
    { id: 'Gift Sets', label: 'Discovery Sets' },
  ];

  // Filtering logic: first check if global selectedCategory is active, else tab
  const filteredProducts = products.filter((prod) => {
    // If user clicked a category pill from the top category bar
    if (selectedCategory && selectedCategory !== 'ALL') {
      const matchGlobal =
        prod.category.toLowerCase() === selectedCategory.toLowerCase() ||
        prod.subcategories?.some((s) => s.toLowerCase() === selectedCategory.toLowerCase());
      if (!matchGlobal) return false;
    }

    // Local tab filter
    if (activeTab === 'ALL') return true;
    if (activeTab === 'Best Sellers') return prod.isBestSeller;
    return (
      prod.category.toLowerCase() === activeTab.toLowerCase() ||
      prod.subcategories?.some((s) => s.toLowerCase() === activeTab.toLowerCase())
    );
  });

  const displayList = limit ? filteredProducts.slice(0, limit) : filteredProducts;

  return (
    <section id={id} className="ps-bestsellers-section" aria-label={title}>
      <div className="ps-bestsellers-container">
        {/* Section Header */}
        <div className="ps-bestsellers-header">
          {tag && <span className="ps-bestsellers-tag">{tag}</span>}
          <h2 className="ps-bestsellers-heading">{title}</h2>
          <div className="ps-bestsellers-divider" />
        </div>

        {/* Filter Tabs if enabled */}
        {showFilterTabs && (
          <div className="ps-catalog-tabs">
            {TABS.map((tab) => {
              const isActive = (selectedCategory === 'ALL' || !selectedCategory)
                ? activeTab === tab.id
                : selectedCategory.toLowerCase() === tab.id.toLowerCase();
              return (
                <button
                  key={tab.id}
                  type="button"
                  className={`ps-catalog-tab-btn ${isActive ? 'is-active' : ''}`}
                  onClick={() => {
                    setSelectedCategory('ALL');
                    setActiveTab(tab.id);
                  }}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        )}

        {/* Product Grid */}
        {displayList.length === 0 ? (
          <div className="ps-grid-empty">
            <p>No fragrances found in this category.</p>
            <button
              type="button"
              className="ps-grid-reset-btn"
              onClick={() => {
                setSelectedCategory('ALL');
                setActiveTab('ALL');
              }}
            >
              View All Fragrances
            </button>
          </div>
        ) : (
          <div className="ps-bestsellers-grid">
            {displayList.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        )}

        {/* View All / Explore CTA */}
        {filteredProducts.length > limit && (
          <div className="ps-grid-footer">
            <button
              type="button"
              className="ps-view-all-btn"
              onClick={() => {
                setSelectedCategory('ALL');
                setActiveTab('ALL');
              }}
            >
              DISCOVER COMPLETE COLLECTION ({filteredProducts.length} ITEMS)
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
