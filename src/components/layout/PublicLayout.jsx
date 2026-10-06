import React from 'react';
import { Outlet } from 'react-router-dom';
import Header from '../Header';
import Footer from '../Footer';
import FloatingCartButton from '../FloatingCartButton';
import Toast from '../Toast';
import ScrollToTop from '../common/ScrollToTop';

// Lazy-loaded drawers and interactive dialogs
const ProductDetailModal = React.lazy(() => import('../ProductDetailModal'));
const CartDrawer = React.lazy(() => import('../CartDrawer'));
const CheckoutModal = React.lazy(() => import('../CheckoutModal'));
const WishlistDrawer = React.lazy(() => import('../WishlistDrawer'));

export default function PublicLayout() {
  return (
    <div className="ps-app-root">
      <ScrollToTop />
      {/* Fixed Two-Level Luxury Header */}
      <Header />

      {/* Main Content Viewport */}
      <main className="ps-main-content">
        <Outlet />
      </main>

      {/* Luxury Brand Footer */}
      <Footer />

      {/* Quick Action Floating Cart Pill */}
      <FloatingCartButton />

      {/* Drawers & Dialogs */}
      <React.Suspense fallback={null}>
        <ProductDetailModal />
        <CartDrawer />
        <CheckoutModal />
        <WishlistDrawer />
      </React.Suspense>

      <Toast />
    </div>
  );
}
