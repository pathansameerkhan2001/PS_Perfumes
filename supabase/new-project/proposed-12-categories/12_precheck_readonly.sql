-- ============================================================================
-- PS PERFUMES — STEP 12 PRE-MIGRATION CHECK (READ-ONLY)
-- Target: ps-perfumes-production (project ref pwacxxrghlglvdtclbig)
-- Status: PROPOSED. One SELECT; it changes nothing and takes no blocking lock.
--
-- Run the whole file BEFORE 12_categories.sql and export the grid. Continue only when every row
-- with ok = false has been resolved, and save the counts to compare after the migration.
-- ok: true = safe, false = stop, null = information.
-- Section 3 is the move plan: read it before approving. SQL cannot see the backup: confirm it separately.
-- ============================================================================

with
moves(from_slug, to_slug) as (
  values ('perfume', 'perfumes'), ('attar', 'attars'), ('woody', 'attars'),
         ('musky', 'musk-attars'), ('oud', 'oud-attars'), ('floral', 'floral-attars')
),
tree(slug) as (
  values ('perfumes'), ('attars'), ('home-fragrance'), ('body-care'),
         ('arabic-perfumes'), ('designer-inspired-perfumes'), ('luxury-perfumes'),
         ('arabic-attars'), ('oud-attars'), ('musk-attars'), ('floral-attars'), ('traditional-attars'),
         ('bakhoor'), ('incense-sticks'), ('bakhoor-burners'),
         ('perfume-cream'), ('body-cream'), ('fragrance-cream')
)
select * from (
  select '1 step 12 not started' as section, 'categories.parent_id does not exist yet' as check_name,
         not exists (select 1 from pg_attribute where attrelid = 'public.categories'::regclass
                       and attname = 'parent_id' and not attisdropped) as ok,
         'expect true' as detail
  union all
  select '1 step 12 not started', 'category_migration_12_log does not exist yet',
         to_regclass('public.category_migration_12_log') is null, 'expect true'
  union all
  select '1 step 12 not started', 'no step 12 guard function exists yet',
         to_regprocedure('public.ps_categories_tree_guard()') is null
           and to_regprocedure('public.ps_categories_delete_guard()') is null, 'expect true'

  union all
  select '2 categories', 'no two categories share a slug ignoring case',
         not exists (select lower(slug) from public.categories group by 1 having count(*) > 1),
         coalesce((select string_agg(s, ', ') from (select lower(slug) s from public.categories group by 1 having count(*) > 1) d), 'none')
  union all
  select '2 categories', 'categories RLS on with the public read policy',
         (select relrowsecurity from pg_class where oid = 'public.categories'::regclass)
           and exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'categories'
                         and policyname = 'ps_public_read_categories'),
         'expect true'
  union all
  select '2 categories', 'new slugs that already exist and will be adopted (expect bakhoor)', null,
         coalesce((select string_agg(c.slug || ' (' || c.name || ')', ', ' order by c.slug)
                     from public.categories c join tree t on lower(c.slug) = t.slug), 'none')
  union all
  select '2 categories', 'all categories now (slug: products, active)', null,
         (select string_agg(c.slug || ': ' || (select count(*) from public.products p where p.category_id = c.id)
                            || case when c.is_active then '' else ' inactive' end, ', ' order by c.display_order, c.slug)
            from public.categories c)

  union all
  select '3 move plan', m.from_slug || ' → ' || m.to_slug, null,
         coalesce((select count(*)::text || ' product(s)' from public.products p
                     join public.categories c on c.id = p.category_id and lower(c.slug) = m.from_slug), '0 product(s)')
    from moves m
  union all
  select '3 move plan', 'products not moved: no category', null,
         (select count(*)::text from public.products where category_id is null)
  union all
  select '3 move plan', 'products not moved: other categories', null,
         (select count(*)::text from public.products p join public.categories c on c.id = p.category_id
           where lower(c.slug) not in (select from_slug from moves))

  union all
  select '4 locking', 'no transaction open for over 1 minute',
         not exists (select 1 from pg_stat_activity where datname = current_database() and pid <> pg_backend_pid()
                       and xact_start < now() - interval '1 minute'),
         (select count(*)::text from pg_stat_activity where datname = current_database() and pid <> pg_backend_pid()
            and xact_start < now() - interval '1 minute')

  union all
  select '5 record these', 'categories', null, (select count(*)::text from public.categories)
  union all
  select '5 record these', 'products (active / all)', null,
         (select count(*) filter (where is_active)::text || ' / ' || count(*)::text from public.products)
  union all
  select '5 record these', 'variants / images', null,
         (select count(*) from public.product_variants)::text || ' / ' || (select count(*) from public.product_images)::text
  union all
  select '5 record these', 'orders / order_items', null,
         (select count(*) from public.orders)::text || ' / ' || (select count(*) from public.order_items)::text
  union all
  select '5 record these', 'latest order update (must not move because of the migration)', null,
         (select coalesce(max(updated_at)::text, 'none') from public.orders)
) checks
order by section, check_name;
