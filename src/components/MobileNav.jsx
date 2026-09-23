import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ArrowRight, User, Heart, ShoppingBag, Search, Sparkles } from 'lucide-react';
import brandLogo from '../assets/ps-perfumes-logo.png';

export default function MobileNav({
  isOpen,
  onClose,
  navLinks,
  activeLink,
  onSelectLink,
  onOpenSearch,
}) {
  // Prevent background scrolling when mobile menu is open
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
      transition: {
        duration: 0.35,
        ease: [0.32, 0.72, 0, 1],
      },
    },
    open: {
      opacity: 1,
      x: '0%',
      transition: {
        duration: 0.4,
        ease: [0.16, 1, 0.3, 1],
        when: 'beforeChildren',
        staggerChildren: 0.06,
      },
    },
  };

  const itemVariants = {
    closed: { opacity: 0, x: -16 },
    open: {
      opacity: 1,
      x: 0,
      transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] },
    },
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="mobile-nav-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
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
            {/* Drawer Top Bar */}
            <div className="mobile-nav-header">
              <div className="mobile-nav-brand">
                <img
                  src={brandLogo}
                  alt="PS PERFUMES"
                  className="mobile-nav-logo-img"
                  width="120"
                  height="44"
                />
              </div>
              <button
                type="button"
                className="mobile-nav-close-btn"
                onClick={onClose}
                aria-label="Close menu"
              >
                <X size={22} />
              </button>
            </div>

            {/* Quick Search Action inside Menu */}
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
                <span>Search fragrances & collections</span>
              </button>
            </div>

            {/* Primary Navigation Links */}
            <nav className="mobile-nav-list">
              {navLinks.map((link, idx) => {
                const isActive = activeLink === link.name;
                return (
                  <motion.div key={link.name} variants={itemVariants}>
                    <a
                      href={link.href}
                      className={`mobile-nav-link ${isActive ? 'active' : ''}`}
                      onClick={(e) => {
                        e.preventDefault();
                        onSelectLink(link.name);
                        onClose();
                      }}
                    >
                      <span className="mobile-nav-link-text">{link.name}</span>
                      <ArrowRight size={16} className="mobile-nav-link-arrow" />
                    </a>
                  </motion.div>
                );
              })}
            </nav>

            {/* NEW ARRIVAL Banner for Mobile */}
            <div className="mobile-nav-new-arrival">
              <a
                href="#new-arrivals"
                className="mobile-nav-arrival-pill"
                onClick={onClose}
              >
                <span>NEW ARRIVAL</span>
                <ArrowRight size={14} />
              </a>
            </div>

            {/* Divider */}
            <div className="mobile-nav-divider" />

            {/* Secondary Utility Links */}
            <div className="mobile-nav-utility">
              <a href="#delivery" className="mobile-utility-item" onClick={onClose}>
                <span className="mobile-util-dot" style={{ color: '#c5a059' }}>🚚</span>
                <span>Track Delivery</span>
              </a>
              <a href="#account" className="mobile-utility-item" onClick={onClose}>
                <User size={18} />
                <span>Account & Express</span>
              </a>
              <a href="#cart" className="mobile-utility-item" onClick={onClose}>
                <ShoppingBag size={18} />
                <span>Shopping Bag</span>
              </a>
            </div>

            {/* Drawer Footer / Brand Ethos */}
            <div className="mobile-nav-footer">
              <div className="mobile-nav-tagline">
                <Sparkles size={13} className="gold-sparkle-icon" />
                <span>HAUTE PARFUMERIE • BESPOKE CREATIONS</span>
              </div>
              <p className="mobile-nav-craft-note">
                Crafted with pure botanicals & rare olfactory essences.
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
