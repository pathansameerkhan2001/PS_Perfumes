-- ============================================================================
-- PS PERFUMES — STEP 14: Perfumes subcategories (Musky, Oud, Floral, Woody)
-- Target: ps-perfumes-production (project ref pwacxxrghlglvdtclbig)
-- Status: PROPOSED. NOT APPLIED. Run only after written approval, manually, in the SQL Editor of
--         the project above. Requires step 12 (revision 2), which is applied (checked read-only
--         on 2026-11-04: categories.parent_id exists, the four main categories and nine
--         subcategories are in place, Perfumes has no subcategories).
--
-- What it does
--   Puts four subcategories under Perfumes, in this order: Musky, Oud, Floral, Woody
--   (slugs musky, oud, floral, woody).
--   A slug that already exists is ADOPTED, never duplicated: the retired fragrance families of the
--   same slugs may still exist as inactive rows. An adopted row keeps its id, name, image,
--   description and products; it is placed under Perfumes, given its position and made active
--   (so it shows on the storefront). Missing slugs are created, active.
--   Every change is written to category_migration_14_log, so 14_rollback.sql can undo it exactly.
--
-- What it does NOT change
--   No product is moved. No other category is touched. Variants, prices, stock, orders, COD and
--   Razorpay are untouched. Equivalent alternative without SQL: Admin → Categories → Add, choose
--   "Subcategory of Perfumes" (but that cannot adopt an existing inactive row of the same slug).
--
-- One transaction: on any error nothing changes, and the file can simply be run again.
-- VERIFY: 14_verify_readonly.sql (before and after). ROLLBACK: 14_rollback.sql.
-- ============================================================================

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- ---------------------------------------------------------------------------
-- 0. Preflight (stops before any change)
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_attribute where attrelid = 'public.categories'::regclass
                   and attname = 'parent_id' and not attisdropped) then
    raise exception 'categories.parent_id is missing: apply step 12 (revision 2) first.';
  end if;
  if not exists (select 1 from public.categories where lower(slug) = 'perfumes' and parent_id is null) then
    raise exception 'The main category "perfumes" is missing or is not a main category. Review before continuing.';
  end if;
  if to_regclass('public.category_migration_14_log') is not null then
    raise exception 'category_migration_14_log already exists — step 14 appears to be applied already';
  end if;
  -- An existing row that has subcategories of its own cannot become a subcategory
  if exists (select 1 from public.categories c
              where lower(c.slug) in ('musky', 'oud', 'floral', 'woody')
                and exists (select 1 from public.categories k where k.parent_id = c.id)) then
    raise exception 'One of musky/oud/floral/woody has subcategories of its own. Review before continuing.';
  end if;
end $$;

lock table public.categories in share row exclusive mode;

create table public.category_migration_14_log (
  id                bigint generated always as identity primary key,
  action            text not null check (action in ('created', 'adopted')),
  category_id       uuid not null,
  old_parent_id     uuid,
  old_display_order integer,
  old_is_active     boolean,
  created_at        timestamptz not null default now()
);
comment on table public.category_migration_14_log is 'What step 14 changed, read by 14_rollback.sql. Server only.';
alter table public.category_migration_14_log enable row level security;
revoke all on public.category_migration_14_log from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 1. The four Perfumes subcategories (existing slugs adopted, never duplicated)
-- ---------------------------------------------------------------------------
do $$
declare
  r        record;
  v_id     uuid;
  v_parent uuid := (select id from public.categories where lower(slug) = 'perfumes' and parent_id is null);
  v_row    public.categories%rowtype;
begin
  for r in
    select * from (values
      ('musky',  'Musky',  1),
      ('oud',    'Oud',    2),
      ('floral', 'Floral', 3),
      ('woody',  'Woody',  4)
    ) as t(slug, name, ord)
  loop
    select * into v_row from public.categories where lower(slug) = r.slug;
    if not found then
      insert into public.categories (name, slug, parent_id, display_order, is_active)
      values (r.name, r.slug, v_parent, r.ord, true)
      returning id into v_id;
      insert into public.category_migration_14_log (action, category_id) values ('created', v_id);
    else
      insert into public.category_migration_14_log (action, category_id, old_parent_id, old_display_order, old_is_active)
      values ('adopted', v_row.id, v_row.parent_id, v_row.display_order, v_row.is_active);
      update public.categories
         set parent_id = v_parent, display_order = r.ord, is_active = true
       where id = v_row.id;
      raise notice 'Adopted existing category % (% product(s)); now Perfumes › %, active.',
        r.slug, (select count(*) from public.products p where p.category_id = v_row.id), v_row.name;
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Post-conditions (any failure undoes everything above)
-- ---------------------------------------------------------------------------
do $$
begin
  if (select count(*) from public.categories c
        join public.categories p on p.id = c.parent_id
       where lower(p.slug) = 'perfumes' and lower(c.slug) in ('musky', 'oud', 'floral', 'woody') and c.is_active) <> 4 then
    raise exception 'Perfumes does not have the four active subcategories — rolling back';
  end if;
  if exists (select 1 from public.categories c join public.categories p on p.id = c.parent_id
              where p.parent_id is not null) then
    raise exception 'A category is nested more than two levels — rolling back';
  end if;
  if (select count(*) from public.category_migration_14_log) <> 4 then
    raise exception 'Expected 4 log rows — rolling back';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.category_migration_14_log'::regclass)
     or has_table_privilege('anon', 'public.category_migration_14_log', 'SELECT,INSERT,UPDATE,DELETE')
     or has_table_privilege('authenticated', 'public.category_migration_14_log', 'SELECT,INSERT,UPDATE,DELETE') then
    raise exception 'category_migration_14_log is not locked down — rolling back';
  end if;
end $$;

commit;
