import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { MapPin, Mail, Phone, ArrowUp, ChevronDown, MessageCircle } from 'lucide-react';
import PSPerfumesLogo from './common/PSPerfumesLogo';
import { SITE_CONFIG } from '../config/siteConfig';
import { getStorefrontSettings } from '../services/settings';
import { useStorefrontCategories } from '../utils/useStorefrontCategories';
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

/**
 * PS PERFUMES — compact storefront footer.
 * Contact details and social links come from Admin → Store Settings (store_settings), with the
 * existing site configuration as fallback; category links from the shared category source.
 * Only pages that exist are linked.
 */
export default function Footer() {
  const categories = useStorefrontCategories();
  const isMobile = useIsMobile();
  const [contact, setContact] = useState({
    address: SITE_CONFIG.address,
    phone: SITE_CONFIG.phone,
    email: SITE_CONFIG.contactEmail,
    instagramUrl: SITE_CONFIG.instagramUrl,
    whatsappUrl: SITE_CONFIG.whatsappUrl,
    mapsUrl: SITE_CONFIG.googleMapsUrl,
  });

  useEffect(() => {
    let mounted = true;
    getStorefrontSettings()
      .then((s) => {
        if (!mounted || !s) return;
        setContact((prev) => ({
          address: s.address || prev.address,
          phone: s.phone || prev.phone,
          email: s.contact_email || prev.email,
          instagramUrl: s.instagram_url || prev.instagramUrl,
          whatsappUrl: s.whatsapp_url || prev.whatsappUrl,
          mapsUrl: s.google_maps_url || prev.mapsUrl,
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
    <footer className="ps-public-footer" aria-label="PS PERFUMES footer">
      <div className="ps-footer-inner">
        <div className="ps-footer-grid">
          {/* Brand */}
          <div className="ps-footer-brand">
            <Link to="/" aria-label="PS PERFUMES home" className="ps-footer-logo">
              <PSPerfumesLogo size="sm" variant="footer" />
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
            </ul>
          </FooterGroup>

          {/* Contact: always visible (also on phones) */}
          <div className="ps-footer-group ps-footer-contact">
            <h3 className="ps-footer-heading">Contact</h3>
            <ul className="ps-footer-contact-list">
              {contact.address && (
                <li>
                  <MapPin size={15} aria-hidden="true" />
                  {contact.mapsUrl ? (
                    <a href={contact.mapsUrl} target="_blank" rel="noopener noreferrer">{contact.address}</a>
                  ) : (
                    <span>{contact.address}</span>
                  )}
                </li>
              )}
              {contact.phone && (
                <li>
                  <Phone size={15} aria-hidden="true" />
                  <a href={telHref(contact.phone)}>{contact.phone}</a>
                </li>
              )}
              {contact.email && (
                <li>
                  <Mail size={15} aria-hidden="true" />
                  <a href={`mailto:${contact.email}`}>{contact.email}</a>
                </li>
              )}
            </ul>
          </div>
        </div>

        <div className="ps-footer-bottom">
          <p className="ps-footer-copyright">© {new Date().getFullYear()} PS PERFUMES. All rights reserved.</p>
          <button type="button" onClick={scrollToTop} className="ps-footer-top-btn" aria-label="Back to top">
            <span>Back to top</span>
            <ArrowUp size={13} strokeWidth={2} aria-hidden="true" />
          </button>
        </div>
      </div>
    </footer>
  );
}
