-- ============================================================================
-- PS PERFUMES — STEP 12 (REVISION 2): two-level categories for the current catalogue
-- Target: ps-perfumes-production (project ref pwacxxrghlglvdtclbig)
-- Status: PROPOSED. NOT APPLIED. Run only after written approval, manually, in the SQL Editor of
--         the project above. Replaces proposed-12-categories/12_categories.sql: run ONE of them,
--         never both (both create categories.parent_id and category_migration_12_log).
--
-- Why a revision
--   Step 12 was written for the seven fragrance families (attar, perfume, bakhoor, …). A read-only
--   check on 2026-11-04 found five active main categories in Production instead: perfumes, attars,
--   fragrance-creams, home-fragrance and combo-packs, with all 9 active products in attars. The
--   owner also set a new subcategory list on 2026-11-04.
--
-- What it adds
--   1. categories.parent_id: a subcategory points at its main category. Two levels only (same
--      structure and guards as step 12).
--   2. The four main categories and their fourteen subcategories, created once. A slug that
--      already exists is ADOPTED, never duplicated: perfumes, attars and home-fragrance keep their
--      id, name, image, status and products; only their place in the tree and position change.
--        Perfumes       › Arabic Perfumes, Designer-Inspired Perfumes, Luxury Perfumes
--        Attars         › Musk Attars, Oud Attars, Floral Attars, Woody Attars
--        Home Fragrance › Bakhoor, Incense Sticks, Room Fragrances
--        Body Care      › Body Lotions, Body Mists, Body Oils, Personal Care
--   3. Table category_migration_12_log: every change, so 12_rollback.sql can undo it exactly.
--
-- What it does NOT change
--   No product is moved: every product keeps its category (the 9 products stay in Attars until an
--   admin assigns subcategories). fragrance-creams and combo-packs are left exactly as they are
--   (owner decision pending; the storefront never lists them as main categories). Variants,
--   prices, stock, images, orders, COD and Razorpay are untouched.
--
-- One transaction: on any error nothing changes, and the file can simply be run again.
-- VERIFY: 12r2_verify_readonly.sql. ROLLBACK: 12_rollback.sql (in this folder).
-- ============================================================================

begin;

-- Give up quickly instead of queueing admin saves behind this change
set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- ---------------------------------------------------------------------------
-- 0. Preflight (stops before any change)
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.categories') is null or to_regclass('public.products') is null then
    raise exception 'categories or products is missing. Review before continuing.';
  end if;
  if exists (select 1 from pg_attribute where attrelid = 'public.categories'::regclass
               and attname = 'parent_id' and not attisdropped) then
    raise exception 'categories.parent_id already exists — step 12 appears to be applied already';
  end if;
  if to_regclass('public.category_migration_12_log') is not null then
    raise exception 'category_migration_12_log already exists — step 12 appears to be applied already';
  end if;
end $$;

-- Admin category edits wait until this commits, so the tree below sees one consistent set of
-- categories. The column added next locks categories fully until COMMIT, so storefront category
-- reads also pause for the run (well under a second on this catalogue).
lock table public.categories in share row exclusive mode;

-- ---------------------------------------------------------------------------
-- 1. Structure
-- ---------------------------------------------------------------------------
-- Nullable with no default: no table rewrite, no existing row is written
alter table public.categories
  add column parent_id uuid references public.categories (id) on delete restrict;
alter table public.categories
  add constraint categories_parent_not_self check (parent_id is null or parent_id <> id);

comment on column public.categories.parent_id is
  'Main category of a subcategory; null for a main category. Two levels only.';

create table public.category_migration_12_log (
  id                bigint generated always as identity primary key,
  action            text not null check (action in ('created', 'adopted', 'moved', 'deactivated')),
  category_id       uuid,
  product_id        uuid,
  old_category_id   uuid,
  new_category_id   uuid,
  old_display_order integer,
  old_is_active     boolean,
  created_at        timestamptz not null default now()
);
comment on table public.category_migration_12_log is
  'What Migration 12 changed, read by 12_rollback.sql. Server only.';
alter table public.category_migration_12_log enable row level security;
revoke all on public.category_migration_12_log from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Guards
-- ---------------------------------------------------------------------------
create function public.ps_categories_tree_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.parent_id is not null then
    if exists (select 1 from public.categories c where c.id = new.parent_id and c.parent_id is not null) then
      raise exception 'A subcategory cannot contain subcategories. Choose a main category.';
    end if;
    if tg_op = 'UPDATE' and exists (select 1 from public.categories c where c.parent_id = new.id) then
      raise exception 'This category has subcategories, so it must stay a main category.';
    end if;
  end if;
  return new;
end;
$$;

create function public.ps_categories_delete_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_count bigint;
begin
  select count(*) into v_count from public.products p where p.category_id = old.id;
  if v_count > 0 then
    raise exception 'This category has % product(s). Move them to another category first.', v_count;
  end if;
  return old;
end;
$$;

revoke all on function public.ps_categories_tree_guard() from public, anon, authenticated;
revoke all on function public.ps_categories_delete_guard() from public, anon, authenticated;

create trigger ps_categories_tree_guard before insert or update of parent_id on public.categories
  for each row execute function public.ps_categories_tree_guard();
create trigger ps_categories_delete_guard before delete on public.categories
  for each row execute function public.ps_categories_delete_guard();

-- ---------------------------------------------------------------------------
-- 3. The tree (existing slugs are adopted, never duplicated)
-- ---------------------------------------------------------------------------
do $$
declare
  r        record;
  v_id     uuid;
  v_parent uuid;
  v_row    public.categories%rowtype;
begin
  for r in
    select * from (values
      -- parent slug, slug, name, display order
      (null,             'perfumes',                   'Perfumes',                   1),
      (null,             'attars',                     'Attars',                     2),
      (null,             'home-fragrance',             'Home Fragrance',             3),
      (null,             'body-care',                  'Body Care',                  4),
      ('perfumes',       'arabic-perfumes',            'Arabic Perfumes',            1),
      ('perfumes',       'designer-inspired-perfumes', 'Designer-Inspired Perfumes', 2),
      ('perfumes',       'luxury-perfumes',            'Luxury Perfumes',            3),
      ('attars',         'musk-attars',                'Musk Attars',                1),
      ('attars',         'oud-attars',                 'Oud Attars',                 2),
      ('attars',         'floral-attars',              'Floral Attars',              3),
      ('attars',         'woody-attars',               'Woody Attars',               4),
      ('home-fragrance', 'bakhoor',                    'Bakhoor',                    1),
      ('home-fragrance', 'incense-sticks',             'Incense Sticks',             2),
      ('home-fragrance', 'room-fragrances',            'Room Fragrances',            3),
      ('body-care',      'body-lotions',               'Body Lotions',               1),
      ('body-care',      'body-mists',                 'Body Mists',                 2),
      ('body-care',      'body-oils',                  'Body Oils',                  3),
      ('body-care',      'personal-care',              'Personal Care',              4)
    ) as t(parent_slug, slug, name, ord)
  loop
    v_parent := case when r.parent_slug is null then null
                     else (select id from public.categories where lower(slug) = r.parent_slug) end;

    select * into v_row from public.categories where lower(slug) = r.slug;
    if not found then
      insert into public.categories (name, slug, parent_id, display_order, is_active)
      values (r.name, r.slug, v_parent, r.ord, true)
      returning id into v_id;
      insert into public.category_migration_12_log (action, category_id) values ('created', v_id);
    else
      -- Adopted as it is (name, image, status, products): only its place and position change
      insert into public.category_migration_12_log (action, category_id, old_display_order)
      values ('adopted', v_row.id, v_row.display_order);
      update public.categories set parent_id = v_parent, display_order = r.ord where id = v_row.id;
      if not v_row.is_active then
        raise notice 'Adopted category % is inactive and stays hidden on the storefront. Activate it in Admin → Categories if it should show.', r.slug;
      end if;
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Post-conditions (any failure undoes everything above)
-- ---------------------------------------------------------------------------
do $$
declare
  v_main int;
  v_sub  int;
begin
  select count(*) into v_main from public.categories
   where parent_id is null and slug in ('perfumes', 'attars', 'home-fragrance', 'body-care');
  select count(*) into v_sub from public.categories c join public.categories p on p.id = c.parent_id
   where p.slug in ('perfumes', 'attars', 'home-fragrance', 'body-care');
  if v_main <> 4 or v_sub <> 14 then
    raise exception 'Expected 4 main categories and 14 subcategories, found % and % — rolling back', v_main, v_sub;
  end if;
  if exists (select 1 from public.category_migration_12_log where action in ('moved', 'deactivated')) then
    raise exception 'This revision must not move products or deactivate categories — rolling back';
  end if;
  if exists (select 1 from public.categories c join public.categories p on p.id = c.parent_id
              where p.parent_id is not null) then
    raise exception 'A category is nested more than two levels — rolling back';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.category_migration_12_log'::regclass)
     or has_table_privilege('anon', 'public.category_migration_12_log', 'SELECT,INSERT,UPDATE,DELETE')
     or has_table_privilege('authenticated', 'public.category_migration_12_log', 'SELECT,INSERT,UPDATE,DELETE')
     or has_table_privilege('service_role', 'public.category_migration_12_log', 'SELECT,INSERT,UPDATE,DELETE') then
    raise exception 'category_migration_12_log is not locked down — rolling back';
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'categories'
                   and policyname = 'ps_public_read_categories') then
    raise exception 'The public read policy on categories is missing — rolling back';
  end if;
end $$;

-- Make the Data API see the new column immediately (sent at COMMIT)
notify pgrst, 'reload schema';

commit;
