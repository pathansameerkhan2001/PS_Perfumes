-- ============================================================================
-- PS PERFUMES — STEP 12 revision 2: READ-ONLY checks (changes nothing).
-- Before the migration: lists the current categories and which requested slugs already exist.
-- After it: the tree, with product counts, and every check row should be ok = true.
-- ============================================================================

-- 1. Requested structure against what exists now (adopted = already there, created = new)
with wanted(parent_slug, slug) as (
  values
    (null, 'perfumes'), (null, 'attars'), (null, 'home-fragrance'), (null, 'body-care'),
    ('perfumes', 'arabic-perfumes'), ('perfumes', 'designer-inspired-perfumes'), ('perfumes', 'luxury-perfumes'),
    ('attars', 'musk-attars'), ('attars', 'oud-attars'), ('attars', 'floral-attars'), ('attars', 'woody-attars'),
    ('home-fragrance', 'bakhoor'), ('home-fragrance', 'incense-sticks'), ('home-fragrance', 'room-fragrances'),
    ('body-care', 'body-lotions'), ('body-care', 'body-mists'), ('body-care', 'body-oils'), ('body-care', 'personal-care')
)
select w.parent_slug, w.slug,
       c.name, c.is_active,
       case when c.id is null then 'will be created' else 'exists (adopted as it is)' end as status,
       (select count(*) from public.products p where p.category_id = c.id) as products
  from wanted w
  left join public.categories c on lower(c.slug) = w.slug
 order by w.parent_slug nulls first, w.slug;

-- 2. Categories outside the requested structure (left unchanged by the migration)
select c.name, c.slug, c.is_active, (select count(*) from public.products p where p.category_id = c.id) as products
  from public.categories c
 where lower(c.slug) not in ('perfumes', 'attars', 'home-fragrance', 'body-care',
   'arabic-perfumes', 'designer-inspired-perfumes', 'luxury-perfumes',
   'musk-attars', 'oud-attars', 'floral-attars', 'woody-attars',
   'bakhoor', 'incense-sticks', 'room-fragrances',
   'body-lotions', 'body-mists', 'body-oils', 'personal-care')
 order by c.display_order, c.name;

-- 3. After the migration (ok = true on every row; before it, parent_id is missing)
select 'parent_id column' as check_name,
       exists (select 1 from pg_attribute where attrelid = 'public.categories'::regclass
                 and attname = 'parent_id' and not attisdropped) as ok
union all
select 'categories RLS enabled', (select relrowsecurity from pg_class where oid = 'public.categories'::regclass)
union all
select 'migration log present', to_regclass('public.category_migration_12_log') is not null;
