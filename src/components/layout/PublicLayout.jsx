import React, { useEffect, useRef } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useCart } from '../../context/CartContext';
import Header from '../Header';
import Footer from '../Footer';
import FloatingContactDock from '../common/FloatingContactDock';
import Toast from '../Toast';
import ScrollToTop from '../common/ScrollToTop';
import ErrorBoundary from '../common/ErrorBoundary';
import './StorefrontTheme.css';

// Lazy-loaded drawers and interactive dialogs
const ProductDetailModal = React.lazy(() => import('../ProductDetailModal'));
const CartDrawer = React.lazy(() => import('../CartDrawer'));
// The former CheckoutModal (a simulated card/UPI checkout that saved nothing) was removed:
// all purchases go through the /checkout page, which records the order.
const WishlistDrawer = React.lazy(() => import('../WishlistDrawer'));

export default function PublicLayout() {
  const { pathname } = useLocation();
  const { isCartOpen, setIsCartOpen } = useCart();
  // The floating contact toggle would cover the checkout form and its Place Order button
  const isCheckout = pathname.replace(/\/+$/, '') === '/checkout';

  // Decorative animations (Atmosphere, ornaments, shimmers) pause while the tab is hidden:
  // CSS keys off html[data-page-hidden]
  useEffect(() => {
    const root = document.documentElement;
    const sync = () => root.toggleAttribute('data-page-hidden', document.visibilityState === 'hidden');
    sync();
    document.addEventListener('visibilitychange', sync);
    return () => {
      document.removeEventListener('visibilitychange', sync);
      root.removeAttribute('data-page-hidden');
    };
  }, []);

  // Soft fade between pages (Web Animations API: no remount, no library); skipped on first
  // load and when the visitor prefers reduced motion
  const mainRef = useRef(null);
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const el = mainRef.current;
    if (!el?.animate || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    // Opacity only: a transform on <main> would re-anchor fixed elements inside the pages
    el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 280, easing: 'ease-out' });
  }, [pathname]);

  return (
    <div className="ps-app-root">
      <ScrollToTop />
      {/* Fixed Two-Level Luxury Header */}
      <Header />

      {/* Main Content Viewport */}
      <main className="ps-main-content" ref={mainRef}>
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

      {/* The only floating control: the contact toggle (bottom-left). The bag lives in the
          header (with its count); there is no second, competing floating cart button. */}
      {!isCheckout && <FloatingContactDock />}

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
