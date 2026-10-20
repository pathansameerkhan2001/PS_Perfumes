import React, { useState, useEffect } from 'react';
import HeroCinematic from '../../components/home/HeroCinematic';
import AnnouncementTicker from '../../components/home/AnnouncementTicker';
import BenefitsBar from '../../components/home/BenefitsBar';
import ShopByFragrance from '../../components/home/ShopByFragrance';
import ProductGridSection from '../../components/ProductGridSection';
import ComboPackSection from '../../components/ComboPackSection';
import InstagramReelsSection from '../../components/home/InstagramReelsSection';
import ReviewsSection from '../../components/ReviewsSection';
import { getHomepageProductSections } from '../../services/homepageService';
import { getHomepageSections } from '../../services/homepage';
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
  const [sections, setSections] = useState([]);
  const [, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function fetchHomeData() {
      try {
        const [{ bestSellers: bs, featuredProducts: fp }, rawSections] = await Promise.all([
          getHomepageProductSections(),
          // A sections error falls back to the default layout without hiding the products
          getHomepageSections().catch((err) => {
            console.error('Could not load homepage sections:', err);
            return [];
          }),
        ]);
        if (mounted) {
          setBestSellers(bs || []);
          setFeaturedProducts(fp || []);
          if (Array.isArray(rawSections) && rawSections.length > 0) {
            const activeSorted = rawSections
              .filter((s) => s.is_active !== false)
              .sort((a, b) => (a.display_order || 0) - (b.display_order || 0));
            setSections(activeSorted);
          }
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
        return <HeroCinematic key={sec.id} section={sec} />;
      case 'trust_strip':
        return (
          <React.Fragment key={sec.id}>
            <AnnouncementTicker />
            <BenefitsBar />
          </React.Fragment>
        );
      case 'fragrance_categories':
        return <ShopByFragrance key={sec.id} />;
      case 'bestsellers':
        return (
          <ProductGridSection
            key={sec.id}
            id="best-sellers"
            tag="SIGNATURE CREATIONS"
            title={sec.title || 'Best Sellers'}
            products={bestSellers}
            showFilterTabs={false}
            limit={8}
            emptyMessage="No best sellers available."
          />
        );
      case 'new_arrivals':
      case 'featured_products':
        return (
          <ProductGridSection
            key={sec.id}
            id="featured-products"
            tag="CURATED FORMULATIONS"
            title={sec.title || 'Featured Products'}
            products={featuredProducts}
            showFilterTabs={false}
            limit={8}
            emptyMessage="No featured products available."
          />
        );
      case 'combos':
      case 'combo_pack':
        return <ComboPackSection key={sec.id} />;
      case 'instagram_reels':
        return <InstagramReelsSection key={sec.id} />;
      case 'reviews':
        return <ReviewsSection key={sec.id} />;
      default:
        return null;
    }
  };

  // Default fallback layout if sections aren't customized yet
  const defaultLayout = (
    <>
      <HeroCinematic />
      <AnnouncementTicker />
      <BenefitsBar />
      <ShopByFragrance />
      <ProductGridSection
        id="best-sellers"
        tag="SIGNATURE CREATIONS"
        title="Best Sellers"
        products={bestSellers}
        showFilterTabs={false}
        limit={8}
        emptyMessage="No best sellers available."
      />
      <ProductGridSection
        id="featured-products"
        tag="CURATED FORMULATIONS"
        title="Featured Products"
        products={featuredProducts}
        showFilterTabs={false}
        limit={8}
        emptyMessage="No featured products available."
      />
      <ComboPackSection />
      <InstagramReelsSection />
      <ReviewsSection />
    </>
  );

  const hasHeroSection = sections.some((s) => (s.section_key || s.id) === 'hero');

  return (
    <div className="ps-home-page">
      {sections.length > 0 && !hasHeroSection && <HeroCinematic />}
      {sections.length > 0 ? sections.map(renderSection) : defaultLayout}
    </div>
  );
}
