import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Search, ShoppingBag, MapPin, User, Menu } from 'lucide-react';
import PSPerfumesLogo from './common/PSPerfumesLogo';
import MobileNav from './MobileNav';
const SearchModal = React.lazy(() => import('./SearchModal'));
import { useCart } from '../context/CartContext';
import { useStorefrontCategories } from '../utils/useStorefrontCategories';
import './Header.css';

const FIXED_NAV_ITEMS = [
  { name: 'Home', path: '/' },
  { name: 'About Us', path: '/about' },
];
// Categories shown inline in the desktop bar; any further ones go under "More"
const MAX_INLINE_CATEGORIES = 7;

export default function Header() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);

  const { itemCount, setIsCartOpen, setSelectedCategory } = useCart();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleNavClick = (path, name) => {
    if (!['Home', 'About Us'].includes(name)) {
      setSelectedCategory(name);
    }
    setIsMoreOpen(false);
    navigate(path);
  };

  // Category links from the shared, data-driven source (database categories, seven built-in fallback)
  const categories = useStorefrontCategories();
  const inlineCategories = categories.slice(0, MAX_INLINE_CATEGORIES);
  const moreCategories = categories.slice(MAX_INLINE_CATEGORIES);
  const navItems = [...FIXED_NAV_ITEMS, ...inlineCategories.map((c) => ({ name: c.name, path: c.path }))];
  const isPathActive = (path) =>
    location.pathname === path || (path !== '/' && path !== '/about' && location.pathname.startsWith(`${path}/`));

  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const moreRef = useRef(null);
  useEffect(() => {
    if (!isMoreOpen) return undefined;
    const onDocClick = (e) => {
      if (moreRef.current && !moreRef.current.contains(e.target)) setIsMoreOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setIsMoreOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [isMoreOpen]);

  return (
    <>
      <header
        className={`ps-header-container ${isScrolled ? 'is-scrolled' : ''}`}
        id="ps-fixed-header"
      >
        {/* ==========================================================
            LEVEL 1 — LUXURY BLACK TOP BAR
            ========================================================== */}
        <div className="ps-top-bar">
          <div className="ps-top-bar-inner">
            {/* Mobile Hamburger Toggle (Left on mobile) */}
            <button
              type="button"
              className="ps-mobile-toggle-btn"
              onClick={() => setIsMobileMenuOpen(true)}
              aria-expanded={isMobileMenuOpen}
              aria-haspopup="dialog"
              aria-label="Open Navigation Menu"
            >
              <Menu size={24} color="#ffffff" />
            </button>

            {/* Center: Vector SVG PS PERFUMES Logo (Zero Rectangular Box) */}
            <div className="ps-top-bar-center">
              <Link
                to="/"
                className="ps-brand-anchor"
                aria-label="PS PERFUMES Home"
              >
                <PSPerfumesLogo size="md" variant="header" />
              </Link>
            </div>

            {/* Right: Search, Delivery location, Account, Cart */}
            <div className="ps-top-bar-right">
              {/* Search Button */}
              <button
                type="button"
                className="ps-icon-link ps-search-btn"
                onClick={() => setIsSearchOpen(true)}
                aria-label="Search Fragrances"
              >
                <Search size={21} color="#ffffff" strokeWidth={1.8} />
              </button>

              {/* Delivery Location Indicator */}
              <div
                className="ps-delivery-location-pill ps-util-desktop-only"
                title="Kadapa, AP (516001) • Express Pan-India Delivery"
              >
                <MapPin size={15} className="ps-pin-icon" />
                <span className="ps-delivery-text">Kadapa, 516001</span>
              </div>

              {/* Account / Admin Portal */}
              <Link
                to="/admin/login"
                className="ps-icon-link ps-util-desktop-only"
                aria-label="Account / Admin Portal"
                title="Account / Admin Portal"
              >
                <User size={21} color="#ffffff" strokeWidth={1.8} />
              </Link>

              {/* Shopping Bag Button */}
              <button
                type="button"
                className="ps-icon-link ps-cart-btn"
                aria-label={`Shopping Bag (${itemCount} items)`}
                onClick={() => setIsCartOpen(true)}
              >
                <ShoppingBag size={21} color="#ffffff" strokeWidth={1.8} />
                {itemCount > 0 && (
                  <span className="ps-cart-badge">{itemCount}</span>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* ==========================================================
            LEVEL 2 — WHITE NAVIGATION BAR
            ========================================================== */}
        <nav className="ps-nav-bar" aria-label="Main Navigation">
          <div className="ps-nav-bar-inner">
            {/* Centered Navigation Links */}
            <ul className="ps-nav-menu">
              {navItems.map((item) => {
                const isActive =
                  isPathActive(item.path) ||
                  (item.path !== '/' && item.path !== '/about' && location.pathname === `/category${item.path}`);
                return (
                  <li key={item.path} className="ps-nav-menu-item">
                    <button
                      type="button"
                      className={`ps-nav-menu-link ${isActive ? 'is-active' : ''}`}
                      onClick={() => handleNavClick(item.path, item.name)}
                      aria-current={isActive ? 'page' : undefined}
                    >
                      <span className="ps-nav-text">{item.name}</span>
                    </button>
                  </li>
                );
              })}
              {moreCategories.length > 0 && (
                <li className="ps-nav-menu-item ps-nav-more" ref={moreRef}>
                  <button
                    type="button"
                    className={`ps-nav-menu-link ${moreCategories.some((c) => isPathActive(c.path)) ? 'is-active' : ''}`}
                    aria-haspopup="true"
                    aria-expanded={isMoreOpen}
                    onClick={() => setIsMoreOpen((open) => !open)}
                  >
                    <span className="ps-nav-text">More</span>
                  </button>
                  {isMoreOpen && (
                    <ul className="ps-nav-more-menu" role="menu">
                      {moreCategories.map((c) => (
                        <li key={c.slug} role="none">
                          <button
                            type="button"
                            role="menuitem"
                            className={`ps-nav-more-link ${isPathActive(c.path) ? 'is-active' : ''}`}
                            onClick={() => handleNavClick(c.path, c.name)}
                          >
                            {c.name}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              )}
            </ul>

            {/* Red NEW ARRIVAL Badge at far right */}
            <div className="ps-nav-badge-wrapper">
              <Link
                to="/shop?filter=new_arrival"
                className="ps-new-arrival-badge"
              >
                NEW ARRIVAL
              </Link>
            </div>
          </div>
        </nav>
      </header>

      {/* Fixed Header Spacer */}
      <div className="ps-header-spacer" aria-hidden="true" />

      {/* Interactive Search Modal */}
      {isSearchOpen && (
        <React.Suspense fallback={null}>
          <SearchModal
            isOpen={isSearchOpen}
            onClose={() => setIsSearchOpen(false)}
          />
        </React.Suspense>
      )}

      {/* Mobile Navigation Drawer */}
      <MobileNav
        isOpen={isMobileMenuOpen}
        onClose={() => setIsMobileMenuOpen(false)}
        activeLink={location.pathname}
        onSelectLink={(target, name) => {
          setIsMobileMenuOpen(false);
          if (name && !['Home', 'About Us', 'New Arrival', 'Offers', 'Track Order'].includes(name)) {
            setSelectedCategory(name);
          }
          if (target.startsWith('/')) {
            navigate(target);
          } else if (target === 'Home') {
            navigate('/');
          } else if (target === 'About Us') {
            navigate('/about');
          } else {
            setSelectedCategory(target);
            navigate(`/category/${target.toLowerCase()}`);
          }
        }}
        onOpenSearch={() => {
          setIsMobileMenuOpen(false);
          setIsSearchOpen(true);
        }}
      />
    </>
  );
}
