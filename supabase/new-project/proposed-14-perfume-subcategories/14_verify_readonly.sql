-- ============================================================================
-- PS PERFUMES — STEP 14 READ-ONLY checks (changes nothing). Run in the SQL Editor, which sees
-- inactive rows too (the public website does not).
-- Before step 14: section 1 shows which of the four slugs already exist (they will be adopted).
-- After step 14: section 2 lists Perfumes with its four active subcategories.
-- ============================================================================

-- 1. The requested slugs as they exist now (any parent, active or not), with their products
with wanted(slug, name, ord) as (
  values ('musky', 'Musky', 1), ('oud', 'Oud', 2), ('floral', 'Floral', 3), ('woody', 'Woody', 4)
)
select w.slug,
       c.name, c.is_active,
       p.slug as current_parent,
       case when c.id is null then 'will be created' else 'exists (will be adopted)' end as status,
       (select count(*) from public.products x where x.category_id = c.id) as products
  from wanted w
  left join public.categories c on lower(c.slug) = w.slug
  left join public.categories p on p.id = c.parent_id
 order by w.ord;

-- 2. The whole tree: main categories and their subcategories, with product counts
select coalesce(p.name, c.name) as main_category,
       case when c.parent_id is null then '' else c.name end as subcategory,
       c.slug, c.is_active, c.display_order,
       (select count(*) from public.products x where x.category_id = c.id) as products
  from public.categories c
  left join public.categories p on p.id = c.parent_id
 order by coalesce(p.display_order, c.display_order), coalesce(p.name, c.name),
          c.parent_id nulls first, c.display_order;

-- 3. Checks (after step 14 every ok is true)
select 'Perfumes has 4 active subcategories' as check_name,
       (select count(*) from public.categories c join public.categories p on p.id = c.parent_id
         where lower(p.slug) = 'perfumes' and lower(c.slug) in ('musky', 'oud', 'floral', 'woody') and c.is_active) = 4 as ok
union all
select 'step 14 log present', to_regclass('public.category_migration_14_log') is not null
union all
select 'no slug appears twice', not exists (select 1 from public.categories group by lower(slug) having count(*) > 1);
