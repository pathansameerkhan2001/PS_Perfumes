import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, X, ArrowRight } from 'lucide-react';

export default function SearchModal({ isOpen, onClose }) {
  const inputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 150);
      const handleKeyDown = (e) => {
        if (e.key === 'Escape') onClose();
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, onClose]);

  const quickSearches = [
    'Oud Royal',
    'Amber Absolu',
    'Santal Precieux',
    'Rose Damascena',
    'Extrait de Parfum',
  ];

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
                  placeholder="Search fragrances, notes, collections..."
                  className="search-input-field"
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
              <div className="search-curated-label">SUGGESTED DISCOVERIES</div>
              <div className="search-tags-row">
                {quickSearches.map((term) => (
                  <button key={term} type="button" className="search-tag-chip">
                    {term}
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
