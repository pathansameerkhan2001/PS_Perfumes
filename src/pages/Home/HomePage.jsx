import React, { useState, useEffect } from 'react';
import HeroCinematic from '../../components/home/HeroCinematic';
import AnnouncementTicker from '../../components/home/AnnouncementTicker';
import BenefitsBar from '../../components/home/BenefitsBar';
import ShopByFragrance from '../../components/home/ShopByFragrance';
import ProductGridSection from '../../components/ProductGridSection';
import NewArrivalsSection from '../../components/home/NewArrivalsSection';
import ComboPackSection from '../../components/ComboPackSection';
import InstagramReelsSection from '../../components/home/InstagramReelsSection';
import ReviewsSection from '../../components/ReviewsSection';
import { getHomepageProductSections } from '../../services/homepageService';
import { getHomepageSections, INITIAL_SECTIONS } from '../../services/homepage';
import { useSeo } from '../../utils/useSeo';

export default function HomePage() {
  useSeo({
    path: '/',
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'Store',
      name: 'PS PERFUMES',
      url: 'https://psperfumes.com/',
      logo: 'https://psperfumes.com/assets/ps-perfumes-logo.png',
      image: 'https://psperfumes.com/assets/ps-perfumes-logo.png',
      telephone: '+91-9494951600',
      email: 'brandnix.in@gmail.com',
      address: {
        '@type': 'PostalAddress',
        addressLocality: 'Kadapa',
        addressRegion: 'Andhra Pradesh',
        postalCode: '516001',
        addressCountry: 'IN',
      },
      sameAs: ['https://www.instagram.com/ps_perfumes_kadapa/'],
    },
  });
  const [bestSellers, setBestSellers] = useState([]);
  const [featuredProducts, setFeaturedProducts] = useState([]);
  const [newArrivals, setNewArrivals] = useState([]);
  // null until loaded; then the active sections in display order (may be empty)
  const [sections, setSections] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function fetchHomeData() {
      try {
        const [{ bestSellers: bs, featuredProducts: fp, newArrivals: na }, rawSections] = await Promise.all([
          getHomepageProductSections(),
          // A sections error falls back to the built-in layout without hiding the products
          getHomepageSections().catch((err) => {
            console.error('Could not load homepage sections:', err);
            return INITIAL_SECTIONS;
          }),
        ]);
        if (mounted) {
          setBestSellers(bs || []);
          setFeaturedProducts(fp || []);
          setNewArrivals(na || []);
          const list = Array.isArray(rawSections) && rawSections.length > 0 ? rawSections : INITIAL_SECTIONS;
          setSections(
            list
              .filter((s) => s.is_active !== false)
              .sort((a, b) => (a.display_order || 0) - (b.display_order || 0))
          );
          setLoading(false);
        }
      } catch {
        if (mounted) setLoading(false);
      }
    }

    fetchHomeData();
    return () => {
      mounted = false;
    };
  }, []);

  // Section renderer based on section_key
  const renderSection = (sec) => {
    const key = sec.section_key || sec.id;
    switch (key) {
      case 'hero':
        // Rendered once above the sections (see below), never inside the list
        return null;
      case 'trust_strip':
        return (
          <React.Fragment key={sec.id}>
            <AnnouncementTicker />
            <BenefitsBar />
          </React.Fragment>
        );
      case 'fragrance_categories':
        return <ShopByFragrance key={sec.id} title={sec.title} subtitle={sec.subtitle} />;
      case 'bestsellers':
        return (
          <ProductGridSection
            key={sec.id}
            id="best-sellers"
            tag="SIGNATURE CREATIONS"
            title={sec.title || 'Best Sellers'}
            subtitle={sec.subtitle}
            products={bestSellers}
            showFilterTabs={false}
            limit={8}
            emptyMessage="No best sellers available."
          />
        );
      case 'new_arrivals':
        // Products flagged "New Arrival" in Admin → Products (their display order), else the most
        // recently added (getNewArrivalProducts)
        return (
          <NewArrivalsSection
            key={sec.id}
            title={sec.title}
            subtitle={sec.subtitle}
            products={newArrivals}
            loaded={!loading}
          />
        );
      case 'featured_products':
        return (
          <ProductGridSection
            key={sec.id}
            id="featured-products"
            tag="CURATED FORMULATIONS"
            title={sec.title || 'Featured Products'}
            subtitle={sec.subtitle}
            products={featuredProducts}
            showFilterTabs={false}
            limit={8}
            emptyMessage="No featured products available."
          />
        );
      case 'combos':
      case 'combo_pack':
        return <ComboPackSection key={sec.id} title={sec.title} subtitle={sec.subtitle} />;
      case 'instagram_reels':
        return <InstagramReelsSection key={sec.id} title={sec.title} subtitle={sec.subtitle} />;
      case 'reviews':
        return <ReviewsSection key={sec.id} title={sec.title} subtitle={sec.subtitle} />;
      default:
        return null;
    }
  };

  // Until the sections have loaded, the built-in layout is shown. If every section is hidden,
  // only the hero remains (it is always shown).
  const visibleSections = sections ?? INITIAL_SECTIONS;

  // The hero film is always first and rendered exactly once, outside the section list, so it is
  // never unmounted and re-created (which would abort and restart its download) when the saved
  // layout replaces the built-in one
  return (
    <div className="ps-home-page">
      <HeroCinematic />
      {visibleSections.map(renderSection)}
    </div>
  );
}
