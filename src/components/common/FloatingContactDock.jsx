import React, { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { MapPin, ExternalLink, Copy, Check, X } from 'lucide-react';
import { SITE_CONFIG } from '../../config/siteConfig';
import { getStorefrontSettings } from '../../services/settings';
import './FloatingContactDock.css';

// Official WhatsApp glyph (Simple Icons)
function WhatsAppIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

// Instagram glyph (rounded square, lens, flash)
function InstagramIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <rect width="20" height="20" x="2" y="2" rx="5.5" ry="5.5" />
      <circle cx="12" cy="12" r="4.2" />
      <circle cx="17.6" cy="6.4" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

const handleOf = (url) => {
  const m = String(url || '').match(/instagram\.com\/([^/?#]+)/i);
  return m ? `@${m[1]}` : '@ps_perfumes_kadapa';
};

/**
 * PS PERFUMES — floating contact dock (bottom-left, opposite the bag button).
 * Each icon opens a small panel with a label and its action: WhatsApp chat, the Instagram
 * profile, or the store address with Google Maps. One panel at a time; it closes on a tap or
 * click outside, on Escape and when the page changes. Details come from Admin → Store Settings,
 * with the site configuration as fallback.
 */
export default function FloatingContactDock() {
  const [config, setConfig] = useState(SITE_CONFIG);
  const [address, setAddress] = useState(SITE_CONFIG.address || '');
  const [open, setOpen] = useState(null); // 'whatsapp' | 'instagram' | 'location' | null
  const [copied, setCopied] = useState(false);
  const dockRef = useRef(null);
  const { pathname } = useLocation();

  useEffect(() => {
    let mounted = true;
    getStorefrontSettings()
      .then((live) => {
        if (!mounted || !live) return;
        setConfig((prev) => ({
          ...prev,
          instagramUrl: live.instagram_url || prev.instagramUrl,
          googleMapsUrl: live.google_maps_url || prev.googleMapsUrl,
          phone: live.phone || prev.phone,
          whatsappUrl: live.whatsapp_url || prev.whatsappUrl,
        }));
        // Full address from the separate settings fields, without repeating a part
        const parts = [live.address, live.city, live.state, live.pincode].map((p) => String(p || '').trim()).filter(Boolean);
        const unique = parts.filter((p, i) => !parts.slice(0, i).some((q) => q.toLowerCase().includes(p.toLowerCase())));
        if (unique.length) setAddress(unique.join(', '));
      })
      .catch(() => {
        // keep the built-in details
      });
    return () => {
      mounted = false;
    };
  }, []);

  // Close on outside tap/click, on Escape and on page change
  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (e) => {
      if (dockRef.current && !dockRef.current.contains(e.target)) setOpen(null);
    };
    const onKey = (e) => e.key === 'Escape' && setOpen(null);
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  useEffect(() => {
    setOpen(null);
  }, [pathname]);

  const digits = String(config.phone || '').replace(/[^\d]/g, '');
  const whatsappUrl =
    config.whatsappUrl && /^https?:\/\//.test(config.whatsappUrl)
      ? config.whatsappUrl
      : digits.length >= 10
      ? `https://wa.me/${digits}`
      : null;
  const instagramUrl = config.instagramUrl || 'https://www.instagram.com/ps_perfumes_kadapa/';
  const mapsUrl =
    config.googleMapsUrl || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`PS PERFUMES ${address}`)}`;

  const copyAddress = async () => {
    try {
      await navigator.clipboard.writeText(`PS PERFUMES, ${address}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // clipboard not available: the address stays visible to copy by hand
    }
  };

  const items = [
    whatsappUrl && {
      id: 'whatsapp',
      label: 'WhatsApp',
      icon: <WhatsAppIcon size={19} />,
      panel: (
        <>
          <p className="ps-dock-panel-title">Chat with us on WhatsApp</p>
          <p className="ps-dock-panel-text">Questions about a fragrance or an order? We reply on WhatsApp.</p>
          {config.phone && <p className="ps-dock-panel-meta">{config.phone}</p>}
          <a className="ps-dock-panel-action" href={whatsappUrl} target="_blank" rel="noopener noreferrer">
            <WhatsAppIcon size={15} />
            <span>Open WhatsApp</span>
          </a>
        </>
      ),
    },
    {
      id: 'instagram',
      label: 'Instagram',
      icon: <InstagramIcon size={19} />,
      panel: (
        <>
          <p className="ps-dock-panel-title">PS PERFUMES on Instagram</p>
          <p className="ps-dock-panel-text">New arrivals, reels and fragrance stories.</p>
          <p className="ps-dock-panel-meta">{handleOf(instagramUrl)}</p>
          <a className="ps-dock-panel-action" href={instagramUrl} target="_blank" rel="noopener noreferrer">
            <InstagramIcon size={15} />
            <span>Open Instagram</span>
          </a>
        </>
      ),
    },
    {
      id: 'location',
      label: 'Store location',
      icon: <MapPin size={19} strokeWidth={1.9} aria-hidden="true" />,
      panel: (
        <>
          <p className="ps-dock-panel-title">Visit our store</p>
          <p className="ps-dock-panel-text ps-dock-panel-address">PS PERFUMES, {address}</p>
          <a className="ps-dock-panel-action" href={mapsUrl} target="_blank" rel="noopener noreferrer">
            <ExternalLink size={15} aria-hidden="true" />
            <span>Open in Google Maps</span>
          </a>
          <button type="button" className="ps-dock-panel-action is-secondary" onClick={copyAddress}>
            {copied ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
            <span>{copied ? 'Address copied' : 'Copy address'}</span>
          </button>
        </>
      ),
    },
  ].filter(Boolean);

  return (
    <aside className="ps-floating-contact-dock" aria-label="Contact PS PERFUMES" ref={dockRef}>
      {items.map((item) => {
        const isOpen = open === item.id;
        return (
          <div key={item.id} className={`ps-dock-item ps-dock-${item.id}${isOpen ? ' is-open' : ''}`}>
            <button
              type="button"
              className="ps-contact-dock-btn"
              aria-expanded={isOpen}
              aria-controls={`ps-dock-panel-${item.id}`}
              aria-label={item.label}
              title={item.label}
              onClick={() => setOpen(isOpen ? null : item.id)}
            >
              {item.icon}
            </button>
            {isOpen && (
              <div id={`ps-dock-panel-${item.id}`} className="ps-dock-panel" role="dialog" aria-label={item.label}>
                <button type="button" className="ps-dock-panel-close" onClick={() => setOpen(null)} aria-label="Close">
                  <X size={14} />
                </button>
                {item.panel}
              </div>
            )}
          </div>
        );
      })}
    </aside>
  );
}
