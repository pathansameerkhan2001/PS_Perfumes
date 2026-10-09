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

export default function HomePage() {
  const [bestSellers, setBestSellers] = useState([]);
  const [featuredProducts, setFeaturedProducts] = useState([]);
  const [, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function fetchHomeProducts() {
      try {
        const { bestSellers: bs, featuredProducts: fp } = await getHomepageProductSections();
        if (mounted) {
          setBestSellers(bs);
          setFeaturedProducts(fp);
          setLoading(false);
        }
      } catch {
        if (mounted) setLoading(false);
      }
    }

    fetchHomeProducts();
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <div className="ps-home-page">
      {/* 1. Hero Section (Controlled dynamically through Admin) */}
      <HeroCinematic />

      {/* 2. Slim Luxury Champagne-Gold Marquee/Ticker */}
      <AnnouncementTicker />

      {/* 3. Luxury 4-Pillar Benefits Bar */}
      <BenefitsBar />

      {/* 4. Shop by Category (Database-driven, clean circular imagery) */}
      <ShopByFragrance />

      {/* 5. Homepage Best Sellers (Sales-ranked with is_bestseller fallback) */}
      <ProductGridSection
        id="best-sellers"
        tag="SIGNATURE CREATIONS"
        title="Best Sellers"
        products={bestSellers}
        showFilterTabs={false}
        limit={8}
        emptyMessage="No best sellers available."
      />

      {/* 6. Featured Products (is_featured=true AND is_active=true) */}
      <ProductGridSection
        id="featured-products"
        tag="CURATED FORMULATIONS"
        title="Featured Products"
        products={featuredProducts}
        showFilterTabs={false}
        limit={8}
        emptyMessage="No featured products available."
      />

      {/* 7. Combo Collections (Dedicated Combo Section) */}
      <ComboPackSection />

      {/* 8. Instagram Reels Section */}
      <InstagramReelsSection />

      {/* 9. Patron Reviews Section */}
      <ReviewsSection />
    </div>
  );
}
