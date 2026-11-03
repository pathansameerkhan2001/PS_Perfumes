-- Migration 12 test fixture: one product per fragrance family plus the snapshot helpers.
-- Loaded after 07_seed_categories.sql and the step 10 seed, which adds 'attars' and 'sprays'.
-- Every name here is a test fixture, not catalogue data.
insert into public.products (id, name, slug, category_id, display_order)
select ('00000000-0000-0000-0000-0000000012' || lpad(n::text, 2, '0'))::uuid, 'T12 ' || fam, 't12-' || fam,
       (select id from public.categories where slug = fam), n
  from unnest(array['perfume', 'attar', 'woody', 'musky', 'oud', 'floral', 'bakhoor']) with ordinality as f(fam, n);
insert into public.products (id, name, slug) values ('00000000-0000-0000-0000-000000001299', 'T12 none', 't12-none');
insert into public.product_variants (product_id, bottle_type, size_ml, price, stock_quantity)
select id, 'Glass Bottle', '50 ml', 1499, 5 from public.products where slug like 't12-%';

create schema t12;

-- Everything except category_id and updated_at, which the migration is allowed to change
create function t12.products() returns text language sql as $$
  select md5(string_agg(concat_ws('|', id, name, slug, brand, description, short_description, main_image_url,
                                  main_image_path, fragrance_notes::text, ingredients, is_active, is_featured,
                                  is_bestseller, is_new_arrival, display_order, created_at), ',' order by id))
    from public.products $$;
create function t12.placement() returns text language sql as $$
  select md5(string_agg(id || ':' || coalesce(category_id::text, '-'), ',' order by id)) from public.products $$;
create function t12.categories() returns text language sql as $$
  select md5(string_agg(concat_ws('|', id, name, slug, description, image_url, image_path, display_order, is_active),
                        ',' order by id)) from public.categories $$;
create function t12.rows(p_table regclass) returns text language plpgsql as $$
declare v text;
begin
  execute format('select md5(coalesce(string_agg(t::text, %L order by t::text), %L)) from %s t', ',', '', p_table) into v;
  return v;
end $$;
create function t12.other_data() returns text language sql as $$
  select concat_ws(' ', t12.rows('public.product_variants'), t12.rows('public.product_images'), t12.rows('public.orders'),
                   t12.rows('public.order_items'), t12.rows('public.coupons'), t12.rows('public.customers'),
                   t12.rows('public.combos')) $$;
-- Every public function (body and privileges) except the two step 12 guards
create function t12.functions() returns text language sql as $$
  select md5(string_agg(p.oid::regprocedure::text || md5(p.prosrc) || coalesce(array_to_string(p.proacl, ','), ''),
                        ',' order by p.oid::regprocedure::text))
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and p.proname not in ('ps_categories_tree_guard', 'ps_categories_delete_guard') $$;
create function t12.policies() returns text language sql as $$
  select md5(string_agg(tablename || policyname || cmd || array_to_string(roles, ',') || coalesce(qual, '')
                        || coalesce(with_check, ''), ',' order by tablename, policyname))
    from pg_policies where schemaname = 'public' $$;
create function t12.grants() returns text language sql as $$
  select md5(string_agg(c.relname || c.relrowsecurity::text || coalesce(array_to_string(c.relacl, ','), ''),
                        ',' order by c.relname))
    from pg_class c
   where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and c.relname <> 'category_migration_12_log' $$;
create function t12.cat(p_product text) returns text language sql as $$
  select coalesce(c.slug, '-') from public.products p left join public.categories c on c.id = p.category_id
   where p.slug = p_product $$;
