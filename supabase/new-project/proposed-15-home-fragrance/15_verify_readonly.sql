-- ============================================================================
-- PS PERFUMES — Home Fragrance products and homepage flags: READ-ONLY checks.
-- Changes nothing (SELECT only). Run in the Supabase SQL Editor, which also sees inactive rows.
--
-- No migration is needed for the November 2026 product-configuration change:
--   * Home Fragrance variants use the existing product_variants columns
--       bottle_type = option (package / pack / material — "Standard" when there is none)
--       size_ml     = size   (e.g. "50 g", "20 sticks", "Medium")
--     plus the existing price, sale_price, stock_quantity and sku columns.
--   * The product type (perfume / attar / bakhoor / incense / burner / home) is kept in the
--     existing products.fragrance_notes JSON (key "product_type").
--   * Homepage sections read the existing is_bestseller / is_new_arrival / is_featured flags.
-- ============================================================================

-- 1. Home Fragrance and its subcategories (expect: Home Fragrance as a main category with
--    Bakhoor, Incense Sticks and Bakhoor Burners as its children; no duplicates)
select m.name as main_category, m.slug as main_slug, m.is_active as main_active,
       c.name as subcategory, c.slug as sub_slug, c.is_active as sub_active, c.display_order,
       (select count(*) from public.products p where p.category_id = c.id) as products
  from public.categories m
  left join public.categories c on c.parent_id = m.id
 where m.parent_id is null
   and lower(m.slug) = 'home-fragrance'
 order by c.display_order, c.name;

-- 2. Possible duplicates of the three subcategories anywhere in the tree (expect one row each)
select lower(trim(c.name)) as name_key, count(*) as rows,
       string_agg(c.slug || coalesce(' (parent ' || p.slug || ')', ' (main)'), ', ') as where_found
  from public.categories c
  left join public.categories p on p.id = c.parent_id
 where lower(c.name) similar to '%(bakhoor|incense|incence|burner)%'
 group by 1
 order by 1;

-- 3. Slugs used more than once (expect no rows)
select lower(slug) as slug, count(*) from public.categories group by 1 having count(*) > 1;

-- 4. Homepage flags: what each section will show (only flagged, active products)
select 'Best Sellers' as section, count(*) filter (where is_active and is_bestseller) as shown,
       count(*) filter (where is_bestseller and not is_active) as flagged_but_inactive
  from public.products
union all
select 'New Arrivals', count(*) filter (where is_active and is_new_arrival),
       count(*) filter (where is_new_arrival and not is_active)
  from public.products
union all
select 'Featured Products', count(*) filter (where is_active and is_featured),
       count(*) filter (where is_featured and not is_active)
  from public.products;

-- 5. Home Fragrance products with their variants as the storefront will offer them
select p.name, c.name as category, p.is_active,
       p.fragrance_notes ->> 'product_type' as product_type,
       v.bottle_type as option, v.size_ml as size, v.price, v.sale_price, v.stock_quantity, v.sku,
       v.is_active as variant_active
  from public.products p
  join public.categories c on c.id = p.category_id
  left join public.product_variants v on v.product_id = p.id
 where c.slug = 'home-fragrance'
    or c.parent_id = (select id from public.categories where lower(slug) = 'home-fragrance' limit 1)
 order by p.name, v.size_ml, v.bottle_type;

-- 6. Variant labels that could collide within one product (same option and size; expect no rows)
select p.name, lower(v.bottle_type) as option, lower(replace(v.size_ml, ' ', '')) as size, count(*)
  from public.product_variants v
  join public.products p on p.id = v.product_id
 group by p.name, 2, 3
having count(*) > 1;

-- 7. Perfume / Attar variants are unchanged: bottle and size labels in use (expect only
--    Glass Bottle / PVC Bottle and "<n> ml" outside Home Fragrance)
select v.bottle_type, v.size_ml, count(*) as variants
  from public.product_variants v
  join public.products p on p.id = v.product_id
  join public.categories c on c.id = p.category_id
 where c.slug <> 'home-fragrance'
   and coalesce(c.parent_id::text, '') <> coalesce((select id::text from public.categories where lower(slug) = 'home-fragrance' limit 1), '-')
 group by 1, 2
 order by 1, 2;
