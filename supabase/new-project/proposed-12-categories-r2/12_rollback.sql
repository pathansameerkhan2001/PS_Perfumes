-- ============================================================================
-- PS PERFUMES — ROLLBACK OF STEP 12 (either version: 12_categories.sql or revision 2, 12r2_categories.sql)
-- Copied unchanged from proposed-12-categories/. Revision 2 logs only created and adopted rows,
-- so the product and reactivation steps below find nothing to undo.
-- Target: ps-perfumes-production (project ref pwacxxrghlglvdtclbig)
-- Status: PROPOSED. NOT APPLIED. Run only after separate written approval, manually, in the SQL
--         Editor of the project above.
--
-- The storefront and admin code work with and without step 12, so no code needs reverting first.
--
-- What it does
--   Puts every product the migration moved back in its fragrance family, unless an admin has
--   moved it since (that later choice is kept).
--   Reactivates the families the migration made inactive, and restores the adopted categories'
--   positions. Deletes the categories the migration created. Removes the guards, parent_id and
--   the log table.
--
-- It stops, changing nothing, when
--   * a product sits in a category the migration created and was not put there by the migration
--     (an admin assigned it later): move it to a family first, or it would lose its category;
--   * a category the migration did not create is a subcategory (an admin made it later): it would
--     silently become a main category.
--
-- Lost on purpose: names, images and descriptions given to the created categories after the run.
-- One transaction: on any error nothing changes. To undo this rollback, run 12_categories.sql again.
-- ============================================================================

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $$
begin
  if to_regclass('public.category_migration_12_log') is null
     or not exists (select 1 from pg_attribute where attrelid = 'public.categories'::regclass
                      and attname = 'parent_id' and not attisdropped) then
    raise exception 'Step 12 is not applied, or was already rolled back. Nothing was changed.';
  end if;
end $$;

lock table public.categories in share row exclusive mode;

do $$
declare
  v_list text;
begin
  select string_agg(p.name, ', ' order by p.name) into v_list
    from public.products p
    join public.category_migration_12_log c on c.action = 'created' and c.category_id = p.category_id
   where not exists (select 1 from public.category_migration_12_log m
                      where m.action = 'moved' and m.product_id = p.id and m.new_category_id = p.category_id);
  if v_list is not null then
    raise exception 'These products were placed in a new category after the migration: %. Move them to a fragrance family first. Nothing was changed.', left(v_list, 400);
  end if;

  select string_agg(c.name, ', ' order by c.name) into v_list
    from public.categories c
   where c.parent_id is not null
     and not exists (select 1 from public.category_migration_12_log l
                      where l.action in ('created', 'adopted') and l.category_id = c.id);
  if v_list is not null then
    raise exception 'These subcategories were made after the migration: %. Delete them or make them main categories first. Nothing was changed.', left(v_list, 400);
  end if;
end $$;

-- Guards first: the created categories are deleted below
drop trigger ps_categories_delete_guard on public.categories;
drop trigger ps_categories_tree_guard on public.categories;
drop function public.ps_categories_delete_guard();
drop function public.ps_categories_tree_guard();

update public.products p set category_id = l.old_category_id
  from public.category_migration_12_log l
 where l.action = 'moved' and l.product_id = p.id and p.category_id = l.new_category_id;

update public.categories c set is_active = l.old_is_active
  from public.category_migration_12_log l
 where l.action = 'deactivated' and l.category_id = c.id;

update public.categories c set display_order = l.old_display_order, parent_id = null
  from public.category_migration_12_log l
 where l.action = 'adopted' and l.category_id = c.id;

-- Subcategories before main categories (parent_id is ON DELETE RESTRICT)
delete from public.categories c using public.category_migration_12_log l
 where l.action = 'created' and l.category_id = c.id and c.parent_id is not null;
delete from public.categories c using public.category_migration_12_log l
 where l.action = 'created' and l.category_id = c.id;

alter table public.categories drop constraint categories_parent_not_self;
alter table public.categories drop column parent_id;
drop table public.category_migration_12_log;

do $$
begin
  if exists (select 1 from pg_attribute where attrelid = 'public.categories'::regclass
               and attname = 'parent_id' and not attisdropped) then
    raise exception 'parent_id is still present — nothing was changed';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.categories'::regclass) then
    raise exception 'RLS is off on categories — nothing was changed';
  end if;
end $$;

notify pgrst, 'reload schema';

commit;
