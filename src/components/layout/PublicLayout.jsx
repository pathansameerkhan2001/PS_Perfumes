import React from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useCart } from '../../context/CartContext';
import Header from '../Header';
import Footer from '../Footer';
import FloatingCartButton from '../FloatingCartButton';
import FloatingContactDock from '../common/FloatingContactDock';
import Toast from '../Toast';
import ScrollToTop from '../common/ScrollToTop';
import ErrorBoundary from '../common/ErrorBoundary';

// Lazy-loaded drawers and interactive dialogs
const ProductDetailModal = React.lazy(() => import('../ProductDetailModal'));
const CartDrawer = React.lazy(() => import('../CartDrawer'));
// The former CheckoutModal (a simulated card/UPI checkout that saved nothing) was removed:
// all purchases go through the /checkout page, which records the order.
const WishlistDrawer = React.lazy(() => import('../WishlistDrawer'));

export default function PublicLayout() {
  const { pathname } = useLocation();
  const { isCartOpen, setIsCartOpen } = useCart();

  return (
    <div className="ps-app-root">
      <ScrollToTop />
      {/* Fixed Two-Level Luxury Header */}
      <Header />

      {/* Main Content Viewport */}
      <main className="ps-main-content">
        {/* Pages other than the homepage and cart load on first visit (see App.jsx); the
            placeholder keeps the footer from jumping up meanwhile */}
        <ErrorBoundary resetKey={pathname}>
          <React.Suspense fallback={<div aria-busy="true" style={{ minHeight: '70vh' }} />}>
            <Outlet />
          </React.Suspense>
        </ErrorBoundary>
      </main>

      {/* Luxury Brand Footer */}
      <Footer />

      {/* Luxury Floating Social & Contact Concierge (Bottom-Left) */}
      <FloatingContactDock />

      {/* Quick Action Floating Cart Pill (Bottom-Right) */}
      <FloatingCartButton />

      {/* Drawers & Dialogs */}
      {/* A failing drawer closes on its own; the page behind it keeps working */}
      <React.Suspense fallback={null}>
        <ErrorBoundary fallback={null} resetKey={pathname}>
          <ProductDetailModal />
        </ErrorBoundary>
        <ErrorBoundary fallback={null} resetKey={isCartOpen} onError={() => setIsCartOpen(false)}>
          <CartDrawer />
        </ErrorBoundary>
        <ErrorBoundary fallback={null} resetKey={pathname}>
          <WishlistDrawer />
        </ErrorBoundary>
      </React.Suspense>

      <Toast />
    </div>
  );
}
