import React, { Suspense, lazy, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { CartProvider } from './context/CartContext';
import PublicLayout from './components/layout/PublicLayout';
import { whenIdleAfterLoad } from './utils/idlePrefetch';

// Public Storefront Pages
// The homepage is part of the main bundle. The cart page is too: CartDrawer.css (loaded with the
// drawer) shares class names with CartPage.css and must keep coming after it. Every other page is
// loaded when first opened and fetched in the background once the first page is idle.
import HomePage from './pages/Home/HomePage';
import CartPage from './pages/Cart/CartPage';

const storefrontPages = {
  shop: () => import('./pages/Shop/ShopPage'),
  collection: () => import('./pages/Collection/CollectionPage'),
  product: () => import('./pages/Product/ProductDetailPage'),
  checkout: () => import('./pages/Checkout/CheckoutPage'),
  about: () => import('./pages/About/AboutPage'),
  wishlist: () => import('./pages/Wishlist/WishlistPage'),
  contact: () => import('./pages/Contact/ContactPage'),
  search: () => import('./pages/Search/SearchPage'),
  instagram: () => import('./pages/Instagram/InstagramPage'),
  trackOrder: () => import('./pages/TrackOrder/TrackOrderPage'),
};
const ShopPage = lazy(storefrontPages.shop);
const CollectionPage = lazy(storefrontPages.collection);
const ProductDetailPage = lazy(storefrontPages.product);
const CheckoutPage = lazy(storefrontPages.checkout);
const AboutPage = lazy(storefrontPages.about);
const WishlistPage = lazy(storefrontPages.wishlist);
const ContactPage = lazy(storefrontPages.contact);
const SearchPage = lazy(storefrontPages.search);
const InstagramPage = lazy(storefrontPages.instagram);
const TrackOrderPage = lazy(storefrontPages.trackOrder);

const AdminLogin = lazy(() => import('./admin/pages/AdminLogin'));
const AdminRoute = lazy(() => import('./admin/components/AdminRoute'));
const AdminLayout = lazy(() => import('./admin/layouts/AdminLayout'));
const AdminDashboard = lazy(() => import('./admin/pages/AdminDashboard'));
const AdminHero = lazy(() => import('./admin/pages/AdminHero'));
const AdminHomepage = lazy(() => import('./admin/pages/AdminHomepage'));
const AdminReels = lazy(() => import('./admin/pages/AdminReels'));
const AdminProducts = lazy(() => import('./admin/pages/AdminProducts'));
const AdminProductForm = lazy(() => import('./admin/pages/AdminProductForm'));
const AdminProductImport = lazy(() => import('./admin/pages/AdminProductImport'));const AdminCategories = lazy(() => import('./admin/pages/AdminCategories'));
const AdminCombos = lazy(() => import('./admin/pages/AdminCombos'));
const AdminInventory = lazy(() => import('./admin/pages/AdminInventory'));
const AdminOrders = lazy(() => import('./admin/pages/AdminOrders'));
const AdminCustomers = lazy(() => import('./admin/pages/AdminCustomers'));
const AdminReviews = lazy(() => import('./admin/pages/AdminReviews'));
const AdminEnquiries = lazy(() => import('./admin/pages/AdminEnquiries'));
const AdminCoupons = lazy(() => import('./admin/pages/AdminCoupons'));
const AdminSettings = lazy(() => import('./admin/pages/AdminSettings'));
const AdminUsers = lazy(() => import('./admin/pages/AdminUsers'));

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
        fontFamily: 'var(--font-serif)',
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
  // Storefront pages are fetched in the background after the first page, so later navigation
  // does not wait for them (admin code is never prefetched)
  useEffect(() => {
    whenIdleAfterLoad(() => {
      Object.values(storefrontPages).forEach((load) => load().catch(() => {}));
    });
  }, []);

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
          <Route path="hero" element={<AdminHero />} />
          <Route path="homepage" element={<AdminHomepage />} />
          <Route path="reels" element={<AdminReels />} />
          <Route path="products" element={<AdminProducts />} />
          <Route path="products/new" element={<AdminProductForm />} />
          <Route path="products/import" element={<AdminProductImport />} />          <Route path="products/:id/edit" element={<AdminProductForm />} />
          <Route path="products/edit/:id" element={<AdminProductForm />} />
          <Route path="categories" element={<AdminCategories />} />
          <Route path="combos" element={<AdminCombos />} />
          <Route path="inventory" element={<AdminInventory />} />
          <Route path="orders" element={<AdminOrders />} />
          <Route path="customers" element={<AdminCustomers />} />
          <Route path="reviews" element={<AdminReviews />} />
          <Route path="enquiries" element={<AdminEnquiries />} />
          <Route path="coupons" element={<AdminCoupons />} />
          <Route path="settings" element={<AdminSettings />} />
          <Route path="admin-users" element={<AdminUsers />} />
          <Route path="users" element={<Navigate to="/admin/admin-users" replace />} />
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Route>

        {/* Fallback route */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </CartProvider>
  );
}
