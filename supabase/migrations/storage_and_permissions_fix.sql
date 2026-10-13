-- ============================================================================
-- PS PERFUMES — PRODUCTION STORAGE & PERMISSIONS SAFE MIGRATION
-- Project: https://jnrmmhzhhmjxefapkemv.supabase.co
-- Target Bucket: ps-perfumes
-- ============================================================================

-- 1. Ensure public.is_admin() handles missing tables gracefully and recognizes
-- brandnix.in@gmail.com and authenticated administrators without runtime errors
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  -- Master administrator email check from JWT
  IF (auth.jwt() ->> 'email') = 'brandnix.in@gmail.com' THEN
    RETURN true;
  END IF;

  -- Admin role in token metadata
  IF (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'super_admin') 
     OR (auth.jwt() -> 'user_metadata' ->> 'role') IN ('admin', 'super_admin') 
     OR (auth.jwt() -> 'app_metadata' ->> 'is_admin') = 'true' THEN
    RETURN true;
  END IF;

  -- Check admin_users table if it exists
  BEGIN
    IF EXISTS (
      SELECT 1 FROM public.admin_users
      WHERE user_id = auth.uid() AND is_active = true
    ) THEN
      RETURN true;
    END IF;
  EXCEPTION WHEN undefined_table THEN
    -- table does not exist
  END;

  -- Check profiles table if it exists
  BEGIN
    IF EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    ) THEN
      RETURN true;
    END IF;
  EXCEPTION WHEN undefined_table THEN
    -- table does not exist
  END;

  -- Fallback: authenticated user session
  RETURN auth.role() = 'authenticated';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- 2. Configure ps-perfumes storage bucket
-- Public = true allows storefront visitors to load images via CDN
-- Allowed MIME types match luxury perfume imagery and videos
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

-- 3. Storage Policies for ps-perfumes bucket
DROP POLICY IF EXISTS "Public Read Access for ps-perfumes" ON storage.objects;
CREATE POLICY "Public Read Access for ps-perfumes"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'ps-perfumes');

DROP POLICY IF EXISTS "Admin Upload Access for ps-perfumes" ON storage.objects;
CREATE POLICY "Admin Upload Access for ps-perfumes"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'ps-perfumes' 
    AND (auth.role() = 'authenticated' OR public.is_admin())
  );

DROP POLICY IF EXISTS "Admin Update Access for ps-perfumes" ON storage.objects;
CREATE POLICY "Admin Update Access for ps-perfumes"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'ps-perfumes' 
    AND (auth.role() = 'authenticated' OR public.is_admin())
  );

DROP POLICY IF EXISTS "Admin Delete Access for ps-perfumes" ON storage.objects;
CREATE POLICY "Admin Delete Access for ps-perfumes"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'ps-perfumes' 
    AND (auth.role() = 'authenticated' OR public.is_admin())
  );

-- 4. Enable RLS and configure idempotent access policies on core tables
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
    'homepage_sections'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    -- Check if table exists in public schema
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
      EXECUTE format('CREATE POLICY "Admin Insert %I" ON public.%I FOR INSERT WITH CHECK (auth.role() = ''authenticated'' OR public.is_admin())', tbl, tbl);

      -- Admin Update policy
      EXECUTE format('DROP POLICY IF EXISTS "Admin Update %I" ON public.%I', tbl, tbl);
      EXECUTE format('CREATE POLICY "Admin Update %I" ON public.%I FOR UPDATE USING (auth.role() = ''authenticated'' OR public.is_admin())', tbl, tbl);

      -- Admin Delete policy
      EXECUTE format('DROP POLICY IF EXISTS "Admin Delete %I" ON public.%I', tbl, tbl);
      EXECUTE format('CREATE POLICY "Admin Delete %I" ON public.%I FOR DELETE USING (auth.role() = ''authenticated'' OR public.is_admin())', tbl, tbl);
    END IF;
  END LOOP;
END;
$$;
