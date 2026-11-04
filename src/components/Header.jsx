import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Search, ShoppingBag, MapPin, User, Menu, Heart, ChevronDown } from 'lucide-react';
import PSPerfumesLogo from './common/PSPerfumesLogo';
const SearchModal = React.lazy(() => import('./SearchModal'));
import { useCart } from '../context/CartContext';
import { useStorefrontCategories, withComboLink } from '../utils/useStorefrontCategories';
import { whenIdleAfterLoad } from '../utils/idlePrefetch';
import './Header.css';

// The mobile menu (with its animation library) is not needed for the first render: it is
// fetched in the background once the page is idle, or as soon as the menu button is touched
const loadMobileNav = () => import('./MobileNav');
const MobileNav = React.lazy(loadMobileNav);

const FIXED_NAV_ITEMS = [
  { name: 'Home', path: '/' },
  { name: 'About Us', path: '/about' },
];
// Categories shown inline in the desktop bar; any further ones go under "More"
const MAX_INLINE_CATEGORIES = 7;

export default function Header() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  // The menu is mounted from its first opening on (it stays mounted so closing animates)
  const [hasOpenedMobileMenu, setHasOpenedMobileMenu] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  useEffect(() => {
    whenIdleAfterLoad(() => {
      loadMobileNav().catch(() => {});
    });
  }, []);

  const openMobileMenu = () => {
    setHasOpenedMobileMenu(true);
    setIsMobileMenuOpen(true);
  };
  const [isScrolled, setIsScrolled] = useState(false);

  const { itemCount, wishlist, setIsCartOpen } = useCart();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Collection pages filter by their URL, so the shared category filter is not set here (it
  // would also narrow the homepage product sections)
  const handleNavClick = (path) => {
    setIsMoreOpen(false);
    navigate(path);
  };

  // Every active main category from the shared, data-driven source (database only), then the
  // combo sets link unless a category already covers combos
  const categories = useStorefrontCategories();
  const inlineCategories = categories.slice(0, MAX_INLINE_CATEGORIES);
  const moreCategories = categories.slice(MAX_INLINE_CATEGORIES);
  const navItems = [
    ...FIXED_NAV_ITEMS,
    ...inlineCategories.map((c) => ({ name: c.name, path: c.path, children: c.children || [] })),
    ...withComboLink(categories),
  ];
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
            LEVEL 1 — IVORY TOP BAR
            ========================================================== */}
        <div className="ps-top-bar">
          <div className="ps-top-bar-inner">
            {/* Mobile Hamburger Toggle (Left on mobile) */}
            <button
              type="button"
              className="ps-mobile-toggle-btn"
              onPointerDown={() => loadMobileNav().catch(() => {})}
              onClick={openMobileMenu}
              aria-expanded={isMobileMenuOpen}
              aria-haspopup="dialog"
              aria-label="Open Navigation Menu"
            >
              <Menu size={24} />
            </button>

            {/* Center: Vector SVG PS PERFUMES Logo (Zero Rectangular Box) */}
            <div className="ps-top-bar-center">
              <Link
                to="/"
                className="ps-brand-anchor"
                aria-label="PS PERFUMES Home"
              >
                <PSPerfumesLogo size="md" variant="header" tone="dark" priority />
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
                <Search size={21} strokeWidth={1.8} />
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
                <User size={21} strokeWidth={1.8} />
              </Link>

              {/* Wishlist: saved products and their count */}
              <Link
                to="/wishlist"
                className="ps-icon-link ps-cart-btn ps-wishlist-link"
                aria-label={`Wishlist (${wishlist.length} saved)`}
                title="Wishlist"
              >
                <Heart size={21} strokeWidth={1.8} />
                {wishlist.length > 0 && (
                  <span className="ps-cart-badge ps-wishlist-badge" key={wishlist.length}>
                    {wishlist.length}
                  </span>
                )}
              </Link>

              {/* Shopping Bag Button */}
              <button
                type="button"
                className="ps-icon-link ps-cart-btn"
                aria-label={`Shopping Bag (${itemCount} items)`}
                onClick={() => setIsCartOpen(true)}
              >
                <ShoppingBag size={21} strokeWidth={1.8} />
                {itemCount > 0 && (
                  <span className="ps-cart-badge">{itemCount}</span>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* ==========================================================
            LEVEL 2 — CHAMPAGNE NAVIGATION BAR
            ========================================================== */}
        <nav className="ps-nav-bar" aria-label="Main Navigation">
          <div className="ps-nav-bar-inner">
            {/* Centered Navigation Links */}
            <ul className="ps-nav-menu">
              {navItems.map((item) => {
                const isActive =
                  isPathActive(item.path) ||
                  (item.path !== '/' && item.path !== '/about' && location.pathname === `/category${item.path}`);
                const hasChildren = item.children?.length > 0;
                return (
                  <li key={item.path} className={`ps-nav-menu-item${hasChildren ? ' has-children' : ''}`}>
                    <button
                      type="button"
                      className={`ps-nav-menu-link ${isActive ? 'is-active' : ''}`}
                      onClick={() => handleNavClick(item.path, item.name)}
                      aria-current={isActive ? 'page' : undefined}
                    >
                      <span className="ps-nav-text">{item.name}</span>
                      {hasChildren && <ChevronDown size={13} className="ps-nav-caret" aria-hidden="true" />}
                    </button>
                    {/* Subcategories from the database: open on hover or keyboard focus (CSS only) */}
                    {hasChildren && (
                      <ul className="ps-nav-sub-menu" aria-label={`${item.name} subcategories`}>
                        <li>
                          <Link to={item.path} className="ps-nav-sub-link is-all">
                            All {item.name}
                          </Link>
                        </li>
                        {item.children.map((c) => (
                          <li key={c.slug}>
                            <Link to={c.path} className="ps-nav-sub-link">
                              {c.name}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    )}
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
      {hasOpenedMobileMenu && (
        <React.Suspense fallback={null}>
          <MobileNav
            isOpen={isMobileMenuOpen}
            onClose={() => setIsMobileMenuOpen(false)}
            activeLink={location.pathname}
            onSelectLink={(target) => {
              setIsMobileMenuOpen(false);
              // Collection pages filter by their URL; the shared category filter is not set
              // (it would also narrow the homepage product sections)
              if (target.startsWith('/')) {
                navigate(target);
              } else if (target === 'Home') {
                navigate('/');
              } else if (target === 'About Us') {
                navigate('/about');
              }
            }}
            onOpenSearch={() => {
              setIsMobileMenuOpen(false);
              setIsSearchOpen(true);
            }}
          />
        </React.Suspense>
      )}
    </>
  );
}
