-- ============================================================================
-- PS PERFUMES — PRODUCTION STORAGE & PERMISSIONS SAFE MIGRATION
-- Project URL: https://jnrmmhzhhmjxefapkemv.supabase.co
-- Target Storage Bucket: ps-perfumes
-- Primary Admin: brandnix.in@gmail.com
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Ensure public.admin_users has a unique constraint on user_id
-- ----------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_users_user_id ON public.admin_users(user_id);

-- ----------------------------------------------------------------------------
-- 2. Populate public.admin_users from auth.users for brandnix.in@gmail.com
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'auth' AND table_name = 'users') THEN
    INSERT INTO public.admin_users (user_id, role, is_active)
    SELECT id, 'super_admin', true
    FROM auth.users
    WHERE lower(email) = 'brandnix.in@gmail.com'
       OR lower(email) LIKE '%@psperfumes.com'
       OR lower(coalesce(raw_app_meta_data ->> 'role', '')) IN ('admin', 'super_admin', 'editor')
    ON CONFLICT (user_id) DO UPDATE SET
      role = 'super_admin',
      is_active = true,
      updated_at = now();
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Notice on admin_users seed: %', SQLERRM;
END $$;

-- ----------------------------------------------------------------------------
-- 3. Automatic synchronization trigger on auth.users
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_admin_user_sync()
RETURNS TRIGGER AS $$
BEGIN
  IF lower(NEW.email) = 'brandnix.in@gmail.com'
     OR lower(NEW.email) LIKE '%@psperfumes.com'
     OR lower(coalesce(NEW.raw_app_meta_data ->> 'role', '')) IN ('admin', 'super_admin', 'editor') THEN
    INSERT INTO public.admin_users (user_id, role, is_active)
    VALUES (NEW.id, 'super_admin', true)
    ON CONFLICT (user_id) DO UPDATE SET
      role = 'super_admin',
      is_active = true,
      updated_at = now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DO $$
BEGIN
  DROP TRIGGER IF EXISTS trg_sync_admin_user ON auth.users;
  CREATE TRIGGER trg_sync_admin_user
    AFTER INSERT OR UPDATE ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_admin_user_sync();
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Notice on auth.users trigger: %', SQLERRM;
END $$;

-- ----------------------------------------------------------------------------
-- 4. Definitive, schema-accurate public.is_admin() function
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
DECLARE
  v_uid UUID;
  v_email TEXT;
BEGIN
  -- 1. Caller must be authenticated
  IF auth.role() IS NULL OR auth.role() != 'authenticated' THEN
    RETURN false;
  END IF;

  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN false;
  END IF;

  -- 2. Extract email from JWT claims (immediate, 0 table dependencies)
  v_email := lower(coalesce(auth.jwt() ->> 'email', ''));

  -- 3. Master administrator email check
  IF v_email = 'brandnix.in@gmail.com' THEN
    RETURN true;
  END IF;

  -- 4. Administrative email domain / prefix check
  IF v_email LIKE '%@psperfumes.com' OR v_email LIKE 'admin@%' THEN
    RETURN true;
  END IF;

  -- 5. JWT metadata claims check
  IF lower(coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '')) IN ('admin', 'super_admin', 'editor')
     OR lower(coalesce(auth.jwt() -> 'user_metadata' ->> 'role', '')) IN ('admin', 'super_admin', 'editor')
     OR (auth.jwt() -> 'app_metadata' ->> 'is_admin') = 'true'
     OR (auth.jwt() -> 'user_metadata' ->> 'is_admin') = 'true' THEN
    RETURN true;
  END IF;

  -- 6. Verified query against live public.admin_users table (id, user_id, role, is_active)
  IF EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE user_id = v_uid
      AND is_active = true
      AND lower(coalesce(role, 'admin')) IN ('admin', 'super_admin', 'editor')
  ) THEN
    RETURN true;
  END IF;

  -- 7. Direct fallback check on auth.users table
  BEGIN
    IF EXISTS (
      SELECT 1 FROM auth.users
      WHERE id = v_uid
        AND (
          lower(email) = 'brandnix.in@gmail.com'
          OR lower(email) LIKE '%@psperfumes.com'
          OR lower(coalesce(raw_app_meta_data ->> 'role', '')) IN ('admin', 'super_admin', 'editor')
        )
    ) THEN
      RETURN true;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ----------------------------------------------------------------------------
-- 5. Configure ps-perfumes Storage Bucket
-- ----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'ps-perfumes',
  'ps-perfumes',
  true,
  52428800, -- 50MB
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'video/mp4']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 52428800,
  allowed_mime_types = ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'video/mp4'];

-- ----------------------------------------------------------------------------
-- 6. Clean wipe of ALL existing/stale storage.objects policies for ps-perfumes
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN (
    SELECT policyname 
    FROM pg_policies 
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND (
        policyname ILIKE '%ps-perfumes%' 
        OR policyname ILIKE '%perfumes%'
        OR coalesce(qual, '') ILIKE '%ps-perfumes%'
        OR coalesce(with_check, '') ILIKE '%ps-perfumes%'
      )
  ) LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', pol.policyname);
  END LOOP;
END $$;

-- Explicitly drop known legacy policy names to guarantee a clean slate
DROP POLICY IF EXISTS "Admin Upload Access for ps-perfumes" ON storage.objects;
DROP POLICY IF EXISTS "Admin Update Access for ps-perfumes" ON storage.objects;
DROP POLICY IF EXISTS "Admin Delete Access for ps-perfumes" ON storage.objects;
DROP POLICY IF EXISTS "Public Read Access for ps-perfumes" ON storage.objects;
DROP POLICY IF EXISTS "ps_perfumes_select_policy" ON storage.objects;
DROP POLICY IF EXISTS "ps_perfumes_insert_policy" ON storage.objects;
DROP POLICY IF EXISTS "ps_perfumes_update_policy" ON storage.objects;
DROP POLICY IF EXISTS "ps_perfumes_delete_policy" ON storage.objects;

-- ----------------------------------------------------------------------------
-- 7. Create Narrowly Scoped, Definitive Storage Policies on storage.objects
-- ----------------------------------------------------------------------------

-- A. SELECT: Public Read allows storefront visitors, customers, and CDN to view all media
CREATE POLICY "ps_perfumes_select_policy"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'ps-perfumes');

-- B. INSERT: Restricted exclusively to authorized administrators for designated media folders
CREATE POLICY "ps_perfumes_insert_policy"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'ps-perfumes'
    AND (
      split_part(name, '/', 1) IN ('products', 'hero', 'reels', 'categories', 'combos', 'logo', 'reviews', 'homepage', 'banners')
      OR (storage.foldername(name))[1] IN ('products', 'hero', 'reels', 'categories', 'combos', 'logo', 'reviews', 'homepage', 'banners')
    )
    AND (
      public.is_admin()
      OR lower(coalesce(auth.jwt() ->> 'email', '')) = 'brandnix.in@gmail.com'
    )
  );

-- C. UPDATE: Restricted to authorized administrators; includes BOTH USING and WITH CHECK for upsert support
CREATE POLICY "ps_perfumes_update_policy"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'ps-perfumes'
    AND (
      split_part(name, '/', 1) IN ('products', 'hero', 'reels', 'categories', 'combos', 'logo', 'reviews', 'homepage', 'banners')
      OR (storage.foldername(name))[1] IN ('products', 'hero', 'reels', 'categories', 'combos', 'logo', 'reviews', 'homepage', 'banners')
    )
    AND (
      public.is_admin()
      OR lower(coalesce(auth.jwt() ->> 'email', '')) = 'brandnix.in@gmail.com'
    )
  )
  WITH CHECK (
    bucket_id = 'ps-perfumes'
    AND (
      split_part(name, '/', 1) IN ('products', 'hero', 'reels', 'categories', 'combos', 'logo', 'reviews', 'homepage', 'banners')
      OR (storage.foldername(name))[1] IN ('products', 'hero', 'reels', 'categories', 'combos', 'logo', 'reviews', 'homepage', 'banners')
    )
    AND (
      public.is_admin()
      OR lower(coalesce(auth.jwt() ->> 'email', '')) = 'brandnix.in@gmail.com'
    )
  );

-- D. DELETE: Restricted exclusively to authorized administrators
CREATE POLICY "ps_perfumes_delete_policy"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'ps-perfumes'
    AND (
      split_part(name, '/', 1) IN ('products', 'hero', 'reels', 'categories', 'combos', 'logo', 'reviews', 'homepage', 'banners')
      OR (storage.foldername(name))[1] IN ('products', 'hero', 'reels', 'categories', 'combos', 'logo', 'reviews', 'homepage', 'banners')
    )
    AND (
      public.is_admin()
      OR lower(coalesce(auth.jwt() ->> 'email', '')) = 'brandnix.in@gmail.com'
    )
  );

-- ----------------------------------------------------------------------------
-- 8. Enable RLS and Configure Policies on Core Catalog & Public Tables
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  tbl text;
  catalog_tables text[] := ARRAY[
    'products',
    'product_variants',
    'categories',
    'hero_slides',
    'instagram_reels',
    'combos',
    'combo_items',
    'homepage_sections',
    'coupons',
    'store_settings',
    'site_settings'
  ];
BEGIN
  FOREACH tbl IN ARRAY catalog_tables LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = tbl
    ) THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);

      -- Public Read policy (storefront visitors)
      EXECUTE format('DROP POLICY IF EXISTS "Public Read %I" ON public.%I', tbl, tbl);
      EXECUTE format('CREATE POLICY "Public Read %I" ON public.%I FOR SELECT USING (true)', tbl, tbl);

      -- Admin Insert policy
      EXECUTE format('DROP POLICY IF EXISTS "Admin Insert %I" ON public.%I', tbl, tbl);
      EXECUTE format('CREATE POLICY "Admin Insert %I" ON public.%I FOR INSERT WITH CHECK (public.is_admin() OR lower(coalesce(auth.jwt() ->> ''email'', '''')) = ''brandnix.in@gmail.com'')', tbl, tbl);

      -- Admin Update policy
      EXECUTE format('DROP POLICY IF EXISTS "Admin Update %I" ON public.%I', tbl, tbl);
      EXECUTE format('CREATE POLICY "Admin Update %I" ON public.%I FOR UPDATE USING (public.is_admin() OR lower(coalesce(auth.jwt() ->> ''email'', '''')) = ''brandnix.in@gmail.com'')', tbl, tbl);

      -- Admin Delete policy
      EXECUTE format('DROP POLICY IF EXISTS "Admin Delete %I" ON public.%I', tbl, tbl);
      EXECUTE format('CREATE POLICY "Admin Delete %I" ON public.%I FOR DELETE USING (public.is_admin() OR lower(coalesce(auth.jwt() ->> ''email'', '''')) = ''brandnix.in@gmail.com'')', tbl, tbl);
    END IF;
  END LOOP;
END;
$$;

-- ----------------------------------------------------------------------------
-- 9. Specialized RLS for Orders, Order Items, Reviews & Admin Users
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  -- A. Orders
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'orders') THEN
    ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Orders Select Policy" ON public.orders;
    CREATE POLICY "Orders Select Policy" ON public.orders FOR SELECT
      USING (customer_id = auth.uid() OR public.is_admin() OR lower(coalesce(auth.jwt() ->> 'email', '')) = 'brandnix.in@gmail.com');
    DROP POLICY IF EXISTS "Orders Insert Policy" ON public.orders;
    CREATE POLICY "Orders Insert Policy" ON public.orders FOR INSERT WITH CHECK (true);
    DROP POLICY IF EXISTS "Orders Update Policy" ON public.orders;
    CREATE POLICY "Orders Update Policy" ON public.orders FOR UPDATE
      USING (public.is_admin() OR lower(coalesce(auth.jwt() ->> 'email', '')) = 'brandnix.in@gmail.com');
    DROP POLICY IF EXISTS "Orders Delete Policy" ON public.orders;
    CREATE POLICY "Orders Delete Policy" ON public.orders FOR DELETE
      USING (public.is_admin() OR lower(coalesce(auth.jwt() ->> 'email', '')) = 'brandnix.in@gmail.com');
  END IF;

  -- B. Order Items
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'order_items') THEN
    ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Order Items Select Policy" ON public.order_items;
    CREATE POLICY "Order Items Select Policy" ON public.order_items FOR SELECT USING (true);
    DROP POLICY IF EXISTS "Order Items Insert Policy" ON public.order_items;
    CREATE POLICY "Order Items Insert Policy" ON public.order_items FOR INSERT WITH CHECK (true);
    DROP POLICY IF EXISTS "Order Items Update Policy" ON public.order_items;
    CREATE POLICY "Order Items Update Policy" ON public.order_items FOR UPDATE
      USING (public.is_admin() OR lower(coalesce(auth.jwt() ->> 'email', '')) = 'brandnix.in@gmail.com');
    DROP POLICY IF EXISTS "Order Items Delete Policy" ON public.order_items;
    CREATE POLICY "Order Items Delete Policy" ON public.order_items FOR DELETE
      USING (public.is_admin() OR lower(coalesce(auth.jwt() ->> 'email', '')) = 'brandnix.in@gmail.com');
  END IF;

  -- C. Reviews
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'reviews') THEN
    ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Reviews Select Policy" ON public.reviews;
    CREATE POLICY "Reviews Select Policy" ON public.reviews FOR SELECT
      USING (status = 'approved' OR public.is_admin() OR lower(coalesce(auth.jwt() ->> 'email', '')) = 'brandnix.in@gmail.com');
    DROP POLICY IF EXISTS "Reviews Insert Policy" ON public.reviews;
    CREATE POLICY "Reviews Insert Policy" ON public.reviews FOR INSERT WITH CHECK (true);
    DROP POLICY IF EXISTS "Reviews Update Policy" ON public.reviews;
    CREATE POLICY "Reviews Update Policy" ON public.reviews FOR UPDATE
      USING (public.is_admin() OR lower(coalesce(auth.jwt() ->> 'email', '')) = 'brandnix.in@gmail.com');
    DROP POLICY IF EXISTS "Reviews Delete Policy" ON public.reviews;
    CREATE POLICY "Reviews Delete Policy" ON public.reviews FOR DELETE
      USING (public.is_admin() OR lower(coalesce(auth.jwt() ->> 'email', '')) = 'brandnix.in@gmail.com');
  END IF;

  -- D. Admin Users
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'admin_users') THEN
    ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Admin Users Select Policy" ON public.admin_users;
    CREATE POLICY "Admin Users Select Policy" ON public.admin_users FOR SELECT
      USING (public.is_admin() OR lower(coalesce(auth.jwt() ->> 'email', '')) = 'brandnix.in@gmail.com');
    DROP POLICY IF EXISTS "Admin Users Insert Policy" ON public.admin_users;
    CREATE POLICY "Admin Users Insert Policy" ON public.admin_users FOR INSERT
      WITH CHECK (public.is_admin() OR lower(coalesce(auth.jwt() ->> 'email', '')) = 'brandnix.in@gmail.com');
    DROP POLICY IF EXISTS "Admin Users Update Policy" ON public.admin_users;
    CREATE POLICY "Admin Users Update Policy" ON public.admin_users FOR UPDATE
      USING (public.is_admin() OR lower(coalesce(auth.jwt() ->> 'email', '')) = 'brandnix.in@gmail.com');
    DROP POLICY IF EXISTS "Admin Users Delete Policy" ON public.admin_users;
    CREATE POLICY "Admin Users Delete Policy" ON public.admin_users FOR DELETE
      USING (public.is_admin() OR lower(coalesce(auth.jwt() ->> 'email', '')) = 'brandnix.in@gmail.com');
  END IF;
END $$;
