import React, { useState } from 'react';
import { Search, ShoppingBag, ChevronDown, Menu } from 'lucide-react';
import brandLogo from '../assets/ps-perfumes-logo.png';
import MobileNav from './MobileNav';
import SearchModal from './SearchModal';
import './Header.css';

// Exact navigation items from the reference image
const NAV_ITEMS = [
  { name: 'Home', href: '#home', hasDropdown: false },
  { name: 'About Us', href: '#about', hasDropdown: true },
  { name: 'Attar', href: '#attar', hasDropdown: false },
  { name: 'Perfume', href: '#perfume', hasDropdown: false },
  { name: 'Bakhoor', href: '#bakhoor', hasDropdown: false },
  { name: 'Musky', href: '#musky', hasDropdown: false },
  { name: 'Oud', href: '#oud', hasDropdown: false },
  { name: 'Floral', href: '#floral', hasDropdown: false },
  { name: 'Woody', href: '#woody', hasDropdown: false },
  { name: 'Shop All', href: '#shop-all', hasDropdown: true },
];

// Delivery Truck icon with location pin in gold matching the reference
function DeliveryTruckIcon({ size = 22, color = '#c5a059' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="ps-util-svg"
      aria-label="Delivery"
    >
      <path d="M1 3h13v13H1z" />
      <path d="M14 8h4.5l3.5 4.5V16h-8V8z" />
      <circle cx="5.5" cy="18.5" r="2.5" />
      <circle cx="17.5" cy="18.5" r="2.5" />
      <circle cx="7.5" cy="8.5" r="1.8" fill={color} />
      <path d="M7.5 10.3v2" />
    </svg>
  );
}

// User Profile with Express Lightning badge matching the reference
function ExpressUserIcon({ size = 22 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className="ps-util-svg"
      aria-label="Express Account"
    >
      {/* User profile silhouette in white */}
      <path
        d="M15 20v-2a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 3 18v2"
        stroke="#ffffff"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx="9"
        cy="7.5"
        r="3.5"
        stroke="#ffffff"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Lightning bolt accent in warm gold / amber */}
      <path
        d="M19 1.5l-4.5 7h3.8l-2.8 7 6.5-8.5h-3.8l2.8-5.5z"
        fill="#f59e0b"
        stroke="#d97706"
        strokeWidth="0.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function Header() {
  const [activeItem, setActiveItem] = useState('Home');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  return (
    <>
      <header className="ps-header-container">
        {/* ==========================================================
            SECTION 1 — BLACK TOP BAR
            ========================================================== */}
        <div className="ps-top-bar">
          <div className="ps-top-bar-inner">
            {/* Desktop Left balance (empty spacer to ensure exact center logo) */}
            <div className="ps-top-bar-spacer" />

            {/* Mobile Hamburger Toggle */}
            <button
              type="button"
              className="ps-mobile-toggle-btn"
              onClick={() => setIsMobileMenuOpen(true)}
              aria-label="Open Navigation Menu"
            >
              <Menu size={24} color="#ffffff" />
            </button>

            {/* Center: Authentic PS PERFUMES Logo */}
            <div className="ps-top-bar-center">
              <a href="#home" className="ps-brand-anchor" aria-label="PS PERFUMES Home">
                <img
                  src={brandLogo}
                  alt="PS PERFUMES"
                  className="ps-brand-img"
                  width="180"
                  height="82"
                />
              </a>
            </div>

            {/* Right: Exact Reference Utility Icons */}
            <div className="ps-top-bar-right">
              {/* Search Icon */}
              <button
                type="button"
                className="ps-icon-link ps-search-btn"
                onClick={() => setIsSearchOpen(true)}
                aria-label="Search Fragrances"
              >
                <Search size={21} color="#ffffff" strokeWidth={1.8} />
              </button>

              {/* Utility Icons Group (Delivery, Express, Shopping Bag) */}
              <div className="ps-util-group">
                <button
                  type="button"
                  className="ps-icon-link"
                  aria-label="Delivery Tracking"
                  onClick={() => {}}
                >
                  <DeliveryTruckIcon size={22} color="#c5a059" />
                </button>

                <button
                  type="button"
                  className="ps-icon-link"
                  aria-label="Express Account"
                  onClick={() => {}}
                >
                  <ExpressUserIcon size={22} />
                </button>

                <button
                  type="button"
                  className="ps-icon-link"
                  aria-label="Shopping Bag"
                  onClick={() => {}}
                >
                  <ShoppingBag size={21} color="#ffffff" strokeWidth={1.8} />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ==========================================================
            SECTION 2 — WHITE NAVIGATION BAR
            ========================================================== */}
        <nav className="ps-nav-bar" aria-label="Main Navigation">
          <div className="ps-nav-bar-inner">
            {/* Centered Navigation Links */}
            <ul className="ps-nav-menu">
              {NAV_ITEMS.map((item) => {
                const isActive = activeItem === item.name;
                return (
                  <li key={item.name} className="ps-nav-menu-item">
                    <a
                      href={item.href}
                      className={`ps-nav-menu-link ${isActive ? 'is-active' : ''}`}
                      onClick={(e) => {
                        e.preventDefault();
                        setActiveItem(item.name);
                      }}
                    >
                      <span className="ps-nav-text">{item.name}</span>
                      {item.hasDropdown && (
                        <ChevronDown size={14} strokeWidth={2.4} className="ps-dropdown-chevron" />
                      )}
                    </a>
                  </li>
                );
              })}
            </ul>

            {/* Red NEW ARRIVAL Badge at far right */}
            <div className="ps-nav-badge-wrapper">
              <a href="#new-arrivals" className="ps-new-arrival-badge">
                NEW ARRIVAL
              </a>
            </div>
          </div>
        </nav>
      </header>

      {/* Interactive Search Modal */}
      <SearchModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
      />

      {/* Mobile Navigation Drawer */}
      <MobileNav
        isOpen={isMobileMenuOpen}
        onClose={() => setIsMobileMenuOpen(false)}
        navLinks={NAV_ITEMS}
        activeLink={activeItem}
        onSelectLink={(name) => setActiveItem(name)}
        onOpenSearch={() => setIsSearchOpen(true)}
      />
    </>
  );
}
