import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Search, ShoppingBag, MapPin, User, Menu } from 'lucide-react';
import PSPerfumesLogo from './common/PSPerfumesLogo';
import MobileNav from './MobileNav';
const SearchModal = React.lazy(() => import('./SearchModal'));
import { useCart } from '../context/CartContext';
import './Header.css';

const NAV_ITEMS = [
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
    navigate(path);
  };

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
              {NAV_ITEMS.map((item) => {
                const isExact = location.pathname === item.path;
                const isCategoryMatch =
                  item.path !== '/' &&
                  item.path !== '/about' &&
                  (location.pathname === `/category${item.path}` ||
                   location.pathname === item.path);
                const isActive = isExact || isCategoryMatch;
                return (
                  <li key={item.name} className="ps-nav-menu-item">
                    <button
                      type="button"
                      className={`ps-nav-menu-link ${isActive ? 'is-active' : ''}`}
                      onClick={() => handleNavClick(item.path, item.name)}
                    >
                      <span className="ps-nav-text">{item.name}</span>
                    </button>
                  </li>
                );
              })}
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
