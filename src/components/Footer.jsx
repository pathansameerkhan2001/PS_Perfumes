import React from 'react';
import { Link } from 'react-router-dom';
import PSPerfumesLogo from './common/PSPerfumesLogo';
import { MapPin, Mail, ExternalLink, ShieldCheck } from 'lucide-react';
import './Footer.css';

function InstagramIcon({ size = 17, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
    </svg>
  );
}

export default function Footer() {
  return (
    <footer className="ps-footer" aria-label="PS PERFUMES Footer">
      <div className="ps-footer-top-gold-bar" />

      <div className="ps-footer-container">
        <div className="ps-footer-grid">
          {/* Column 1: Brand Summary */}
          <div className="ps-footer-col ps-footer-brand-col">
            <div className="ps-footer-logo-wrapper">
              <Link to="/">
                <PSPerfumesLogo size="md" variant="footer" />
              </Link>
            </div>
            <p className="ps-footer-brand-desc">
              Haute Parfumerie & Artisanal Fragrances. Pure aged oud, rare botanical attars, bakhoor, and luxury extrait formulations distilled for enduring royal elegance.
            </p>
            <div className="ps-footer-socials">
              <a
                href="https://www.instagram.com/ps_perfumes_kadapa/?hl=en"
                target="_blank"
                rel="noopener noreferrer"
                className="ps-social-link"
                aria-label="Instagram @ps_perfumes_kadapa"
                title="Follow @ps_perfumes_kadapa on Instagram"
              >
                <InstagramIcon size={18} />
              </a>
              <a
                href="https://share.google/b0yildKJKTaGc365J"
                target="_blank"
                rel="noopener noreferrer"
                className="ps-social-link"
                aria-label="Google Maps Location"
                title="View Store on Google Maps"
              >
                <ExternalLink size={18} />
              </a>
            </div>
          </div>

          {/* Column 2: Shop */}
          <div className="ps-footer-col">
            <h4 className="ps-footer-heading">Shop</h4>
            <ul className="ps-footer-links">
              <li><Link to="/attar">Attar</Link></li>
              <li><Link to="/perfume">Perfume</Link></li>
              <li><Link to="/bakhoor">Bakhoor</Link></li>
              <li><Link to="/musky">Musky</Link></li>
              <li><Link to="/oud">Oud</Link></li>
              <li><Link to="/floral">Floral</Link></li>
              <li><Link to="/woody">Woody</Link></li>
              <li><Link to="/shop">Shop All</Link></li>
            </ul>
          </div>

          {/* Column 3: About */}
          <div className="ps-footer-col">
            <h4 className="ps-footer-heading">About</h4>
            <ul className="ps-footer-links">
              <li><Link to="/about">Our Story & Heritage</Link></li>
              <li><Link to="/about#craftsmanship">Art of Distillation</Link></li>
              <li><Link to="/about#kadapa">Kadapa Atelier</Link></li>
              <li><Link to="/instagram">Instagram Reels</Link></li>
              <li><Link to="/admin/login">Admin Portal</Link></li>
            </ul>
          </div>

          {/* Column 4: Customer Care */}
          <div className="ps-footer-col">
            <h4 className="ps-footer-heading">Customer Care</h4>
            <ul className="ps-footer-links">
              <li><Link to="/contact">Shipping Policy</Link></li>
              <li><Link to="/contact">Returns & Exchanges</Link></li>
              <li><Link to="/contact">Privacy Policy</Link></li>
              <li><Link to="/contact">Terms & Conditions</Link></li>
              <li><Link to="/contact">FAQ</Link></li>
              <li><Link to="/contact">Contact Us</Link></li>
            </ul>
          </div>

          {/* Column 5: Contact */}
          <div className="ps-footer-col">
            <h4 className="ps-footer-heading">Contact</h4>
            <div className="ps-footer-contact-items">
              <div className="ps-footer-contact-row">
                <MapPin size={16} color="#c8a45d" className="ps-footer-contact-icon" />
                <span>
                  <strong>PS PERFUMES</strong><br />
                  Kadapa, Andhra Pradesh – 516001, India
                </span>
              </div>
              <div className="ps-footer-contact-row">
                <Mail size={16} color="#c8a45d" className="ps-footer-contact-icon" />
                <a href="mailto:brandnix.in@gmail.com" className="ps-contact-link">
                  brandnix.in@gmail.com
                </a>
              </div>
              <div className="ps-footer-contact-row">
                <ExternalLink size={16} color="#c8a45d" className="ps-footer-contact-icon" />
                <a
                  href="https://share.google/b0yildKJKTaGc365J"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ps-contact-link"
                >
                  Locate on Google Maps
                </a>
              </div>
              <div className="ps-footer-contact-row">
                <InstagramIcon size={16} color="#c8a45d" />
                <a
                  href="https://www.instagram.com/ps_perfumes_kadapa/?hl=en"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ps-contact-link"
                >
                  @ps_perfumes_kadapa
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Bar: Copyright & Kadapa note */}
        <div className="ps-footer-bottom">
          <p className="ps-footer-copy">
            © {new Date().getFullYear()} <strong>PS PERFUMES</strong>. All Rights Reserved. Crafted with pride in Kadapa, Andhra Pradesh.
          </p>
          <div className="ps-footer-trust-badge">
            <ShieldCheck size={14} color="#c8a45d" />
            <span>100% Authentic Artisanal Perfumes & Attars</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
