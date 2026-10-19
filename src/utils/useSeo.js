import { useEffect } from 'react';

const SITE_URL = (import.meta.env.VITE_SITE_URL || 'https://psperfumes.com').replace(/\/+$/, '');
const SITE_NAME = 'PS PERFUMES';
const DEFAULT_TITLE = 'PS PERFUMES | Attars, Perfumes & Luxury Fragrances from Kadapa';
const DEFAULT_DESCRIPTION =
  'Shop attars, perfumes, oud and bakhoor from PS PERFUMES, Kadapa. Glass and PVC bottle options, combo packs and cash on delivery across India.';
const DEFAULT_IMAGE = `${SITE_URL}/assets/ps-perfumes-logo.png`;

function setMeta(attr, key, content) {
  let el = document.head.querySelector(`meta[${attr}="${key}"]`);
  if (!content) {
    el?.remove();
    return;
  }
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function setCanonical(href) {
  let el = document.head.querySelector('link[rel="canonical"]');
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', 'canonical');
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

function absoluteUrl(pathOrUrl) {
  if (!pathOrUrl) return '';
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  return `${SITE_URL}${pathOrUrl.startsWith('/') ? '' : '/'}${pathOrUrl}`;
}

/**
 * Per-page title, description, canonical URL, Open Graph / Twitter tags and optional JSON-LD.
 * This is a client-rendered SPA: search engines that execute JavaScript (Google) read these
 * tags; link-preview bots that do not run JavaScript fall back to the tags in index.html.
 *
 * @param {object} opts
 * @param {string} [opts.title]        Page title (the brand name is appended)
 * @param {string} [opts.description]  Meta description (trimmed to 160 characters)
 * @param {string} [opts.path]         Canonical path, e.g. '/shop' (query strings are dropped)
 * @param {string} [opts.image]        Share image (absolute or site-relative)
 * @param {string} [opts.type]         og:type, default 'website'
 * @param {object|object[]} [opts.jsonLd] Structured data object(s)
 * @param {boolean} [opts.noindex]     Adds robots noindex (e.g. cart, checkout)
 */
export function useSeo({ title, description, path, image, type = 'website', jsonLd, noindex = false } = {}) {
  const jsonLdText = jsonLd ? JSON.stringify(jsonLd) : '';

  useEffect(() => {
    const fullTitle = title ? `${title} | ${SITE_NAME}` : DEFAULT_TITLE;
    const desc = (description || DEFAULT_DESCRIPTION).replace(/\s+/g, ' ').trim().slice(0, 160);
    const url = absoluteUrl(path || window.location.pathname);
    const img = absoluteUrl(image) || DEFAULT_IMAGE;

    document.title = fullTitle;
    setMeta('name', 'description', desc);
    setMeta('name', 'robots', noindex ? 'noindex, follow' : '');
    setCanonical(url);
    setMeta('property', 'og:site_name', SITE_NAME);
    setMeta('property', 'og:title', fullTitle);
    setMeta('property', 'og:description', desc);
    setMeta('property', 'og:url', url);
    setMeta('property', 'og:type', type);
    setMeta('property', 'og:image', img);
    setMeta('name', 'twitter:card', 'summary_large_image');
    setMeta('name', 'twitter:title', fullTitle);
    setMeta('name', 'twitter:description', desc);
    setMeta('name', 'twitter:image', img);

    let script = null;
    if (jsonLdText) {
      script = document.createElement('script');
      script.type = 'application/ld+json';
      script.dataset.pageSeo = 'true';
      script.textContent = jsonLdText;
      document.head.appendChild(script);
    }
    return () => {
      script?.remove();
    };
  }, [title, description, path, image, type, jsonLdText, noindex]);
}

export { SITE_URL };
