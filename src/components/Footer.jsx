import React from 'react';
import brandLogo from '../assets/ps-perfumes-logo.webp';
import { useCart } from '../context/CartContext';
import { Phone, Mail, MapPin, MessageCircle, ShieldCheck } from 'lucide-react';
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

function FacebookIcon({ size = 17, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
    </svg>
  );
}

function YoutubeIcon({ size = 17, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2.5 17a24.12 24.12 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.56 49.56 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.12 24.12 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.55 49.55 0 0 1-16.2 0A2 2 0 0 1 2.5 17" />
      <polygon points="10 15 15 12 10 9 10 15" fill={color} />
    </svg>
  );
}

export default function Footer() {
  const { setSelectedCategory } = useCart();

  const handleNavCategory = (cat) => {
    setSelectedCategory(cat);
    const target = document.getElementById('catalog-grid');
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <footer className="ps-footer" aria-label="PS Perfumes Footer">
      <div className="ps-footer-top-gold-bar" />

      <div className="ps-footer-container">
        <div className="ps-footer-grid">
          {/* Column 1: Brand Info */}
          <div className="ps-footer-col ps-footer-brand-col">
            <div className="ps-footer-logo-wrapper">
              <img
                src={brandLogo}
                alt="PS PERFUMES"
                className="ps-footer-logo"
                width="190"
                height="65"
              />
            </div>
            <p className="ps-footer-brand-desc">
              Haute Parfumerie & Artisanal Extractions. Pure aged oud, rare botanical attars, and luxury extrait formulations created for royalty and connoisseurs.
            </p>

            <div className="ps-footer-contact-items">
              <div className="ps-footer-contact-row">
                <MapPin size={16} color="#c5a059" className="ps-footer-contact-icon" />
                <span>The Atelier Flagship, 44 Royal Avenue, Suite 10, Luxury Arcade</span>
              </div>
              <div className="ps-footer-contact-row">
                <Phone size={16} color="#c5a059" className="ps-footer-contact-icon" />
                <span>Concierge: +91 98765 43210 / +1 (800) 456-7890</span>
              </div>
              <div className="ps-footer-contact-row">
                <Mail size={16} color="#c5a059" className="ps-footer-contact-icon" />
                <span>concierge@psperfumes.com</span>
              </div>
            </div>

            <div className="ps-footer-socials">
              <a
                href="https://www.instagram.com/ps_perfumes_kadapa/?hl=en"
                target="_blank"
                rel="noopener noreferrer"
                className="ps-social-link"
                aria-label="Instagram @ps_perfumes_kadapa"
                title="Follow @ps_perfumes_kadapa on Instagram"
              >
                <InstagramIcon size={17} />
              </a>
              <a href="#facebook" className="ps-social-link" aria-label="Facebook">
                <FacebookIcon size={17} />
              </a>
              <a href="#youtube" className="ps-social-link" aria-label="YouTube">
                <YoutubeIcon size={17} />
              </a>
              <a
                href="https://api.whatsapp.com/send?phone=919876543210&text=Hello%20PS%20Perfumes"
                target="_blank"
                rel="noopener noreferrer"
                className="ps-social-link"
                aria-label="WhatsApp Concierge"
              >
                <MessageCircle size={17} />
              </a>
            </div>
          </div>

          {/* Column 2: Fragrance Collections */}
          <div className="ps-footer-col">
            <h4 className="ps-footer-heading">Collections</h4>
            <ul className="ps-footer-links">
              <li>
                <button
                  type="button"
                  onClick={() => {
                    const el = document.getElementById('combo-pack');
                    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }}
                  style={{ color: '#c5a059', fontWeight: 700 }}
                >
                  Combo Pack (Save Up to 47%)
                </button>
              </li>
              <li>
                <button type="button" onClick={() => handleNavCategory('Best Sellers')}>
                  Best Sellers
                </button>
              </li>
              <li>
                <button type="button" onClick={() => handleNavCategory('Perfume')}>
                  Extrait de Parfum
                </button>
              </li>
              <li>
                <button type="button" onClick={() => handleNavCategory('Attar')}>
                  Artisanal Attars
                </button>
              </li>
              <li>
                <button type="button" onClick={() => handleNavCategory('Oud')}>
                  Aged Cambodian Oud
                </button>
              </li>
              <li>
                <button type="button" onClick={() => handleNavCategory('Bakhoor')}>
                  Pure Incense & Bakhoor
                </button>
              </li>
              <li>
                <button type="button" onClick={() => handleNavCategory('Gift Sets')}>
                  Discovery Coffrets
                </button>
              </li>
            </ul>
          </div>

          {/* Column 3: The Atelier */}
          <div className="ps-footer-col">
            <h4 className="ps-footer-heading">The Atelier</h4>
            <ul className="ps-footer-links">
              <li>
                <a href="#about">Heritage & Legacy</a>
              </li>
              <li>
                <a href="#distillation">Hydro-Distillation Process</a>
              </li>
              <li>
                <a href="#scent-pyramid">Scent Pyramid Guide</a>
              </li>
              <li>
                <a href="#fragrance-care">Flacon Care & Storage</a>
              </li>
              <li>
                <a href="#bespoke">Bespoke Bridal Formulations</a>
              </li>
              <li>
                <a href="#press">Editorial Press & Honors</a>
              </li>
            </ul>
          </div>

          {/* Column 4: Client Services */}
          <div className="ps-footer-col">
            <h4 className="ps-footer-heading">Client Services</h4>
            <ul className="ps-footer-links">
              <li>
                <a href="#track-order">Track Your Consignment</a>
              </li>
              <li>
                <a href="#complimentary-shipping">Complimentary Shipping Policy</a>
              </li>
              <li>
                <a href="#returns">Exchange & Flacon Guarantee</a>
              </li>
              <li>
                <a href="#faq">Frequently Asked Questions</a>
              </li>
              <li>
                <a href="#concierge">Virtual Scent Consultation</a>
              </li>
              <li>
                <a href="#corporate">Corporate Gifting Coffrets</a>
              </li>
            </ul>
          </div>

          {/* Column 5: Authenticity & Trust */}
          <div className="ps-footer-col">
            <h4 className="ps-footer-heading">Atelier Seal</h4>
            <p className="ps-footer-seal-text">
              Every PS PERFUMES flacon is certified with a tamper-evident holographic serial seal and hand-signed extraction badge.
            </p>
            <div className="ps-footer-seal-box">
              <ShieldCheck size={28} color="#c5a059" />
              <div>
                <strong>100% Guaranteed</strong>
                <span>Direct From Distiller</span>
              </div>
            </div>
            <div className="ps-footer-hours">
              <strong>Boutique Concierge Hours:</strong>
              <span>Mon – Sat: 9:00 AM – 9:00 PM EST</span>
              <span>Sunday: 11:00 AM – 6:00 PM EST</span>
            </div>
          </div>
        </div>

        {/* Footer Bottom Bar */}
        <div className="ps-footer-bottom">
          <div className="ps-footer-copy">
            © {new Date().getFullYear()} PS PERFUMES. All Rights Reserved. Crafted with reverence for high oriental perfumery.
          </div>

          <div className="ps-footer-payments">
            <span className="ps-payment-pill">VISA</span>
            <span className="ps-payment-pill">MASTERCARD</span>
            <span className="ps-payment-pill">AMEX</span>
            <span className="ps-payment-pill">APPLE PAY</span>
            <span className="ps-payment-pill">GOOGLE PAY</span>
            <span className="ps-payment-pill">UPI</span>
            <span className="ps-payment-pill">CASH ON DELIVERY</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
