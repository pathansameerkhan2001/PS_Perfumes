-- ============================================================================
-- PS PERFUMES — STEP 12 POST-MIGRATION VERIFICATION (READ-ONLY)
-- Target: ps-perfumes-production (project ref pwacxxrghlglvdtclbig)
-- Status: PROPOSED. One read-only check, then one SELECT; it changes nothing.
--
-- NEVER RUN THIS BEFORE THE MIGRATION. Run the whole file only after 12_categories.sql has succeeded.
-- If it stops with "Migration 12 is not applied", the migration did not run: stop and review.
-- Every row with ok = false needs review. ok = null: compare with the pre-check export.
-- ============================================================================

do $$
begin
  if to_regclass('public.category_migration_12_log') is null
     or not exists (select 1 from pg_attribute where attrelid = 'public.categories'::regclass
                      and attname = 'parent_id' and not attisdropped) then
    raise exception 'Migration 12 is not applied, so nothing was verified. No data was changed.';
  end if;
end $$;

with
tree(parent_slug, slug) as (
  values (null, 'perfumes'), (null, 'attars'), (null, 'home-fragrance'), (null, 'body-care'),
         ('perfumes', 'arabic-perfumes'), ('perfumes', 'designer-inspired-perfumes'), ('perfumes', 'luxury-perfumes'),
         ('attars', 'arabic-attars'), ('attars', 'oud-attars'), ('attars', 'musk-attars'),
         ('attars', 'floral-attars'), ('attars', 'traditional-attars'),
         ('home-fragrance', 'bakhoor'), ('home-fragrance', 'incense-sticks'), ('home-fragrance', 'bakhoor-burners'),
         ('body-care', 'perfume-cream'), ('body-care', 'body-cream'), ('body-care', 'fragrance-cream')
),
retired(slug) as (values ('perfume'), ('attar'), ('woody'), ('musky'), ('oud'), ('floral')),
placed as (
  select t.slug, c.id, c.is_active, p.slug as actual_parent, t.parent_slug
    from tree t
    left join public.categories c on c.slug = t.slug
    left join public.categories p on p.id = c.parent_id
)
select * from (
  select '1 structure' as section, 'all 18 categories in place' as check_name,
         not exists (select 1 from placed where id is null or actual_parent is distinct from parent_slug) as ok,
         coalesce((select string_agg(slug, ', ') from placed where id is null or actual_parent is distinct from parent_slug),
                  'none misplaced') as detail
  union all
  select '1 structure', 'no category nested more than two levels',
         not exists (select 1 from public.categories c join public.categories p on p.id = c.parent_id
                      where p.parent_id is not null),
         'expect true'
  union all
  select '1 structure', 'no two categories share a slug ignoring case',
         not exists (select lower(slug) from public.categories group by 1 having count(*) > 1), 'expect true'
  union all
  select '1 structure', 'tree and delete guards enabled',
         (select count(*) = 2 from pg_trigger where tgrelid = 'public.categories'::regclass and tgenabled = 'O'
            and tgname in ('ps_categories_tree_guard', 'ps_categories_delete_guard')),
         'expect true'
  union all
  select '1 structure', 'inactive new categories (info; expect none)', null,
         coalesce((select string_agg(slug, ', ') from placed where is_active is false), 'none')

  union all
  select '2 products', 'no product left in a retired family',
         not exists (select 1 from public.products p join public.categories c on c.id = p.category_id
                      where lower(c.slug) in (select slug from retired)),
         'expect true'
  union all
  select '2 products', 'retired families are inactive',
         not exists (select 1 from public.categories c where lower(c.slug) in (select slug from retired) and c.is_active),
         coalesce((select string_agg(slug, ', ') from public.categories c
                    where lower(c.slug) in (select slug from retired) and c.is_active), 'none active')
  union all
  select '2 products', 'every move logged matches the product now',
         not exists (select 1 from public.category_migration_12_log l join public.products p on p.id = l.product_id
                      where l.action = 'moved' and p.category_id is distinct from l.new_category_id),
         (select count(*)::text || ' moved' from public.category_migration_12_log where action = 'moved')
  union all
  select '2 products', 'products per main category (info)', null,
         (select string_agg(m.slug || ': ' || (select count(*) from public.products p
                              join public.categories c on c.id = p.category_id
                             where c.id = m.id or c.parent_id = m.id), ', ' order by m.display_order)
            from public.categories m where m.parent_id is null and m.is_active)
  union all
  select '2 products', 'products in no active main category (info; owner to place them)', null,
         (select count(*)::text from public.products p
            left join public.categories c on c.id = p.category_id
            left join public.categories m on m.id = coalesce(c.parent_id, c.id)
           where m.id is null or not m.is_active or not c.is_active)

  union all
  select '3 security', 'categories RLS on with the public read policy',
         (select relrowsecurity from pg_class where oid = 'public.categories'::regclass)
           and exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'categories'
                         and policyname = 'ps_public_read_categories'),
         'expect true'
  union all
  select '3 security', 'migration log: RLS on, no policy, no grants',
         (select relrowsecurity from pg_class where oid = 'public.category_migration_12_log'::regclass)
           and not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'category_migration_12_log')
           and not (has_table_privilege('anon', 'public.category_migration_12_log', 'SELECT,INSERT,UPDATE,DELETE')
                 or has_table_privilege('authenticated', 'public.category_migration_12_log', 'SELECT,INSERT,UPDATE,DELETE')
                 or has_table_privilege('service_role', 'public.category_migration_12_log', 'SELECT,INSERT,UPDATE,DELETE')),
         'expect true'
  union all
  select '3 security', 'guard functions not callable by visitors or signed-in users',
         not (has_function_privilege('anon', 'public.ps_categories_tree_guard()', 'EXECUTE')
           or has_function_privilege('authenticated', 'public.ps_categories_tree_guard()', 'EXECUTE')
           or has_function_privilege('anon', 'public.ps_categories_delete_guard()', 'EXECUTE')
           or has_function_privilege('authenticated', 'public.ps_categories_delete_guard()', 'EXECUTE')),
         'expect true'

  union all
  select '4 compare with pre-check', 'categories', null, (select count(*)::text from public.categories)
  union all
  select '4 compare with pre-check', 'products (active / all)', null,
         (select count(*) filter (where is_active)::text || ' / ' || count(*)::text from public.products)
  union all
  select '4 compare with pre-check', 'variants / images', null,
         (select count(*) from public.product_variants)::text || ' / ' || (select count(*) from public.product_images)::text
  union all
  select '4 compare with pre-check', 'orders / order_items', null,
         (select count(*) from public.orders)::text || ' / ' || (select count(*) from public.order_items)::text
  union all
  select '4 compare with pre-check', 'latest order update (moves only with real order activity)', null,
         (select coalesce(max(updated_at)::text, 'none') from public.orders)
) checks
order by section, check_name;
