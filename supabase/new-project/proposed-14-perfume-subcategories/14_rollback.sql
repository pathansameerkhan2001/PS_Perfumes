-- ============================================================================
-- PS PERFUMES — ROLLBACK OF STEP 14 (Perfumes subcategories)
-- Status: PROPOSED. Run only after separate written approval.
--
-- Adopted rows get back their earlier parent, position and active status. Created rows are
-- deleted. It stops, changing nothing, if a product has been assigned to a created row since
-- (move it first, or it would lose its category; the delete guard of step 12 also refuses it).
-- ============================================================================

begin;

set local lock_timeout = '5s';

do $$
declare
  v_list text;
begin
  if to_regclass('public.category_migration_14_log') is null then
    raise exception 'Step 14 is not applied, or was already rolled back. Nothing was changed.';
  end if;
  select string_agg(p.name, ', ' order by p.name) into v_list
    from public.products p
    join public.category_migration_14_log l on l.action = 'created' and l.category_id = p.category_id;
  if v_list is not null then
    raise exception 'These products are in a subcategory created by step 14: %. Move them first. Nothing was changed.', left(v_list, 400);
  end if;
end $$;

lock table public.categories in share row exclusive mode;

update public.categories c
   set parent_id = l.old_parent_id, display_order = l.old_display_order, is_active = l.old_is_active
  from public.category_migration_14_log l
 where l.action = 'adopted' and l.category_id = c.id;

delete from public.categories c using public.category_migration_14_log l
 where l.action = 'created' and l.category_id = c.id;

drop table public.category_migration_14_log;

commit;
