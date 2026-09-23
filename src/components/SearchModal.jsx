import React, { useEffect, useRef, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, X, ArrowRight } from 'lucide-react';
import { PRODUCTS, COMBO_PRODUCTS } from '../data/products';
import { formatINR } from '../utils/formatCurrency';
import { useCart } from '../context/CartContext';
import './SearchModal.css';

export default function SearchModal({ isOpen, onClose }) {
  const inputRef = useRef(null);
  const [searchTerm, setSearchTerm] = useState('');
  const { setSelectedProduct } = useCart();

  const allItems = useMemo(() => [...PRODUCTS, ...COMBO_PRODUCTS], []);

  useEffect(() => {
    if (isOpen) {
      setSearchTerm('');
      setTimeout(() => inputRef.current?.focus(), 150);
      const handleKeyDown = (e) => {
        if (e.key === 'Escape') onClose();
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, onClose]);

  const quickSearches = [
    'Attar',
    'Oud',
    'Combo Pack',
    'Amber',
    'Rose',
    'Bakhoor',
    'Solid Perfume',
  ];

  const filteredResults = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return [];
    return allItems.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q) ||
        item.subcategories?.some((s) => s.toLowerCase().includes(q)) ||
        item.description?.toLowerCase().includes(q)
    );
  }, [searchTerm, allItems]);

  const handleSelectProduct = (product) => {
    setSelectedProduct(product);
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="search-modal-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          onClick={onClose}
        >
          <motion.div
            className="search-modal-container"
            initial={{ opacity: 0, y: -24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="search-modal-header">
              <div className="search-input-wrapper">
                <Search size={20} className="search-icon-inside" />
                <input
                  ref={inputRef}
                  type="text"
                  placeholder="Search perfumes, attars, combo packs, notes..."
                  className="search-input-field"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <button
                type="button"
                className="search-close-btn"
                onClick={onClose}
                aria-label="Close search"
              >
                <X size={20} />
              </button>
            </div>

            <div className="search-modal-body">
              {/* Quick suggestions */}
              {!searchTerm && (
                <>
                  <div className="search-curated-label">SUGGESTED DISCOVERIES</div>
                  <div className="search-tags-row">
                    {quickSearches.map((term) => (
                      <button
                        key={term}
                        type="button"
                        className="search-tag-chip"
                        onClick={() => setSearchTerm(term)}
                      >
                        {term}
                      </button>
                    ))}
                  </div>
                </>
              )}

              {/* Live search results */}
              {searchTerm && (
                <div className="search-results-list">
                  <div className="search-curated-label">
                    MATCHING CREATIONS ({filteredResults.length})
                  </div>
                  {filteredResults.length === 0 ? (
                    <p style={{ color: '#777', fontSize: '13.5px', padding: '12px 0' }}>
                      No creations found matching "{searchTerm}". Try "Oud", "Attar", or "Combo".
                    </p>
                  ) : (
                    filteredResults.slice(0, 8).map((product) => (
                      <button
                        key={product.id}
                        type="button"
                        className="search-result-item"
                        onClick={() => handleSelectProduct(product)}
                      >
                        <div className="search-result-thumb">
                          <img src={product.image} alt={product.name} />
                        </div>
                        <div className="search-result-info">
                          <h4 className="search-result-name">{product.name}</h4>
                          <span className="search-result-type">
                            {product.type || product.category}
                          </span>
                        </div>
                        <span className="search-result-price">
                          {formatINR(product.price)}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
