import React, { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { CartProvider } from './context/CartContext';
import PublicLayout from './components/layout/PublicLayout';

// Public Storefront Pages
import HomePage from './pages/Home/HomePage';
import AboutPage from './pages/About/AboutPage';
import ShopPage from './pages/Shop/ShopPage';
import CollectionPage from './pages/Collection/CollectionPage';
import ProductDetailPage from './pages/Product/ProductDetailPage';
import CartPage from './pages/Cart/CartPage';
import CheckoutPage from './pages/Checkout/CheckoutPage';
import WishlistPage from './pages/Wishlist/WishlistPage';
import ContactPage from './pages/Contact/ContactPage';
import SearchPage from './pages/Search/SearchPage';
import InstagramPage from './pages/Instagram/InstagramPage';
import TrackOrderPage from './pages/TrackOrder/TrackOrderPage';

// Lazy-loaded Admin Pages (Code-split for maximum storefront performance)
const AdminLogin = lazy(() => import('./admin/pages/AdminLogin'));
const AdminRoute = lazy(() => import('./admin/components/AdminRoute'));
const AdminLayout = lazy(() => import('./admin/layouts/AdminLayout'));
const AdminDashboard = lazy(() => import('./admin/pages/AdminDashboard'));

import './components/Sections.css';
import './App.css';

function AdminLoadingFallback() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '60vh',
        gap: '12px',
        color: '#C9A96E',
        fontFamily: "'Cormorant Garamond', Georgia, serif",
      }}
    >
      <div
        style={{
          width: '26px',
          height: '26px',
          border: '2px solid rgba(201, 169, 110, 0.25)',
          borderTopColor: '#C9A96E',
          borderRadius: '50%',
          animation: 'ps-spin 0.7s linear infinite',
        }}
      />
      <span style={{ fontSize: '13px', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
        Accessing Atelier Console...
      </span>
    </div>
  );
}

export default function App() {
  return (
    <CartProvider>
      <Routes>
        {/* ==============================================================
            PUBLIC STOREFRONT ROUTES (Wrapped in Luxury Brand Layout)
            ============================================================== */}
        <Route element={<PublicLayout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/shop" element={<ShopPage />} />
          {/* Reusable Master Fragrance Collection Routes */}
          <Route path="/attar" element={<CollectionPage key="attar" category="attar" />} />
          <Route path="/perfume" element={<CollectionPage key="perfume" category="perfume" />} />
          <Route path="/bakhoor" element={<CollectionPage key="bakhoor" category="bakhoor" />} />
          <Route path="/musky" element={<CollectionPage key="musky" category="musky" />} />
          <Route path="/oud" element={<CollectionPage key="oud" category="oud" />} />
          <Route path="/floral" element={<CollectionPage key="floral" category="floral" />} />
          <Route path="/woody" element={<CollectionPage key="woody" category="woody" />} />
          <Route path="/category/:slug" element={<CollectionPage />} />
          <Route path="/product/:slug" element={<ProductDetailPage />} />
          <Route path="/cart" element={<CartPage />} />
          <Route path="/checkout" element={<CheckoutPage />} />
          <Route path="/wishlist" element={<WishlistPage />} />
          <Route path="/contact" element={<ContactPage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/instagram" element={<InstagramPage />} />
          <Route path="/offers" element={<ShopPage />} />
          <Route path="/track-order" element={<TrackOrderPage />} />
        </Route>

        {/* ==============================================================
            ADMIN AUTHENTICATION (Standalone login page)
            ============================================================== */}
        <Route
          path="/admin/login"
          element={
            <Suspense fallback={<AdminLoadingFallback />}>
              <AdminLogin />
            </Suspense>
          }
        />

        {/* ==============================================================
            PROTECTED ADMIN CONSOLE ROUTES (Role-verified via Supabase)
            ============================================================== */}
        <Route
          path="/admin"
          element={
            <Suspense fallback={<AdminLoadingFallback />}>
              <AdminRoute>
                <AdminLayout />
              </AdminRoute>
            </Suspense>
          }
        >
          <Route index element={<AdminDashboard />} />
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Route>

        {/* Fallback route */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </CartProvider>
  );
}
