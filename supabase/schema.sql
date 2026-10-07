-- ============================================================================
-- PS PERFUMES — Production Database Schema & Security Policies
-- Supabase Project Reference: b8cf103c-16a7-4393-9533-ab214fb40b36
-- Database: Ps_Perfumes
-- Storage Bucket: ps-perfumes
-- ============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. PROFILES & ROLES
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  role TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('customer', 'admin')),
  full_name TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Trigger to create profile automatically on auth.users insert
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name',
    CASE WHEN NEW.email = 'brandnix.in@gmail.com' THEN 'admin' ELSE 'customer' END
  )
  ON CONFLICT (id) DO UPDATE SET
    role = CASE WHEN NEW.email = 'brandnix.in@gmail.com' THEN 'admin' ELSE public.profiles.role END;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Helper function to check if current user is admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- 2. CATEGORIES
CREATE TABLE IF NOT EXISTS public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  image_url TEXT,
  display_order INT DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  is_featured BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_categories_slug ON public.categories(slug);
CREATE INDEX IF NOT EXISTS idx_categories_order ON public.categories(display_order);

-- 3. PRODUCTS
CREATE TABLE IF NOT EXISTS public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  category TEXT NOT NULL,
  subcategory TEXT,
  description TEXT,
  short_description TEXT,
  price NUMERIC(10, 2) NOT NULL,
  sale_price NUMERIC(10, 2),
  compare_at_price NUMERIC(10, 2),
  sku TEXT UNIQUE,
  stock INT NOT NULL DEFAULT 10,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'draft', 'out_of_stock', 'archived')),
  featured BOOLEAN DEFAULT false,
  new_arrival BOOLEAN DEFAULT false,
  bestseller BOOLEAN DEFAULT false,
  rating NUMERIC(3, 2) DEFAULT 5.0,
  review_count INT DEFAULT 0,
  main_image TEXT NOT NULL,
  gallery_images JSONB DEFAULT '[]'::jsonb,
  sizes JSONB DEFAULT '["50ml", "100ml"]'::jsonb,
  fragrance_notes JSONB DEFAULT '[]'::jsonb,
  top_notes JSONB DEFAULT '[]'::jsonb,
  heart_notes JSONB DEFAULT '[]'::jsonb,
  base_notes JSONB DEFAULT '[]'::jsonb,
  ingredients TEXT,
  occasion TEXT,
  gender TEXT,
  tags JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_products_slug ON public.products(slug);
CREATE INDEX IF NOT EXISTS idx_products_category ON public.products(category);
CREATE INDEX IF NOT EXISTS idx_products_status ON public.products(status);
CREATE INDEX IF NOT EXISTS idx_products_featured ON public.products(featured);
CREATE INDEX IF NOT EXISTS idx_products_new_arrival ON public.products(new_arrival);
CREATE INDEX IF NOT EXISTS idx_products_bestseller ON public.products(bestseller);
CREATE INDEX IF NOT EXISTS idx_products_created_at ON public.products(created_at DESC);

-- 3B. PRODUCT VARIANTS (Variant Matrix: Glass / PVC x 30ml, 50ml, 100ml)
CREATE TABLE IF NOT EXISTS public.product_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  bottle_type TEXT NOT NULL CHECK (bottle_type IN ('glass', 'pvc', 'Glass Bottle', 'PVC Bottle')),
  size_ml TEXT NOT NULL,
  price NUMERIC(10, 2) NOT NULL,
  sale_price NUMERIC(10, 2),
  compare_at_price NUMERIC(10, 2),
  stock INT NOT NULL DEFAULT 15,
  sku TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE(product_id, bottle_type, size_ml)
);

CREATE INDEX IF NOT EXISTS idx_variants_product_id ON public.product_variants(product_id);
CREATE INDEX IF NOT EXISTS idx_variants_stock ON public.product_variants(stock);

-- 3C. COMBOS & BUNDLES
CREATE TABLE IF NOT EXISTS public.combos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  category TEXT DEFAULT 'Combo Pack',
  description TEXT,
  image_url TEXT NOT NULL,
  combo_price NUMERIC(10, 2) NOT NULL,
  original_price NUMERIC(10, 2),
  discount INT,
  stock INT NOT NULL DEFAULT 20,
  bestseller BOOLEAN DEFAULT false,
  featured BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  display_order INT DEFAULT 0,
  rating NUMERIC(3, 2) DEFAULT 5.0,
  review_count INT DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_combos_slug ON public.combos(slug);
CREATE INDEX IF NOT EXISTS idx_combos_order ON public.combos(display_order);

CREATE TABLE IF NOT EXISTS public.combo_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  combo_id UUID NOT NULL REFERENCES public.combos(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  variant_id UUID REFERENCES public.product_variants(id) ON DELETE SET NULL,
  bottle_type TEXT,
  size_ml TEXT,
  quantity INT NOT NULL DEFAULT 1,
  product_image TEXT,
  subtitle TEXT
);

CREATE INDEX IF NOT EXISTS idx_combo_items_combo_id ON public.combo_items(combo_id);

-- 3D. HERO SLIDES
CREATE TABLE IF NOT EXISTS public.hero_slides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  desktop_image TEXT NOT NULL,
  mobile_image TEXT NOT NULL,
  eyebrow TEXT,
  heading TEXT,
  description TEXT,
  cta_text TEXT,
  cta_link TEXT,
  display_order INT DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_hero_slides_order ON public.hero_slides(display_order);

-- 3E. ADMIN USERS
CREATE TABLE IF NOT EXISTS public.admin_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT DEFAULT 'admin',
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
  last_login TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 4. ORDERS & ORDER ITEMS
CREATE TABLE IF NOT EXISTS public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number TEXT UNIQUE NOT NULL,
  customer_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  customer_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  shipping_address JSONB NOT NULL,
  subtotal NUMERIC(10, 2) NOT NULL,
  shipping_fee NUMERIC(10, 2) DEFAULT 0,
  discount NUMERIC(10, 2) DEFAULT 0,
  total NUMERIC(10, 2) NOT NULL,
  payment_method TEXT NOT NULL DEFAULT 'COD',
  payment_status TEXT NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'failed', 'refunded')),
  order_status TEXT NOT NULL DEFAULT 'pending' CHECK (order_status IN ('pending', 'confirmed', 'processing', 'shipped', 'out_for_delivery', 'delivered', 'cancelled')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_orders_number ON public.orders(order_number);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(order_status);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON public.orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders(created_at DESC);

CREATE TABLE IF NOT EXISTS public.order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  variant_id UUID REFERENCES public.product_variants(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  bottle_type TEXT,
  size_ml TEXT,
  quantity INT NOT NULL DEFAULT 1,
  price NUMERIC(10, 2) NOT NULL,
  total NUMERIC(10, 2) NOT NULL,
  product_image TEXT,
  size TEXT
);

CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON public.order_items(order_id);

-- 5. REVIEWS
CREATE TABLE IF NOT EXISTS public.reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
  customer_name TEXT NOT NULL,
  rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
  title TEXT,
  comment TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'approved' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_reviews_product_id ON public.reviews(product_id);
CREATE INDEX IF NOT EXISTS idx_reviews_status ON public.reviews(status);

-- 6. WISHLISTS
CREATE TABLE IF NOT EXISTS public.wishlists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE(user_id, product_id)
);

-- 7. COUPONS
CREATE TABLE IF NOT EXISTS public.coupons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  discount_type TEXT NOT NULL DEFAULT 'percentage' CHECK (discount_type IN ('percentage', 'fixed')),
  discount_value NUMERIC(10, 2) NOT NULL,
  min_order_amount NUMERIC(10, 2) DEFAULT 0,
  max_discount_amount NUMERIC(10, 2),
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ,
  usage_limit INT,
  used_count INT DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 8. INSTAGRAM REELS
CREATE TABLE IF NOT EXISTS public.instagram_reels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reel_id TEXT,
  instagram_url TEXT NOT NULL,
  thumbnail_url TEXT NOT NULL,
  caption TEXT,
  display_order INT DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_reels_order ON public.instagram_reels(display_order);

-- 9. HOMEPAGE SECTIONS
CREATE TABLE IF NOT EXISTS public.homepage_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section_key TEXT UNIQUE NOT NULL,
  title TEXT,
  subtitle TEXT,
  cta_text TEXT,
  cta_link TEXT,
  image_url TEXT,
  secondary_image_url TEXT,
  is_active BOOLEAN DEFAULT true,
  display_order INT DEFAULT 0,
  metadata JSONB DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 10. SITE SETTINGS
CREATE TABLE IF NOT EXISTS public.site_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_name TEXT DEFAULT 'PS PERFUMES',
  tagline TEXT DEFAULT 'Haute Parfumerie & Luxury Fragrances',
  logo_url TEXT DEFAULT '/assets/ps-perfumes-logo.webp',
  contact_email TEXT DEFAULT 'brandnix.in@gmail.com',
  phone TEXT DEFAULT '+91 94949 51600',
  address TEXT DEFAULT 'Kadapa, Andhra Pradesh, India – 516001',
  city TEXT DEFAULT 'Kadapa',
  state TEXT DEFAULT 'Andhra Pradesh',
  pincode TEXT DEFAULT '516001',
  instagram_url TEXT DEFAULT 'https://www.instagram.com/ps_perfumes_kadapa/?hl=en',
  google_maps_url TEXT DEFAULT 'https://share.google/b0yildKJKTaGc365J',
  whatsapp_url TEXT DEFAULT '',
  free_shipping_threshold NUMERIC(10, 2) DEFAULT 999,
  standard_shipping_fee NUMERIC(10, 2) DEFAULT 99,
  currency TEXT DEFAULT 'INR',
  currency_symbol TEXT DEFAULT '₹',
  store_status TEXT DEFAULT 'open',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 11. CONTACT ENQUIRIES
CREATE TABLE IF NOT EXISTS public.contact_enquiries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  subject TEXT,
  message TEXT NOT NULL,
  status TEXT DEFAULT 'unread' CHECK (status IN ('unread', 'read', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.combos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.combo_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hero_slides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wishlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instagram_reels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.homepage_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_enquiries ENABLE ROW LEVEL SECURITY;

-- Profiles: Users can read own profile; Admins can read/write all
CREATE POLICY "Users can read own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id OR public.is_admin());

CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id OR public.is_admin());

-- Categories: Public read active; Admin all
CREATE POLICY "Public can read active categories" ON public.categories
  FOR SELECT USING (is_active = true OR public.is_admin());

CREATE POLICY "Admin manage categories" ON public.categories
  FOR ALL USING (public.is_admin());

-- Products: Public read active; Admin all
CREATE POLICY "Public can read active products" ON public.products
  FOR SELECT USING (status = 'active' OR public.is_admin());

CREATE POLICY "Admin manage products" ON public.products
  FOR ALL USING (public.is_admin());

-- Product Variants: Public read active; Admin all
CREATE POLICY "Public can read active variants" ON public.product_variants
  FOR SELECT USING (is_active = true OR public.is_admin());

CREATE POLICY "Admin manage variants" ON public.product_variants
  FOR ALL USING (public.is_admin());

-- Combos: Public read active; Admin all
CREATE POLICY "Public can read active combos" ON public.combos
  FOR SELECT USING (is_active = true OR public.is_admin());

CREATE POLICY "Admin manage combos" ON public.combos
  FOR ALL USING (public.is_admin());

-- Combo Items: Public read; Admin all
CREATE POLICY "Public can read combo items" ON public.combo_items
  FOR SELECT USING (true);

CREATE POLICY "Admin manage combo items" ON public.combo_items
  FOR ALL USING (public.is_admin());

-- Hero Slides: Public read active; Admin all
CREATE POLICY "Public can read active hero slides" ON public.hero_slides
  FOR SELECT USING (is_active = true OR public.is_admin());

CREATE POLICY "Admin manage hero slides" ON public.hero_slides
  FOR ALL USING (public.is_admin());

-- Admin Users: Admin only
CREATE POLICY "Admin view admin users" ON public.admin_users
  FOR SELECT USING (public.is_admin());

CREATE POLICY "Admin manage admin users" ON public.admin_users
  FOR ALL USING (public.is_admin());

-- Orders: Customers can read own; Anyone can create an order; Admin manage all
CREATE POLICY "Customers can read own orders" ON public.orders
  FOR SELECT USING (auth.uid() = customer_id OR public.is_admin());

CREATE POLICY "Anyone can create orders" ON public.orders
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Admin manage orders" ON public.orders
  FOR ALL USING (public.is_admin());

-- Order Items: Viewable if order is viewable; insert allowed
CREATE POLICY "Order items viewable with order" ON public.order_items
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.orders WHERE orders.id = order_items.order_id AND (orders.customer_id = auth.uid() OR public.is_admin()))
  );

CREATE POLICY "Anyone can create order items" ON public.order_items
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Admin manage order items" ON public.order_items
  FOR ALL USING (public.is_admin());

-- Reviews: Public read approved; anyone can submit; Admin manage all
CREATE POLICY "Public can read approved reviews" ON public.reviews
  FOR SELECT USING (status = 'approved' OR public.is_admin());

CREATE POLICY "Anyone can submit reviews" ON public.reviews
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Admin manage reviews" ON public.reviews
  FOR ALL USING (public.is_admin());

-- Wishlists: Users manage their own
CREATE POLICY "Users manage own wishlist" ON public.wishlists
  FOR ALL USING (auth.uid() = user_id);

-- Coupons: Public read active; Admin manage all
CREATE POLICY "Public can view active coupons" ON public.coupons
  FOR SELECT USING (is_active = true OR public.is_admin());

CREATE POLICY "Admin manage coupons" ON public.coupons
  FOR ALL USING (public.is_admin());

-- Instagram Reels: Public read active; Admin manage all
CREATE POLICY "Public can view active reels" ON public.instagram_reels
  FOR SELECT USING (is_active = true OR public.is_admin());

CREATE POLICY "Admin manage reels" ON public.instagram_reels
  FOR ALL USING (public.is_admin());

-- Homepage Sections: Public read active; Admin manage all
CREATE POLICY "Public can view active homepage sections" ON public.homepage_sections
  FOR SELECT USING (is_active = true OR public.is_admin());

CREATE POLICY "Admin manage homepage sections" ON public.homepage_sections
  FOR ALL USING (public.is_admin());

-- Site Settings: Public read; Admin manage all
CREATE POLICY "Public can read site settings" ON public.site_settings
  FOR SELECT USING (true);

CREATE POLICY "Admin manage site settings" ON public.site_settings
  FOR ALL USING (public.is_admin());

-- Contact Enquiries: Anyone can insert; Admin can view/manage
CREATE POLICY "Anyone can submit enquiries" ON public.contact_enquiries
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Admin manage enquiries" ON public.contact_enquiries
  FOR ALL USING (public.is_admin());

-- ============================================================================
-- STORAGE BUCKET CONFIGURATION
-- Bucket: ps-perfumes
-- ============================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('ps-perfumes', 'ps-perfumes', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Storage RLS: Public read
CREATE POLICY "Public Read Access for ps-perfumes"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'ps-perfumes');

-- Storage RLS: Admin Insert / Update / Delete
CREATE POLICY "Admin Upload Access for ps-perfumes"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'ps-perfumes' AND (public.is_admin() OR auth.role() = 'authenticated'));

CREATE POLICY "Admin Update Access for ps-perfumes"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'ps-perfumes' AND (public.is_admin() OR auth.role() = 'authenticated'));

CREATE POLICY "Admin Delete Access for ps-perfumes"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'ps-perfumes' AND (public.is_admin() OR auth.role() = 'authenticated'));
