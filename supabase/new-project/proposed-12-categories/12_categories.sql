-- ============================================================================
-- PS PERFUMES — STEP 12: two-level categories (main category › subcategory)
-- Target: ps-perfumes-production (project ref pwacxxrghlglvdtclbig)
-- Status: PROPOSED. NOT APPLIED. Run only after written approval, manually, in the SQL Editor of
--         the project above. Independent of steps 08 to 11: it touches no checkout or payment object.
--
-- What it adds
--   1. categories.parent_id: a subcategory points at its main category. Two levels only.
--   2. The four main categories and their fourteen subcategories, created once. A slug that already
--      exists is adopted instead of duplicated (the existing Bakhoor category becomes
--      Home Fragrance › Bakhoor, keeping its products, name, image and status).
--   3. Products move from the retired fragrance families to the new tree:
--        Perfume → Perfumes             Attar → Attars           Woody → Attars
--        Musky   → Attars › Musk Attars  Oud → Attars › Oud Attars  Floral → Attars › Floral Attars
--      The emptied families (attar, perfume, musky, oud, floral, woody) are made inactive, never
--      deleted. Products in any other category are not moved.
--   4. Guards: a category with products cannot be deleted; a main category with subcategories
--      cannot be deleted; a subcategory cannot have subcategories.
--   5. Table category_migration_12_log: every change above, so 12_rollback.sql can undo it exactly.
--
-- What it does NOT change
--   Any product field other than category_id. Variants, prices, stock, images, orders, coupons,
--   customers. Any function, policy or grant that exists today. COD and Razorpay are untouched.
--
-- One transaction: on any error nothing changes, and the file can simply be run again.
-- PRE-CHECK: 12_precheck_readonly.sql. VERIFY: 12_verify_readonly.sql. ROLLBACK: 12_rollback.sql.
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

-- Admin category edits wait until this commits, so the tree and the moves below see one
-- consistent set of categories. The column added next locks categories fully until COMMIT, so
-- storefront category reads also pause for the run (well under a second on this catalogue).
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
-- 3. The tree
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
      ('attars',         'arabic-attars',              'Arabic Attars',              1),
      ('attars',         'oud-attars',                 'Oud Attars',                 2),
      ('attars',         'musk-attars',                'Musk Attars',                3),
      ('attars',         'floral-attars',              'Floral Attars',              4),
      ('attars',         'traditional-attars',         'Traditional Attars',         5),
      ('home-fragrance', 'bakhoor',                    'Bakhoor',                    1),
      ('home-fragrance', 'incense-sticks',             'Incense Sticks',             2),
      ('home-fragrance', 'bakhoor-burners',            'Bakhoor Burners',            3),
      ('body-care',      'perfume-cream',              'Perfume Cream',              1),
      ('body-care',      'body-cream',                 'Body Cream',                 2),
      ('body-care',      'fragrance-cream',            'Fragrance Cream',            3)
    ) as t(parent_slug, slug, name, ord)
  loop
    v_parent := case when r.parent_slug is null then null
                     else (select id from public.categories where slug = r.parent_slug) end;

    select * into v_row from public.categories where lower(slug) = r.slug;
    if not found then
      insert into public.categories (name, slug, parent_id, display_order, is_active)
      values (r.name, r.slug, v_parent, r.ord, true)
      returning id into v_id;
      insert into public.category_migration_12_log (action, category_id) values ('created', v_id);
    else
      -- Adopted as it is: only its place in the tree and its position change
      insert into public.category_migration_12_log (action, category_id, old_display_order)
      values ('adopted', v_row.id, v_row.display_order);
      update public.categories set parent_id = v_parent, display_order = r.ord where id = v_row.id;
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Products from the retired fragrance families
-- ---------------------------------------------------------------------------
create temporary table ps12_moves (from_slug text primary key, to_slug text not null) on commit drop;
insert into ps12_moves values
  ('perfume', 'perfumes'), ('attar', 'attars'), ('woody', 'attars'),
  ('musky', 'musk-attars'), ('oud', 'oud-attars'), ('floral', 'floral-attars');

with moved as (
  update public.products p
     set category_id = dst.id
    from ps12_moves m
    join public.categories src on lower(src.slug) = m.from_slug
    join public.categories dst on dst.slug = m.to_slug
   where p.category_id = src.id
  returning p.id as product_id, src.id as old_category_id, dst.id as new_category_id
)
insert into public.category_migration_12_log (action, product_id, old_category_id, new_category_id)
select 'moved', product_id, old_category_id, new_category_id from moved;

-- Emptied families leave the storefront; the rows stay for history and rollback
with emptied as (
  select c.id, c.is_active
    from public.categories c
    join ps12_moves m on lower(c.slug) = m.from_slug
   where c.parent_id is null
     and not exists (select 1 from public.products p where p.category_id = c.id)
)
insert into public.category_migration_12_log (action, category_id, old_is_active)
select 'deactivated', id, is_active from emptied;

update public.categories c set is_active = false
  from public.category_migration_12_log l
 where l.action = 'deactivated' and l.category_id = c.id and c.is_active;

-- ---------------------------------------------------------------------------
-- 5. Post-conditions (any failure undoes everything above)
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
  if v_main <> 4 or v_sub < 14 then
    raise exception 'Expected 4 main categories and 14 subcategories, found % and % — rolling back', v_main, v_sub;
  end if;
  if exists (select 1 from public.products p join ps12_moves m on true
               join public.categories c on c.id = p.category_id and lower(c.slug) = m.from_slug) then
    raise exception 'A product is still in a retired family — rolling back';
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
