import React from 'react';
import { CartProvider } from './context/CartContext';
import Header from './components/Header';
import HeroSlider from './components/HeroSlider';
import MarqueeStrip from './components/MarqueeStrip';
import CategoryPills from './components/CategoryPills';
import ProductGridSection from './components/ProductGridSection';
import ShoppableVideoSection from './components/ShoppableVideoSection';
import ComboPackSection from './components/ComboPackSection';
import SignatureScentSection from './components/SignatureScentSection';
import PromoBanner from './components/PromoBanner';
import InstagramSection from './components/InstagramSection';
import ReviewsSection from './components/ReviewsSection';
import AboutSection from './components/AboutSection';
import TrustStrip from './components/TrustStrip';
import Footer from './components/Footer';

// Modals & Drawers
import ProductDetailModal from './components/ProductDetailModal';
import CartDrawer from './components/CartDrawer';
import CheckoutModal from './components/CheckoutModal';
import WishlistDrawer from './components/WishlistDrawer';
import FloatingCartButton from './components/FloatingCartButton';
import Toast from './components/Toast';

// Catalog Data
import { PRODUCTS } from './data/products';

import './components/Sections.css';
import './App.css';

function App() {
  const bestSellers = PRODUCTS.filter((p) => p.isBestSeller);
  const newArrivals = PRODUCTS.filter((p) => p.isNewArrival);

  return (
    <CartProvider>
      <div className="ps-app-root">
        {/* 1. Header (Permanently Fixed with prominent PS PERFUMES logo & navigation) */}
        <Header />

        {/* Main Content (Starts below the fixed header) */}
        <main className="ps-main-content">
          {/* 2. Full-Width Campaign Hero Slider */}
          <HeroSlider />

        {/* 3. Slim Gold Marquee Information Strip */}
        <MarqueeStrip />

        {/* 4. Find By Category (Circular Pill Cards including Combo Pack) */}
        <CategoryPills />

        {/* 5. Main Product Showcase: Explore Our Best Sellers */}
        <ProductGridSection
          id="catalog-grid"
          tag="THE ATELIER COLLECTION"
          title="Explore Our Best Sellers"
          products={PRODUCTS}
          showFilterTabs={true}
          limit={8}
        />

        {/* 6. Shoppable Video / Reels Carousel Section (Matching Reference) */}
        <ShoppableVideoSection />

        {/* 7. Dedicated Combo Pack Section (Matching Reference) */}
        <ComboPackSection />

        {/* 8. Discover Your Signature Scent (6 Occasion Cards) */}
        <SignatureScentSection />

        {/* 9. Mid-Page Panoramic Promotional Banner */}
        <PromoBanner />

        {/* 10. New Arrivals & Master Extractions Grid */}
        <ProductGridSection
          id="new-arrivals"
          tag="PRIVATE BLEND VAULT"
          title="New Arrivals & Rare Extractions"
          products={newArrivals.length > 0 ? newArrivals : PRODUCTS.slice(4, 8)}
          showFilterTabs={false}
          limit={4}
        />

        {/* 11. Follow us Instagram (4 Media Cards / Videos) */}
        <InstagramSection />

        {/* 12. What Our Customers Have to Say (Patron Testimonials & Reviews Carousel) */}
        <ReviewsSection />

        {/* 11. The Atelier Heritage & Craftsmanship */}
        <AboutSection />

        {/* 12. Customer Reassurance Trust Strip & VIP Newsletter */}
        <TrustStrip />

        {/* 13. Luxury 5-Column Brand Footer with Instagram Channel Link */}
        <Footer />
        </main>

        {/* Floating Quick Access Pill */}
        <FloatingCartButton />

        {/* Interactive Drawers & Modals */}
        <ProductDetailModal />
        <CartDrawer />
        <CheckoutModal />
        <WishlistDrawer />
        <Toast />
      </div>
    </CartProvider>
  );
}

export default App;
