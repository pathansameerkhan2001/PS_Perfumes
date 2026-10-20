-- ============================================================================
-- PS PERFUMES — NEW PROJECT: seed the seven fragrance categories
-- Target: ps-perfumes-production (project ref pwacxxrghlglvdtclbig)
-- Status: NOT APPLIED. Run manually in the SQL Editor after approval (after 01–04).
--
-- Why: 01_schema.sql creates public.categories empty. With no rows, Admin → Products cannot
-- save ("Category "Attar" does not exist in the categories table").
--
-- What it does
--   * Inserts Attar, Perfume, Bakhoor, Musky, Oud, Floral, Woody (the storefront's routes
--     /attar … /woody and their slugs), active, in menu order.
--   * Idempotent: a slug that already exists is left exactly as it is (ON CONFLICT DO NOTHING),
--     so re-running never duplicates or overwrites a category an admin has edited.
--   * description and image_url stay NULL on purpose: the storefront then uses each family's
--     built-in artwork and text until an admin sets their own in Admin → Categories.
-- It changes no other table and deletes nothing. RLS stays as it is (the SQL Editor role
-- bypasses it; visitors can still only read active categories).
--
-- Alternative without SQL: create the same seven categories in Admin → Categories
-- (name + slug exactly as below).
-- ============================================================================

begin;

do $$
begin
  if to_regclass('public.categories') is null then
    raise exception 'public.categories does not exist — run 01_schema.sql first';
  end if;
end $$;

insert into public.categories (name, slug, display_order, is_active)
values
  ('Attar',   'attar',   1, true),
  ('Perfume', 'perfume', 2, true),
  ('Bakhoor', 'bakhoor', 3, true),
  ('Musky',   'musky',   4, true),
  ('Oud',     'oud',     5, true),
  ('Floral',  'floral',  6, true),
  ('Woody',   'woody',   7, true)
on conflict (slug) do nothing;

commit;

-- Verify (read-only):
--   select name, slug, display_order, is_active from public.categories order by display_order;
-- Expected: the seven rows above (plus any categories that already existed).
