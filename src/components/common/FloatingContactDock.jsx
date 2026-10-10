import React, { useState, useEffect } from 'react';
import { SITE_CONFIG } from '../../config/siteConfig';
import { getSiteSettings } from '../../services/settings';
import './FloatingContactDock.css';

function WhatsAppIcon({ size = 18, color = 'currentColor' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={color}
      aria-hidden="true"
      className="ps-contact-svg"
    >
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91C2.13 13.66 2.59 15.36 3.45 16.86L2.05 22L7.3 20.63C8.75 21.41 10.38 21.83 12.04 21.83C17.5 21.83 21.95 17.38 21.95 11.92C21.95 9.27 20.92 6.78 19.05 4.91C17.18 3.03 14.69 2 12.04 2ZM12.04 3.67C14.25 3.67 16.31 4.53 17.87 6.09C19.42 7.65 20.28 9.72 20.28 11.92C20.28 16.46 16.58 20.16 12.04 20.16C10.67 20.16 9.32 19.8 8.14 19.11L7.56 18.77L4.44 19.59L5.27 16.55L4.9 15.95C4.15 14.73 3.8 13.33 3.8 11.91C3.8 7.37 7.5 3.67 12.04 3.67ZM8.84 7.35C8.65 7.35 8.35 7.42 8.1 7.69C7.85 7.96 7.15 8.62 7.15 9.97C7.15 11.32 8.13 12.62 8.27 12.81C8.41 13 10.2 15.76 12.94 16.94C13.59 17.22 14.1 17.38 14.5 17.51C15.15 17.72 15.75 17.69 16.22 17.62C16.74 17.54 17.82 16.96 18.05 16.32C18.28 15.68 18.28 15.13 18.21 15.02C18.14 14.91 17.95 14.84 17.66 14.7C17.37 14.56 15.95 13.86 15.69 13.76C15.43 13.67 15.24 13.62 15.05 13.91C14.86 14.2 14.32 14.84 14.15 15.03C13.99 15.22 13.82 15.25 13.53 15.1C13.24 14.96 12.31 14.65 11.21 13.67C10.35 12.91 9.77 11.97 9.61 11.68C9.44 11.39 9.59 11.23 9.74 11.09C9.87 10.96 10.03 10.75 10.18 10.58C10.32 10.41 10.37 10.29 10.47 10.1C10.56 9.9 10.52 9.73 10.44 9.59C10.37 9.44 9.83 8.12 9.61 7.58C9.39 7.05 9.17 7.12 9.01 7.12C8.86 7.11 8.69 7.11 8.52 7.11L8.84 7.35Z" />
    </svg>
  );
}

function InstagramIcon({ size = 18, color = 'currentColor' }) {
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
      className="ps-contact-svg"
    >
      <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
    </svg>
  );
}

function GoogleMapsIcon({ size = 18, color = 'currentColor' }) {
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
      className="ps-contact-svg"
    >
      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" />
      <circle cx="12" cy="9" r="2.5" />
    </svg>
  );
}

/**
 * PS PERFUMES — Luxury Floating Contact & Concierge Dock
 * Positioned unobtrusively on bottom-left, cleanly avoiding shopping bag on bottom-right.
 * Official brand icons for WhatsApp, Instagram, and Google Maps with verified destinations.
 */
export default function FloatingContactDock() {
  const [config, setConfig] = useState(SITE_CONFIG);

  useEffect(() => {
    let mounted = true;
    async function fetchLiveSettings() {
      try {
        const live = await getSiteSettings();
        if (mounted && live) {
          setConfig((prev) => ({
            ...prev,
            instagramUrl: live.instagram_url || prev.instagramUrl,
            googleMapsUrl: live.google_maps_url || prev.googleMapsUrl,
            phone: live.phone || prev.phone,
            whatsappUrl: live.whatsapp_url || prev.whatsappUrl,
          }));
        }
      } catch {}
    }
    fetchLiveSettings();
    return () => {
      mounted = false;
    };
  }, []);

  // Compute and validate WhatsApp destination
  const resolveWhatsAppUrl = () => {
    if (config.whatsappUrl && config.whatsappUrl.startsWith('http')) {
      return config.whatsappUrl;
    }
    const cleanDigits = (config.phone || '').replace(/[^\d]/g, '');
    if (cleanDigits.length >= 10) {
      return `https://wa.me/${cleanDigits}`;
    }
    return null;
  };

  const whatsappUrl = resolveWhatsAppUrl();
  const instagramUrl = config.instagramUrl || 'https://www.instagram.com/ps_perfumes_kadapa/?hl=en';
  const googleMapsUrl = config.googleMapsUrl || 'https://share.google/b0yildKJKTaGc365J';

  return (
    <aside
      className="ps-floating-contact-dock"
      aria-label="Atelier Concierge and Social Channels"
    >
      {/* 1. WhatsApp Concierge */}
      {whatsappUrl && (
        <a
          href={whatsappUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="ps-contact-dock-btn ps-contact-whatsapp"
          aria-label="Chat on WhatsApp with PS PERFUMES Concierge"
          title="WhatsApp Concierge (+91 94949 51600)"
        >
          <WhatsAppIcon size={17} color="#25D366" />
          <span className="ps-contact-dock-tooltip">WhatsApp Concierge</span>
        </a>
      )}

      {/* 2. Official Instagram */}
      <a
        href={instagramUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="ps-contact-dock-btn ps-contact-instagram"
        aria-label="Official Instagram @ps_perfumes_kadapa"
        title="Follow @ps_perfumes_kadapa on Instagram"
      >
        <InstagramIcon size={17} color="#C9A96E" />
        <span className="ps-contact-dock-tooltip">@ps_perfumes_kadapa</span>
      </a>

      {/* 3. Google Maps Kadapa Location */}
      <a
        href={googleMapsUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="ps-contact-dock-btn ps-contact-maps"
        aria-label="Locate PS PERFUMES Kadapa Boutique on Google Maps"
        title="Visit Kadapa Boutique (Google Maps)"
      >
        <GoogleMapsIcon size={17} color="#C9A96E" />
        <span className="ps-contact-dock-tooltip">Kadapa Boutique</span>
      </a>
    </aside>
  );
}
