import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Home,
  Info,
  Droplets,
  SprayCan,
  Flame,
  Moon,
  Crown,
  Flower2,
  TreePine,
  Sparkles,
  BadgePercent,
  Truck,
  User,
  Heart,
  ShoppingBag,
  ChevronRight,
} from 'lucide-react';
import PSPerfumesLogo from './common/PSPerfumesLogo';
import { useCart } from '../context/CartContext';
import './MobileNav.css';

// EXACT 12 navigation items in specified order (Shop All strictly excluded)
const NAVIGATION_ITEMS = [
  { name: 'Home', path: '/', icon: Home },
  { name: 'About Us', path: '/about', icon: Info },
  { name: 'Attar', path: '/attar', icon: Droplets },
  { name: 'Perfume', path: '/perfume', icon: SprayCan },
  { name: 'Bakhoor', path: '/bakhoor', icon: Flame },
  { name: 'Musky', path: '/musky', icon: Moon },
  { name: 'Oud', path: '/oud', icon: Crown },
  { name: 'Floral', path: '/floral', icon: Flower2 },
  { name: 'Woody', path: '/woody', icon: TreePine },
  { name: 'New Arrival', path: '/shop?filter=new_arrival', icon: Sparkles },
  { name: 'Offers', path: '/offers', icon: BadgePercent },
  { name: 'Track Order', path: '/track-order', icon: Truck },
];

export default function MobileNav({
  isOpen,
  onClose,
  activeLink = '/',
  onSelectLink,
}) {
  const { itemCount, setIsCartOpen, setIsWishlistOpen, wishlist = [] } = useCart();
  const drawerRef = useRef(null);

  // Lock background scrolling across iOS and Android browsers without layout shifts
  useEffect(() => {
    if (!isOpen) return;

    const scrollY = window.scrollY;
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.left = '0';
    document.body.style.right = '0';
    document.body.style.width = '100%';
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.left = '';
      document.body.style.right = '';
      document.body.style.width = '';
      document.body.style.overflow = '';
      window.scrollTo(0, scrollY);
    };
  }, [isOpen]);

  // Handle Escape key to close drawer
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Drawer slide-in & fade animation variants
  const drawerVariants = {
    closed: {
      x: '-100%',
      opacity: 0,
      transition: {
        duration: 0.28,
        ease: [0.32, 0.72, 0, 1],
      },
    },
    open: {
      x: '0%',
      opacity: 1,
      transition: {
        duration: 0.35,
        ease: [0.16, 1, 0.3, 1],
      },
    },
  };

  const backdropVariants = {
    closed: { opacity: 0 },
    open: { opacity: 1, transition: { duration: 0.25 } },
  };

  // Determine if a navigation item is currently active
  const isItemActive = (item) => {
    if (item.path === '/') {
      return activeLink === '/';
    }
    if (item.name === 'New Arrival') {
      if (typeof window !== 'undefined') {
        const search = window.location.search;
        return search.includes('new_arrival') || activeLink.includes('new_arrival');
      }
      return activeLink.includes('new_arrival');
    }
    if (item.name === 'Offers') {
      if (typeof window !== 'undefined') {
        const search = window.location.search;
        return activeLink === '/offers' || search.includes('offers');
      }
      return activeLink === '/offers';
    }
    if (item.name === 'Track Order') {
      return activeLink === '/track-order';
    }
    if (item.path === '/about') {
      return activeLink === '/about';
    }
    // Category match
    return (
      activeLink === item.path ||
      activeLink === `/category${item.path}` ||
      activeLink === `/category/${item.name.toLowerCase()}`
    );
  };

  const handleItemClick = (item) => {
    onSelectLink(item.path, item.name);
    onClose();
  };

  const handleAccountClick = () => {
    onSelectLink('/admin/login', 'Account');
    onClose();
  };

  const handleWishlistClick = () => {
    onClose();
    setIsWishlistOpen(true);
  };

  const handleCartClick = () => {
    onClose();
    setIsCartOpen(true);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="ps-mobile-nav-portal">
          {/* Backdrop Blur */}
          <motion.div
            className="mobile-nav-backdrop"
            variants={backdropVariants}
            initial="closed"
            animate="open"
            exit="closed"
            onClick={onClose}
            aria-hidden="true"
          />

          {/* Full-Height Black & Gold Drawer */}
          <motion.aside
            ref={drawerRef}
            className="mobile-nav-drawer"
            variants={drawerVariants}
            initial="closed"
            animate="open"
            exit="closed"
            role="dialog"
            aria-modal="true"
            aria-label="PS PERFUMES Mobile Navigation Menu"
          >
            {/* 1. Header Bar: Official Brand Logo & Clear Close (X) Button */}
            <div className="mobile-nav-header">
              <div className="mobile-nav-brand">
                <PSPerfumesLogo size="sm" variant="header" />
              </div>
              <button
                type="button"
                className="mobile-nav-close-btn"
                onClick={onClose}
                aria-label="Close navigation menu"
                title="Close"
              >
                <X size={20} />
              </button>
            </div>

            {/* Subtle Brand Tagline Divider */}
            <div className="mobile-nav-brand-strip" aria-hidden="true">
              <span className="mobile-nav-tagline">HAUTE PARFUMERIE • KADAPA</span>
            </div>

            {/* 2. Scrollable Body: Exact 12 Navigation Items in Defined Order */}
            <div className="mobile-nav-body">
              <nav className="mobile-nav-list" aria-label="Store Navigation">
                {NAVIGATION_ITEMS.map((item, idx) => {
                  const Icon = item.icon;
                  const isActive = isItemActive(item);

                  return (
                    <div key={item.name} className="mobile-nav-item">
                      <button
                        type="button"
                        className={`mobile-nav-link ${isActive ? 'is-active' : ''}`}
                        onClick={() => handleItemClick(item)}
                        aria-current={isActive ? 'page' : undefined}
                      >
                        <div className="mobile-nav-link-left">
                          <span className="mobile-nav-icon-wrap" aria-hidden="true">
                            <Icon size={18} className="mobile-nav-icon" />
                          </span>
                          <span className="mobile-nav-label">{item.name}</span>
                        </div>

                        <div className="mobile-nav-link-right">
                          {item.name === 'New Arrival' && (
                            <span className="mobile-nav-badge-pill mobile-badge-new">NEW</span>
                          )}
                          {item.name === 'Offers' && (
                            <span className="mobile-nav-badge-pill mobile-badge-sale">OFFER</span>
                          )}
                          <ChevronRight size={15} className="mobile-nav-arrow" aria-hidden="true" />
                        </div>
                      </button>
                    </div>
                  );
                })}
              </nav>
            </div>

            {/* 3. Account Shortcuts Bar at Bottom: Account, Wishlist, Bag */}
            <div className="mobile-nav-shortcuts-section">
              <div className="mobile-nav-shortcuts-label" aria-hidden="true">
                <span>PATRON SERVICES</span>
              </div>

              <div className="mobile-nav-shortcuts-grid">
                {/* Account Shortcut */}
                <button
                  type="button"
                  className="mobile-shortcut-btn"
                  onClick={handleAccountClick}
                  aria-label="Go to Account / Admin Portal"
                >
                  <div className="mobile-shortcut-icon-box">
                    <User size={19} className="mobile-shortcut-icon" />
                  </div>
                  <span className="mobile-shortcut-title">Account</span>
                </button>

                {/* Wishlist Shortcut */}
                <button
                  type="button"
                  className="mobile-shortcut-btn"
                  onClick={handleWishlistClick}
                  aria-label={`View Wishlist (${wishlist.length} items)`}
                >
                  <div className="mobile-shortcut-icon-box">
                    <Heart size={19} className="mobile-shortcut-icon" />
                    {wishlist.length > 0 && (
                      <span className="mobile-shortcut-badge">{wishlist.length}</span>
                    )}
                  </div>
                  <span className="mobile-shortcut-title">Wishlist</span>
                </button>

                {/* Bag Shortcut */}
                <button
                  type="button"
                  className="mobile-shortcut-btn"
                  onClick={handleCartClick}
                  aria-label={`View Shopping Bag (${itemCount} items)`}
                >
                  <div className="mobile-shortcut-icon-box">
                    <ShoppingBag size={19} className="mobile-shortcut-icon" />
                    {itemCount > 0 && (
                      <span className="mobile-shortcut-badge">{itemCount}</span>
                    )}
                  </div>
                  <span className="mobile-shortcut-title">Bag</span>
                </button>
              </div>
            </div>
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  );
}
