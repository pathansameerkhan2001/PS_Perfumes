import React, { useState, useEffect } from 'react';
import HeroCinematic from '../../components/home/HeroCinematic';
import AnnouncementTicker from '../../components/home/AnnouncementTicker';
import BenefitsBar from '../../components/home/BenefitsBar';
import ShopByFragrance from '../../components/home/ShopByFragrance';
import ProductGridSection from '../../components/ProductGridSection';
import ComboPackSection from '../../components/ComboPackSection';
import SignatureScentSection from '../../components/SignatureScentSection';
import PromoBanner from '../../components/PromoBanner';
import InstagramReelsSection from '../../components/home/InstagramReelsSection';
import ReviewsSection from '../../components/ReviewsSection';
import AboutSection from '../../components/AboutSection';
import TrustStrip from '../../components/TrustStrip';
import { getProducts } from '../../services/products';

export default function HomePage() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    async function fetchCatalog() {
      try {
        const list = await getProducts({ status: 'active' });
        if (mounted) {
          setProducts(list);
          setLoading(false);
        }
      } catch {
        if (mounted) setLoading(false);
      }
    }
    fetchCatalog();
    return () => { mounted = false; };
  }, []);

  const bestSellers = products.filter(
    (p) => Boolean(p.bestseller) && (p.status === 'active' || p.active !== false)
  );
  const featuredProducts = products.filter(
    (p) => Boolean(p.featured) && (p.status === 'active' || p.active !== false)
  );

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

      {/* 5. Homepage Best Sellers (Section 8: bestseller=true AND active=true) */}
      <ProductGridSection
        id="best-sellers"
        tag="SIGNATURE CREATIONS"
        title="Best Sellers"
        products={bestSellers}
        showFilterTabs={false}
        limit={8}
        emptyMessage="No best sellers available yet."
      />

      {/* 6. Featured Products (Section 9: featured=true AND active=true) */}
      <ProductGridSection
        id="featured-products"
        tag="CURATED FORMULATIONS"
        title="Featured Products"
        products={featuredProducts}
        showFilterTabs={false}
        limit={8}
        emptyMessage="No featured products available."
      />

      {/* 7. Combo Collections (Section 10: Dedicated Combo Section) */}
      <ComboPackSection />

      {/* 8. Instagram Reels Section */}
      <InstagramReelsSection />

      {/* 9. Patron Reviews Section */}
      <ReviewsSection />
    </div>
  );
}
