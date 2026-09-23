import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  ChevronDown,
  ArrowRight,
  ShoppingBag,
  Search,
  Sparkles,
  Package,
  Heart,
  Truck,
  ExternalLink,
} from 'lucide-react';
import brandLogo from '../assets/ps-perfumes-logo.webp';
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

// Full navigation items matching requirement 3
const PRIMARY_NAV = [
  { name: 'Home', isAccordion: false },
  { name: 'About Us', isAccordion: false },
  { name: 'Attar', isAccordion: false },
  { name: 'Perfume', isAccordion: false },
  { name: 'Bakhoor', isAccordion: false },
  { name: 'Musky', isAccordion: false },
  { name: 'Oud', isAccordion: false },
  { name: 'Floral', isAccordion: false },
  { name: 'Woody', isAccordion: false },
  { name: 'Shop All', isAccordion: true },
];

const SHOP_ALL_SUBITEMS = [
  { name: 'Best Sellers', badge: 'Popular' },
  { name: 'Combo Pack', badge: 'Save Up to 47%', isCombo: true },
  { name: 'Perfume for Men', filter: 'Men' },
  { name: 'Perfume for Women', filter: 'Women' },
  { name: 'Unisex', filter: 'Unisex' },
  { name: 'Gift Sets', badge: 'Gifts' },
  { name: 'Fresh', filter: 'Perfume' },
  { name: 'View All', filter: 'ALL' },
];

export default function MobileNav({
  isOpen,
  onClose,
  activeLink,
  onSelectLink,
  onOpenSearch,
}) {
  const [isShopAllOpen, setIsShopAllOpen] = useState(false);
  const { itemCount, setIsCartOpen, setIsWishlistOpen, wishlist } = useCart();

  // Prevent background scrolling when mobile menu is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
      setIsShopAllOpen(false);
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  const containerVariants = {
    closed: {
      opacity: 0,
      x: '-100%',
      transition: { duration: 0.3, ease: [0.32, 0.72, 0, 1] },
    },
    open: {
      opacity: 1,
      x: '0%',
      transition: {
        duration: 0.38,
        ease: [0.16, 1, 0.3, 1],
      },
    },
  };

  const handleItemClick = (name) => {
    onSelectLink(name);
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="mobile-nav-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          onClick={onClose}
        >
          <motion.div
            className="mobile-nav-drawer"
            variants={containerVariants}
            initial="closed"
            animate="open"
            exit="closed"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 1. Header with prominent logo */}
            <div className="mobile-nav-header">
              <div className="mobile-nav-brand">
                <img
                  src={brandLogo}
                  alt="PS PERFUMES"
                  className="mobile-nav-logo-img"
                  width="160"
                  height="52"
                />
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
                <span>Search perfumes, attars & combos...</span>
              </button>
            </div>

            {/* 3. Primary Navigation List with Accordion */}
            <nav className="mobile-nav-list" aria-label="Mobile Navigation Menu">
              {PRIMARY_NAV.map((item) => {
                if (item.isAccordion) {
                  return (
                    <div key={item.name} className="mobile-nav-item">
                      <button
                        type="button"
                        className={`mobile-nav-link ${isShopAllOpen ? 'active' : ''}`}
                        onClick={() => setIsShopAllOpen((prev) => !prev)}
                        aria-expanded={isShopAllOpen}
                      >
                        <span className="mobile-nav-link-text">
                          <span className="mobile-nav-dot" />
                          <span>{item.name}</span>
                        </span>
                        <ChevronDown
                          size={18}
                          className={`mobile-nav-chevron ${isShopAllOpen ? 'is-open' : ''}`}
                        />
                      </button>

                      {/* Smooth Accordion Body */}
                      <AnimatePresence>
                        {isShopAllOpen && (
                          <motion.div
                            className="mobile-nav-submenu"
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                          >
                            {SHOP_ALL_SUBITEMS.map((sub) => (
                              <a
                                key={sub.name}
                                href={`#${sub.filter || sub.name.toLowerCase().replace(/\s+/g, '-')}`}
                                className="mobile-sub-link"
                                onClick={(e) => {
                                  e.preventDefault();
                                  handleItemClick(sub.filter || sub.name);
                                }}
                              >
                                <span>{sub.name}</span>
                                {sub.badge && (
                                  <span className={`mobile-sub-badge ${sub.isCombo ? 'is-combo' : ''}`}>
                                    {sub.badge}
                                  </span>
                                )}
                              </a>
                            ))}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                }

                const isActive = activeLink === item.name;
                return (
                  <div key={item.name} className="mobile-nav-item">
                    <button
                      type="button"
                      className={`mobile-nav-link ${isActive ? 'active' : ''}`}
                      onClick={() => handleItemClick(item.name)}
                    >
                      <span className="mobile-nav-link-text">
                        <span>{item.name}</span>
                      </span>
                      <ArrowRight size={15} color="#999999" />
                    </button>
                  </div>
                );
              })}
            </nav>

            {/* 4. Quick Promotional Cards */}
            <div className="mobile-nav-promos">
              <a
                href="#combo-pack"
                className="mobile-nav-promo-card is-gold"
                onClick={(e) => {
                  e.preventDefault();
                  handleItemClick('Combo Pack');
                }}
              >
                <span>🔥 COMBO PACK OFFERS (SAVE UP TO 47%)</span>
                <ArrowRight size={14} />
              </a>

              <a
                href="#new-arrivals"
                className="mobile-nav-promo-card is-red"
                onClick={(e) => {
                  e.preventDefault();
                  handleItemClick('New Arrivals');
                }}
              >
                <span>✨ NEW ARRIVALS & PRIVATE BLENDS</span>
                <ArrowRight size={14} />
              </a>
            </div>

            {/* 5. Official Instagram Channel Link */}
            <a
              href="https://www.instagram.com/ps_perfumes_kadapa/?hl=en"
              target="_blank"
              rel="noopener noreferrer"
              className="mobile-nav-instagram-row"
            >
              <div className="mobile-nav-insta-content">
                <InstagramIcon size={16} />
                <span>Follow @ps_perfumes_kadapa</span>
              </div>
              <ExternalLink size={14} />
            </a>

            {/* 6. Utility Section at Bottom */}
            <div className="mobile-nav-utility">
              <button
                type="button"
                className="mobile-utility-item"
                onClick={() => {
                  onClose();
                  setIsCartOpen(true);
                }}
              >
                <div className="mobile-utility-left">
                  <ShoppingBag size={17} color="#c5a059" />
                  <span>Shopping Bag</span>
                </div>
                {itemCount > 0 && (
                  <span className="mobile-utility-badge">{itemCount} items</span>
                )}
              </button>

              <button
                type="button"
                className="mobile-utility-item"
                onClick={() => {
                  onClose();
                  setIsWishlistOpen(true);
                }}
              >
                <div className="mobile-utility-left">
                  <Heart size={17} color="#eb1c24" />
                  <span>My Wishlist</span>
                </div>
                {wishlist.length > 0 && (
                  <span className="mobile-utility-badge">{wishlist.length}</span>
                )}
              </button>

              <div className="mobile-utility-item">
                <div className="mobile-utility-left">
                  <Truck size={17} color="#c5a059" />
                  <span>Free Express Delivery Over ₹999</span>
                </div>
              </div>
            </div>

            {/* 7. Footer Tagline */}
            <div className="mobile-nav-footer">
              <div className="mobile-nav-tagline">
                <Sparkles size={12} />
                <span>HAUTE PARFUMERIE • PURE BOTANICALS</span>
              </div>
              <p className="mobile-nav-craft-note">
                Crafted with rare aged oud & distilled natural essences.
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
