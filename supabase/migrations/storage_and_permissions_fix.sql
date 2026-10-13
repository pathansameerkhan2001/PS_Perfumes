-- ============================================================================
-- PS PERFUMES — PRODUCTION STORAGE & PERMISSIONS SAFE MIGRATION
-- Project: https://jnrmmhzhhmjxefapkemv.supabase.co
-- Target Bucket: ps-perfumes
-- ============================================================================

-- 1. Ensure public.admin_users has a unique constraint on user_id
CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_users_user_id ON public.admin_users(user_id);

-- 2. Populate public.admin_users from existing auth.users for brandnix.in@gmail.com
-- and any administrative accounts so public.admin_users is populated
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
END $$;

-- 3. Automatic synchronization trigger on auth.users
-- Whenever an admin user registers or updates in auth.users, sync to public.admin_users
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

DROP TRIGGER IF EXISTS trg_sync_admin_user ON auth.users;
CREATE TRIGGER trg_sync_admin_user
  AFTER INSERT OR UPDATE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_admin_user_sync();

-- 4. Definitive, schema-accurate public.is_admin() function
-- Accurately verifies administrator privileges using:
--   a) Authenticated session verification (auth.role() = 'authenticated')
--   b) Direct lookup against auth.users table (matches brandnix.in@gmail.com)
--   c) JWT app_metadata / user_metadata claims (role IN ('admin', 'super_admin', 'editor'))
--   d) Atelier administrative email patterns (@psperfumes.com, admin@)
--   e) Exact live schema in public.admin_users (user_id, role, is_active)
-- Never references non-existent tables (e.g. public.profiles)
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

  -- 2. Extract email from JWT or directly from auth.users table
  v_email := lower(coalesce(
    auth.jwt() ->> 'email',
    (SELECT email FROM auth.users WHERE id = v_uid LIMIT 1),
    ''
  ));

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

  -- 6. Verified query against live public.admin_users table
  IF EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE user_id = v_uid
      AND is_active = true
      AND lower(coalesce(role, 'admin')) IN ('admin', 'super_admin', 'editor')
  ) THEN
    RETURN true;
  END IF;

  -- 7. Direct check on auth.users metadata
  IF EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = v_uid
      AND (
        lower(coalesce(raw_app_meta_data ->> 'role', '')) IN ('admin', 'super_admin', 'editor')
        OR lower(coalesce(raw_user_meta_data ->> 'role', '')) IN ('admin', 'super_admin', 'editor')
      )
  ) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- 5. Configure ps-perfumes storage bucket
-- Public = true allows storefront visitors to load images & videos via CDN
-- Allowed MIME types match luxury perfume imagery and videos (up to 50MB)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'ps-perfumes',
  'ps-perfumes',
  true,
  52428800, -- 50MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'video/mp4']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 52428800,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'video/mp4'];

-- 6. Clean wipe of ALL existing/stale storage.objects policies for ps-perfumes
-- Ensures no conflicting, broken, or restrictive policies remain
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

-- 7. Create narrowly scoped, definitive Storage Policies on storage.objects

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
    AND (storage.foldername(name))[1] IN ('products', 'hero', 'reels', 'categories', 'combos', 'logo', 'reviews', 'homepage', 'banners')
    AND public.is_admin()
  );

-- C. UPDATE: Restricted to authorized administrators; includes BOTH USING and WITH CHECK for upsert support
CREATE POLICY "ps_perfumes_update_policy"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'ps-perfumes'
    AND (storage.foldername(name))[1] IN ('products', 'hero', 'reels', 'categories', 'combos', 'logo', 'reviews', 'homepage', 'banners')
    AND public.is_admin()
  )
  WITH CHECK (
    bucket_id = 'ps-perfumes'
    AND (storage.foldername(name))[1] IN ('products', 'hero', 'reels', 'categories', 'combos', 'logo', 'reviews', 'homepage', 'banners')
    AND public.is_admin()
  );

-- D. DELETE: Restricted exclusively to authorized administrators
CREATE POLICY "ps_perfumes_delete_policy"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'ps-perfumes'
    AND (storage.foldername(name))[1] IN ('products', 'hero', 'reels', 'categories', 'combos', 'logo', 'reviews', 'homepage', 'banners')
    AND public.is_admin()
  );

-- 8. Enable RLS and configure idempotent access policies on core public tables
DO $$
DECLARE
  tbl text;
  tables text[] := ARRAY[
    'products',
    'product_variants',
    'categories',
    'hero_slides',
    'instagram_reels',
    'combos',
    'combo_items',
    'homepage_sections',
    'orders',
    'order_items',
    'coupons',
    'reviews',
    'store_settings'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = tbl
    ) THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);

      -- Public Read policy (storefront visitors)
      EXECUTE format('DROP POLICY IF EXISTS "Public Read %I" ON public.%I', tbl, tbl);
      EXECUTE format('CREATE POLICY "Public Read %I" ON public.%I FOR SELECT USING (true)', tbl, tbl);

      -- Admin Insert policy (restricted to administrators)
      EXECUTE format('DROP POLICY IF EXISTS "Admin Insert %I" ON public.%I', tbl, tbl);
      EXECUTE format('CREATE POLICY "Admin Insert %I" ON public.%I FOR INSERT WITH CHECK (public.is_admin())', tbl, tbl);

      -- Admin Update policy (restricted to administrators)
      EXECUTE format('DROP POLICY IF EXISTS "Admin Update %I" ON public.%I', tbl, tbl);
      EXECUTE format('CREATE POLICY "Admin Update %I" ON public.%I FOR UPDATE USING (public.is_admin())', tbl, tbl);

      -- Admin Delete policy (restricted to administrators)
      EXECUTE format('DROP POLICY IF EXISTS "Admin Delete %I" ON public.%I', tbl, tbl);
      EXECUTE format('CREATE POLICY "Admin Delete %I" ON public.%I FOR DELETE USING (public.is_admin())', tbl, tbl);
    END IF;
  END LOOP;
END;
$$;
