import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  ShoppingBag,
  Search,
  Heart,
  ExternalLink,
  MapPin,
} from 'lucide-react';
import PSPerfumesLogo from './common/PSPerfumesLogo';
import { useCart } from '../context/CartContext';
import './MobileNav.css';

// Instagram Icon
function InstagramIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
    </svg>
  );
}

// Navigation items matching exactly the 9 primary navigation items
const PRIMARY_NAV = [
  { name: 'Home', path: '/' },
  { name: 'About Us', path: '/about' },
  { name: 'Attar', path: '/attar' },
  { name: 'Perfume', path: '/perfume' },
  { name: 'Bakhoor', path: '/bakhoor' },
  { name: 'Musky', path: '/musky' },
  { name: 'Oud', path: '/oud' },
  { name: 'Floral', path: '/floral' },
  { name: 'Woody', path: '/woody' },
];

export default function MobileNav({
  isOpen,
  onClose,
  activeLink,
  onSelectLink,
  onOpenSearch,
}) {
  const { itemCount, setIsCartOpen, setIsWishlistOpen, wishlist } = useCart();

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  const containerVariants = {
    closed: {
      opacity: 0,
      x: '-100%',
      transition: { duration: 0.28, ease: [0.32, 0.72, 0, 1] },
    },
    open: {
      opacity: 1,
      x: '0%',
      transition: {
        duration: 0.35,
        ease: [0.16, 1, 0.3, 1],
      },
    },
  };

  const handleItemClick = (path, name) => {
    onSelectLink(path || name);
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="ps-mobile-nav-portal">
          {/* Backdrop Blur */}
          <motion.div
            className="mobile-nav-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            onClick={onClose}
            aria-hidden="true"
          />

          {/* Full-Height Drawer */}
          <motion.aside
            className="mobile-nav-drawer"
            variants={containerVariants}
            initial="closed"
            animate="open"
            exit="closed"
            role="dialog"
            aria-modal="true"
            aria-label="Navigation Menu"
          >
            {/* 1. Header Bar with Logo and Close */}
            <div className="mobile-nav-header">
              <div className="mobile-nav-brand">
                <PSPerfumesLogo size="sm" variant="header" />
              </div>
              <button
                type="button"
                className="mobile-nav-close-btn"
                onClick={onClose}
                aria-label="Close navigation"
              >
                <X size={20} />
              </button>
            </div>

            {/* 2. Interactive Search Trigger */}
            <div className="mobile-nav-search-bar">
              <button
                type="button"
                className="mobile-nav-search-trigger"
                onClick={() => {
                  onClose();
                  onOpenSearch();
                }}
              >
                <Search size={16} />
                <span>Search perfumes, attars & oud...</span>
              </button>
            </div>

            {/* 3. Primary Navigation List */}
            <nav className="mobile-nav-list" aria-label="Mobile Navigation Menu">
              {PRIMARY_NAV.map((item) => {
                const isActive =
                  activeLink === item.path ||
                  (item.path !== '/' && activeLink === `/category${item.path}`);
                return (
                  <div key={item.name} className="mobile-nav-item">
                    <button
                      type="button"
                      className={`mobile-nav-link ${isActive ? 'active' : ''}`}
                      onClick={() => handleItemClick(item.path, item.name)}
                    >
                      <span className="mobile-nav-link-text">
                        <span>{item.name}</span>
                      </span>
                    </button>
                  </div>
                );
              })}
            </nav>

            {/* 4. Quick Action Pills (Bag, Wishlist, Admin) */}
            <div className="mobile-nav-quick-actions">
              <button
                type="button"
                className="mobile-quick-btn"
                onClick={() => {
                  onClose();
                  setIsCartOpen(true);
                }}
              >
                <div className="mobile-quick-icon-wrap">
                  <ShoppingBag size={18} />
                  {itemCount > 0 && <span className="mobile-quick-badge">{itemCount}</span>}
                </div>
                <span>Shopping Bag</span>
              </button>

              <button
                type="button"
                className="mobile-quick-btn"
                onClick={() => {
                  onClose();
                  setIsWishlistOpen(true);
                }}
              >
                <div className="mobile-quick-icon-wrap">
                  <Heart size={18} />
                  {wishlist.length > 0 && (
                    <span className="mobile-quick-badge">{wishlist.length}</span>
                  )}
                </div>
                <span>Wishlist</span>
              </button>
            </div>

            {/* 5. Kadapa Store Location & Concierge Info */}
            <div className="mobile-nav-footer">
              <div className="mobile-nav-store-info">
                <MapPin size={15} color="#c8a45d" />
                <span>Kadapa, Andhra Pradesh – 516001</span>
              </div>
              <div className="mobile-nav-store-links">
                <a
                  href="https://www.instagram.com/ps_perfumes_kadapa/?hl=en"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mobile-store-link"
                >
                  <InstagramIcon size={14} />
                  <span>@ps_perfumes_kadapa</span>
                </a>
                <a
                  href="https://share.google/b0yildKJKTaGc365J"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mobile-store-link"
                >
                  <ExternalLink size={14} />
                  <span>Google Maps</span>
                </a>
              </div>
            </div>
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  );
}
