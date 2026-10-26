import React, { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { MapPin, ShieldCheck, Gem, Truck, ArrowRight } from 'lucide-react';
import heroLineup from '../../assets/hero-slide2.webp';
import agarwoodBottle from '../../assets/promo-banner.webp';
import giftSet from '../../assets/combo-attar-set.webp';
import attarArt from '../../assets/categories/fragrance-attar.webp';
import perfumeArt from '../../assets/categories/fragrance-perfume.webp';
import bakhoorArt from '../../assets/categories/fragrance-bakhoor.webp';
import muskyArt from '../../assets/categories/fragrance-musky.webp';
import oudArt from '../../assets/categories/fragrance-oud.webp';
import floralArt from '../../assets/categories/fragrance-floral.webp';
import woodyArt from '../../assets/categories/fragrance-woody.webp';
import './AboutPage.css';
import { useSeo } from '../../utils/useSeo';

/*
 * About Us — light editorial theme (ivory #F8F3E9, white, champagne gold #D6B56D,
 * dark brown text #4A3528, burgundy accent #722F37). Deliberately different from the
 * black-and-gold homepage and category pages.
 *
 * Content uses only information already stated elsewhere on the site: location (Kadapa,
 * Andhra Pradesh 516001), the product types and seven fragrance families, "Genuine /
 * Handcrafted / Pan-India dispatch" (homepage trust strip), bottle choices (product variants)
 * and Cash on Delivery (checkout). No history, certifications or ingredient claims are added.
 */

const FAMILIES = [
  { name: 'Attar', slug: 'attar', image: attarArt },
  { name: 'Perfume', slug: 'perfume', image: perfumeArt },
  { name: 'Bakhoor', slug: 'bakhoor', image: bakhoorArt },
  { name: 'Musky', slug: 'musky', image: muskyArt },
  { name: 'Oud', slug: 'oud', image: oudArt },
  { name: 'Floral', slug: 'floral', image: floralArt },
  { name: 'Woody', slug: 'woody', image: woodyArt },
];

const PROMISES = [
  {
    icon: ShieldCheck,
    title: 'Genuine fragrances',
    text: 'Every fragrance we offer is genuine and presented under the PS PERFUMES name.',
  },
  {
    icon: Gem,
    title: 'Handcrafted with care',
    text: 'Our fragrances are prepared and finished by hand, and many are offered in a choice of bottle and size.',
  },
  {
    icon: Truck,
    title: 'Delivered across India',
    text: 'We dispatch across India, with Cash on Delivery available at checkout.',
  },
];

export default function AboutPage() {
  useSeo({
    title: 'About Us',
    description:
      'PS PERFUMES is a fragrance house in Kadapa, Andhra Pradesh, offering attars, perfumes and bakhoor across seven fragrance families.',
    path: '/about',
  });

  // Restrained reveal-on-scroll. Content is visible by default; the hidden starting state only
  // applies after this effect adds "ps-ab-motion", and never for reduced-motion visitors.
  const pageRef = useRef(null);
  useEffect(() => {
    const page = pageRef.current;
    if (!page || typeof IntersectionObserver === 'undefined') return undefined;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return undefined;

    page.classList.add('ps-ab-motion');
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.12 }
    );
    page.querySelectorAll('.ps-ab-reveal').forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return (
    <div className="ps-ab-page" ref={pageRef}>
      {/* 1. Hero */}
      <section className="ps-ab-hero" aria-labelledby="ps-ab-title">
        <div className="ps-ab-container ps-ab-hero-text">
          <span className="ps-ab-eyebrow">About PS PERFUMES</span>
          <h1 id="ps-ab-title" className="ps-ab-display">The Art of Fragrance</h1>
          <span className="ps-ab-rule" aria-hidden="true" />
          <p className="ps-ab-lead">
            A fragrance house from Kadapa, Andhra Pradesh, offering attars, perfumes and bakhoor.
          </p>
        </div>
        <div className="ps-ab-container">
          <figure className="ps-ab-hero-figure">
            <img
              src={heroLineup}
              alt="A line-up of PS PERFUMES fragrance bottles"
              width="1376"
              height="768"
              fetchPriority="high"
              decoding="async"
            />
          </figure>
        </div>
      </section>

      {/* 2. Brand story */}
      <section className="ps-ab-section" aria-labelledby="ps-ab-story">
        <div className="ps-ab-container ps-ab-split">
          <div className="ps-ab-split-text ps-ab-reveal">
            <span className="ps-ab-eyebrow">Our Story</span>
            <h2 id="ps-ab-story" className="ps-ab-heading">Rooted in Kadapa</h2>
            <span className="ps-ab-rule" aria-hidden="true" />
            <p>
              PS PERFUMES is based in Kadapa, Andhra Pradesh. From here we bring together a collection of attars,
              perfumes and bakhoor inspired by the rich traditions of Eastern perfumery.
            </p>
            <p>
              Our collection spans seven fragrance families, from Attar and Oud to Floral and Woody, so that everyone
              can find a scent that feels like their own.
            </p>
            <p className="ps-ab-location">
              <MapPin size={16} aria-hidden="true" />
              <span>Kadapa, Andhra Pradesh – 516001, India</span>
            </p>
          </div>
          <figure className="ps-ab-figure ps-ab-figure--portrait ps-ab-reveal">
            <img
              src={agarwoodBottle}
              alt="A PS PERFUMES bottle resting on pieces of agarwood"
              width="1376"
              height="768"
              loading="lazy"
              decoding="async"
            />
          </figure>
        </div>
      </section>

      {/* 3. Craft & quality */}
      <section className="ps-ab-section ps-ab-section--white" aria-labelledby="ps-ab-craft">
        <div className="ps-ab-container ps-ab-split ps-ab-split--reverse">
          <figure className="ps-ab-figure ps-ab-figure--square ps-ab-reveal">
            <img
              src={giftSet}
              alt="A PS PERFUMES attar roll-on gift set"
              width="1024"
              height="1024"
              loading="lazy"
              decoding="async"
            />
          </figure>
          <div className="ps-ab-split-text ps-ab-reveal">
            <span className="ps-ab-eyebrow">Craft &amp; Quality</span>
            <h2 id="ps-ab-craft" className="ps-ab-heading">Made with Care</h2>
            <span className="ps-ab-rule" aria-hidden="true" />
            <ul className="ps-ab-promises">
              {PROMISES.map(({ icon: Icon, title, text }) => (
                <li key={title} className="ps-ab-promise">
                  <span className="ps-ab-promise-icon" aria-hidden="true">
                    <Icon size={18} strokeWidth={1.6} />
                  </span>
                  <div>
                    <h3 className="ps-ab-promise-title">{title}</h3>
                    <p>{text}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* 4. Fragrance philosophy */}
      <section className="ps-ab-section ps-ab-philosophy" aria-labelledby="ps-ab-philosophy">
        <div className="ps-ab-container ps-ab-narrow ps-ab-reveal">
          <span className="ps-ab-eyebrow">Our Philosophy</span>
          <h2 id="ps-ab-philosophy" className="ps-ab-heading">A Scent for Every Moment</h2>
          <span className="ps-ab-rule ps-ab-rule--center" aria-hidden="true" />
          <p className="ps-ab-quote">
            We believe fragrance is personal — something to be chosen slowly and worn with pleasure.
          </p>
          <div className="ps-ab-trio">
            <div>
              <h3 className="ps-ab-trio-title">Attar</h3>
              <p>Concentrated fragrance oils for those who love depth and closeness.</p>
            </div>
            <div>
              <h3 className="ps-ab-trio-title">Perfume</h3>
              <p>Fragrances made to be worn through the day and remembered after.</p>
            </div>
            <div>
              <h3 className="ps-ab-trio-title">Bakhoor</h3>
              <p>Scented wood for filling the home with fragrance in the traditional way.</p>
            </div>
          </div>
        </div>
      </section>

      {/* 5. Closing CTA — links to the existing collections */}
      <section className="ps-ab-section ps-ab-section--white ps-ab-cta" aria-labelledby="ps-ab-cta">
        <div className="ps-ab-container ps-ab-reveal">
          <span className="ps-ab-eyebrow">The Collections</span>
          <h2 id="ps-ab-cta" className="ps-ab-heading">Discover Your Fragrance</h2>
          <span className="ps-ab-rule ps-ab-rule--center" aria-hidden="true" />
          <ul className="ps-ab-families">
            {FAMILIES.map((f) => (
              <li key={f.slug}>
                <Link to={`/${f.slug}`} className={`ps-ab-family ps-family-${f.slug}`}>
                  <img src={f.image} alt="" width="240" height="240" loading="lazy" decoding="async" />
                  <span>{f.name}</span>
                </Link>
              </li>
            ))}
          </ul>
          <div className="ps-ab-actions">
            <Link to="/shop" className="ps-ab-btn ps-ab-btn--primary">
              <span>Shop All Fragrances</span>
              <ArrowRight size={15} aria-hidden="true" />
            </Link>
            <Link to="/contact" className="ps-ab-btn ps-ab-btn--secondary">
              Contact Us
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
