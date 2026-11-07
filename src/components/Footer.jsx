import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { MapPin, Mail, Phone, ArrowUp, ChevronDown, MessageCircle } from 'lucide-react';
import PSPerfumesLogo from './common/PSPerfumesLogo';
import { SITE_CONFIG } from '../config/siteConfig';
import { getStorefrontSettings } from '../services/settings';
import { useStorefrontCategories, withComboLink } from '../utils/useStorefrontCategories';
import './Footer.css';

const MOBILE_QUERY = '(max-width: 640px)';

function InstagramIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
    </svg>
  );
}

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && Boolean(window.matchMedia?.(MOBILE_QUERY).matches)
  );
  useEffect(() => {
    const mq = window.matchMedia?.(MOBILE_QUERY);
    if (!mq) return undefined;
    const onChange = (e) => setIsMobile(e.matches);
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);
  return isMobile;
}

/** A link group: a plain column on desktop, a collapsible group on phones. */
function FooterGroup({ id, title, isMobile, children }) {
  if (!isMobile) {
    return (
      <nav className="ps-footer-group" aria-labelledby={`ps-footer-${id}`}>
        <h3 id={`ps-footer-${id}`} className="ps-footer-heading">{title}</h3>
        {children}
      </nav>
    );
  }
  return (
    <details className="ps-footer-group ps-footer-collapsible">
      <summary className="ps-footer-heading">
        <span>{title}</span>
        <ChevronDown size={16} aria-hidden="true" className="ps-footer-chevron" />
      </summary>
      <nav aria-label={title}>{children}</nav>
    </details>
  );
}

const telHref = (phone) => `tel:${String(phone).replace(/[^\d+]/g, '')}`;

/** Business contact details shown in the footer. */
const BUSINESS = {
  name: 'PS Perfumes',
  address: 'Habeebullah St, beside Friends Gym, Ganagapeta, Kadapa, Andhra Pradesh 516001',
  email: 'psperfumeskadapa1@gmail.com',
  phones: ['6300012223', '7386942503'],
};
const BUSINESS_DIRECTIONS_URL = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
  `${BUSINESS.name}, ${BUSINESS.address}`
)}`;
const formatPhone = (p) => `+91 ${p.slice(0, 5)} ${p.slice(5)}`;

/**
 * PS PERFUMES — compact storefront footer.
 * Business address, email and phone numbers are fixed below (BUSINESS); social links come from
 * Admin → Store Settings (store_settings), with the site configuration as fallback; category links from the shared category source.
 * Only pages that exist are linked.
 */
export default function Footer() {
  const categories = useStorefrontCategories();
  const isMobile = useIsMobile();
  const [contact, setContact] = useState({
    instagramUrl: SITE_CONFIG.instagramUrl,
    whatsappUrl: SITE_CONFIG.whatsappUrl,
  });

  useEffect(() => {
    let mounted = true;
    getStorefrontSettings()
      .then((s) => {
        if (!mounted || !s) return;
        setContact((prev) => ({
          instagramUrl: s.instagram_url || prev.instagramUrl,
          whatsappUrl: s.whatsapp_url || prev.whatsappUrl,
        }));
      })
      .catch(() => {
        // keep the built-in details
      });
    return () => {
      mounted = false;
    };
  }, []);

  const scrollToTop = () => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
  };

  return (
    <footer className="ps-public-footer ps-arabesque" aria-label="PS PERFUMES footer">
      <div className="ps-footer-inner">
        <div className="ps-footer-grid">
          {/* Brand */}
          <div className="ps-footer-brand">
            <Link to="/" aria-label="PS PERFUMES home" className="ps-footer-logo">
              <PSPerfumesLogo size="sm" variant="footer" tone="dark" />
            </Link>
            <p className="ps-footer-tagline">Attars, perfumes and bakhoor from Kadapa.</p>
            <div className="ps-footer-social">
              {contact.instagramUrl && (
                <a href={contact.instagramUrl} target="_blank" rel="noopener noreferrer" className="ps-footer-pill" aria-label="Instagram (opens in a new tab)">
                  <InstagramIcon size={15} />
                  <span>Instagram</span>
                </a>
              )}
              {contact.whatsappUrl && (
                <a href={contact.whatsappUrl} target="_blank" rel="noopener noreferrer" className="ps-footer-pill" aria-label="WhatsApp (opens in a new tab)">
                  <MessageCircle size={15} aria-hidden="true" />
                  <span>WhatsApp</span>
                </a>
              )}
            </div>
          </div>

          <FooterGroup id="shop" title="Shop" isMobile={isMobile}>
            <ul className="ps-footer-links">
              <li><Link to="/">Home</Link></li>
              <li><Link to="/about">About Us</Link></li>
              <li><Link to="/shop">Products</Link></li>
              <li><Link to="/contact">Contact</Link></li>
              <li><Link to="/track-order">Track Order</Link></li>
            </ul>
          </FooterGroup>

          <FooterGroup id="collections" title="Collections" isMobile={isMobile}>
            <ul className="ps-footer-links ps-footer-links-cols">
              {categories.map((c) => (
                <li key={c.slug}>
                  <Link to={c.path}>{c.name}</Link>
                </li>
              ))}
              {withComboLink(categories).map((link) => (
                <li key={link.path}>
                  <Link to={link.path}>{link.name}</Link>
                </li>
              ))}
            </ul>
          </FooterGroup>

          {/* Contact: always visible (also on phones) */}
          <div className="ps-footer-group ps-footer-contact">
            <h3 className="ps-footer-heading">Contact</h3>
            <ul className="ps-footer-contact-list">
              <li>
                <MapPin size={15} aria-hidden="true" />
                <a
                  href={BUSINESS_DIRECTIONS_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Get directions to ${BUSINESS.name}: ${BUSINESS.address} (opens Google Maps in a new tab)`}
                >
                  <strong className="ps-footer-contact-name">{BUSINESS.name}</strong>
                  {BUSINESS.address}
                </a>
              </li>
              <li>
                <Mail size={15} aria-hidden="true" />
                <a href={`mailto:${BUSINESS.email}`}>{BUSINESS.email}</a>
              </li>
              <li>
                <Phone size={15} aria-hidden="true" />
                <span className="ps-footer-phones">
                  {BUSINESS.phones.map((p) => (
                    <a key={p} href={telHref(`+91${p}`)} aria-label={`Call ${formatPhone(p)}`}>
                      {formatPhone(p)}
                    </a>
                  ))}
                </span>
              </li>
            </ul>
          </div>
        </div>

        <div className="ps-footer-bottom">
          <div className="ps-footer-legal">
            <p className="ps-footer-copyright">© {new Date().getFullYear()} PS PERFUMES. All rights reserved.</p>
            <p className="ps-footer-credit">
              Designed &amp; Developed by{' '}
              <a href="https://www.brandnix.in/" target="_blank" rel="noopener noreferrer" aria-label="Brandnix (opens in a new tab)">
                Brandnix
              </a>
            </p>
          </div>
          <button type="button" onClick={scrollToTop} className="ps-footer-top-btn" aria-label="Back to top">
            <span>Back to top</span>
            <ArrowUp size={13} strokeWidth={2} aria-hidden="true" />
          </button>
        </div>
      </div>
    </footer>
  );
}
