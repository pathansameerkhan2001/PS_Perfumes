import React from 'react';
import { Link } from 'react-router-dom';
import PSPerfumesLogo from './common/PSPerfumesLogo';
import { MapPin, Mail, Phone, ArrowUp } from 'lucide-react';
import { SITE_CONFIG } from '../config/siteConfig';
import './Footer.css';

function InstagramIcon({ size = 16, color = 'currentColor' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
    </svg>
  );
}

/**
 * PS PERFUMES — Premium Public Storefront Footer
 * Strictly for public pages; excluded from administrative routes.
 * 4-column balanced luxury layout on desktop; clean stacked layout on mobile.
 */
export default function Footer() {
  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const currentYear = new Date().getFullYear();

  return (
    <footer className="ps-public-footer" aria-label="PS PERFUMES Storefront Footer">
      {/* Top Hairline Gold Accent Ribbon */}
      <div className="ps-footer-top-gold-bar" />

      <div className="ps-footer-main-container">
        <div className="ps-footer-four-col-grid">
          {/* ==============================================================
              COLUMN 1 — BRAND
              ============================================================== */}
          <div className="ps-footer-column ps-footer-brand-column">
            <div className="ps-footer-logo-wrap">
              <Link to="/" aria-label="PS PERFUMES Home">
                <PSPerfumesLogo size="md" variant="footer" />
              </Link>
            </div>
            <p className="ps-footer-brand-description">
              Artisanal Haute Parfumerie crafting Arabian-inspired scents, rare botanical attars,
              and pure aged oud formulations distilled for enduring luxury and regal elegance.
            </p>
            <div className="ps-footer-social-links">
              <a
                href={SITE_CONFIG.instagramUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="ps-footer-social-pill"
                aria-label="Official Instagram @ps_perfumes_kadapa"
                title="Follow @ps_perfumes_kadapa on Instagram"
              >
                <InstagramIcon size={16} color="#C9A96E" />
                <span>Instagram</span>
              </a>
            </div>
          </div>

          {/* ==============================================================
              COLUMN 2 — EXPLORE (No Shop All)
              ============================================================== */}
          <div className="ps-footer-column">
            <h3 className="ps-footer-col-heading">Explore</h3>
            <ul className="ps-footer-link-list">
              <li>
                <Link to="/">Home</Link>
              </li>
              <li>
                <Link to="/about">About Us</Link>
              </li>
              <li>
                <Link to="/attar">Attar</Link>
              </li>
              <li>
                <Link to="/perfume">Perfume</Link>
              </li>
              <li>
                <Link to="/bakhoor">Bakhoor</Link>
              </li>
              <li>
                <Link to="/musky">Musky</Link>
              </li>
              <li>
                <Link to="/oud">Oud</Link>
              </li>
              <li>
                <Link to="/floral">Floral</Link>
              </li>
              <li>
                <Link to="/woody">Woody</Link>
              </li>
            </ul>
          </div>

          {/* ==============================================================
              COLUMN 3 — CUSTOMER SERVICE (Only existing functional routes)
              ============================================================== */}
          <div className="ps-footer-column">
            <h3 className="ps-footer-col-heading">Customer Service</h3>
            <ul className="ps-footer-link-list">
              <li>
                <Link to="/contact">Contact Us</Link>
              </li>
              <li>
                <span className="ps-footer-unlinked-item" title="Page in development">
                  FAQs
                </span>
              </li>
              <li>
                <span className="ps-footer-unlinked-item" title="Page in development">
                  Shipping Information
                </span>
              </li>
              <li>
                <span className="ps-footer-unlinked-item" title="Page in development">
                  Returns and Refunds
                </span>
              </li>
              <li>
                <Link to="/track-order">Track Order</Link>
              </li>
            </ul>
          </div>

          {/* ==============================================================
              COLUMN 4 — CONTACT (Verified details only)
              ============================================================== */}
          <div className="ps-footer-column">
            <h3 className="ps-footer-col-heading">Contact</h3>
            <div className="ps-footer-contact-details">
              <div className="ps-footer-contact-item">
                <MapPin size={15} color="#C9A96E" className="ps-footer-icon" />
                <span className="ps-footer-text">
                  <strong>PS PERFUMES</strong>
                  <br />
                  Kadapa, 516001
                </span>
              </div>

              <div className="ps-footer-contact-item">
                <InstagramIcon size={15} color="#C9A96E" />
                <a
                  href={SITE_CONFIG.instagramUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ps-footer-link"
                >
                  @ps_perfumes_kadapa
                </a>
              </div>

              {SITE_CONFIG.contactEmail && (
                <div className="ps-footer-contact-item">
                  <Mail size={15} color="#C9A96E" className="ps-footer-icon" />
                  <a href={`mailto:${SITE_CONFIG.contactEmail}`} className="ps-footer-link">
                    {SITE_CONFIG.contactEmail}
                  </a>
                </div>
              )}

              {SITE_CONFIG.phone && (
                <div className="ps-footer-contact-item">
                  <Phone size={15} color="#C9A96E" className="ps-footer-icon" />
                  <a href={`tel:${SITE_CONFIG.phone.replace(/\s+/g, '')}`} className="ps-footer-link">
                    {SITE_CONFIG.phone}
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ==============================================================
            FOOTER BOTTOM BAR
            ============================================================== */}
        <div className="ps-footer-bottom-bar">
          <div className="ps-footer-bottom-brand-info">
            <p className="ps-footer-copyright">
              © {currentYear} <strong>PS PERFUMES</strong>. All rights reserved.
            </p>
          </div>

          <div className="ps-footer-bottom-actions">
            <button
              type="button"
              onClick={scrollToTop}
              className="ps-footer-back-to-top-btn"
              aria-label="Scroll back to top"
            >
              <span>Back to top</span>
              <ArrowUp size={13} strokeWidth={2} />
            </button>
          </div>
        </div>
      </div>
    </footer>
  );
}
