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

  const bestSellers = products.filter((p) => p.bestseller || p.featured);
  const newArrivals = products.filter((p) => p.new_arrival);

  return (
    <div className="ps-home-page">
      {/* 1. Cinematic Hero Section */}
      <HeroCinematic />

      {/* 2. Gold Announcement Ticker (Infinite continuous marquee) */}
      <AnnouncementTicker />

      {/* 3. Luxury 4-Pillar Benefits Bar */}
      <BenefitsBar />

      {/* 4. Shop by Fragrance (7 Circular Luxury Categories) */}
      <ShopByFragrance />

      {/* 4. Atelier Bestsellers Grid */}
      <ProductGridSection
        id="catalog-grid"
        tag="THE ATELIER COLLECTION"
        title="Explore Our Best Sellers"
        products={products}
        showFilterTabs={true}
        limit={8}
      />

      {/* 5. Dedicated Combo Pack Section */}
      <ComboPackSection />

      {/* 6. Signature Scent Occasions */}
      <SignatureScentSection />

      {/* 7. Panoramic Promotional Banner */}
      <PromoBanner />

      {/* 8. New Arrivals & Rare Extractions */}
      <ProductGridSection
        id="new-arrivals"
        tag="PRIVATE BLEND VAULT"
        title="New Arrivals & Rare Extractions"
        products={newArrivals.length > 0 ? newArrivals : products.slice(4, 8)}
        showFilterTabs={false}
        limit={4}
      />

      {/* 9. Real Instagram Reels Section */}
      <InstagramReelsSection />

      {/* 10. Patron Testimonials & Reviews */}
      <ReviewsSection />

      {/* 11. Heritage & Craftsmanship */}
      <AboutSection />

      {/* 12. Reassurance & Newsletter */}
      <TrustStrip />
    </div>
  );
}
