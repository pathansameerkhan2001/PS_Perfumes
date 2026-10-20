-- ============================================================================
-- PS PERFUMES — NEW PROJECT, STEP 1 of 5: tables, constraints, indexes
-- Target: ps-perfumes-production (project ref pwacxxrghlglvdtclbig)
-- Status: NOT APPLIED. Run only after written approval, in the SQL Editor of
--         https://supabase.com/dashboard/project/pwacxxrghlglvdtclbig
--
-- Source of truth for columns: the live schema of the old project as verified on
-- 2026-10-19 (docs/KT/03-Database-and-Data-Model.md §2) and the columns the application
-- code reads and writes (src/services/*.js). supabase/schema.sql is stale and NOT used.
-- Column TYPES were never verified on the old project; they are inferred from the code.
-- Compare with a schema-only dump of the old project before importing data (README §4).
--
-- Design notes
--   * UUID primary keys with defaults, so imported rows keep their original ids.
--   * Few NOT NULL constraints beyond what the code requires, so legacy rows import.
--   * Owned children cascade (variants, images, combo items, order items). References that
--     carry history (order_items, combo_items, reviews -> products/variants) are NO ACTION,
--     so deleting a product with history fails and the app archives it instead
--     (admin_delete_product and updateProduct already handle that error).
--   * orders.customer_id has no foreign key: the storefront has no customer accounts and
--     old Auth users are not migrated; the column is kept for compatibility.
--   * Every table gets RLS in step 2. Until step 2 runs, the Data API grants below are not
--     yet given, so nothing is readable or writable from the browser in between.
--
-- One transaction: on any error nothing is created.
-- ============================================================================

begin;

do $$
begin
  if to_regclass('public.products') is not null or to_regclass('public.orders') is not null then
    raise exception 'public.products / public.orders already exist — this file is for an empty project. Stop and review.';
  end if;
end $$;

-- updated_at maintenance (UPDATE only, so imported created_at/updated_at values are kept)
create or replace function public.ps_set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Administrators (authorization source for is_admin())
-- ---------------------------------------------------------------------------
create table public.admin_users (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null unique references auth.users (id) on delete cascade,
  role        text not null default 'admin' check (role in ('super_admin', 'admin', 'editor')),
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Catalogue
-- ---------------------------------------------------------------------------
create table public.categories (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  slug          text not null unique,
  description   text,
  image_url     text,
  image_path    text,
  display_order integer not null default 0,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index categories_display_order_idx on public.categories (display_order);

create table public.products (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  slug              text not null unique,
  brand             text default 'PS PERFUMES',
  description       text,
  short_description text,
  category_id       uuid references public.categories (id) on delete set null,
  main_image_url    text,
  main_image_path   text,
  -- JSON object: top/heart/base notes, glass/pvc images, gallery_images, category_name, sku, SEO
  fragrance_notes   jsonb not null default '{}'::jsonb,
  ingredients       text,
  is_active         boolean not null default true,
  is_featured       boolean not null default false,
  is_bestseller     boolean not null default false,
  is_new_arrival    boolean not null default false,
  display_order     integer not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index products_category_id_idx on public.products (category_id);
create index products_active_order_idx on public.products (is_active, display_order);

create table public.product_variants (
  id             uuid primary key default gen_random_uuid(),
  product_id     uuid not null references public.products (id) on delete cascade,
  bottle_type    text not null,
  size_ml        text not null,
  price          numeric(12, 2) not null default 0 check (price >= 0),
  sale_price     numeric(12, 2) check (sale_price is null or sale_price >= 0),
  stock_quantity integer not null default 0 check (stock_quantity >= 0),
  sku            text,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index product_variants_product_id_idx on public.product_variants (product_id);

create table public.product_images (
  id            uuid primary key default gen_random_uuid(),
  product_id    uuid not null references public.products (id) on delete cascade,
  image_url     text,
  image_path    text,
  display_order integer not null default 0,
  is_primary    boolean not null default false,
  alt_text      text,
  created_at    timestamptz not null default now()
);
create index product_images_product_id_idx on public.product_images (product_id);

create table public.combos (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  slug           text not null unique,
  description    text,
  image_url      text,
  image_path     text,
  price          numeric(12, 2) not null default 0 check (price >= 0),        -- regular price
  sale_price     numeric(12, 2) check (sale_price is null or sale_price >= 0), -- combo price when lower
  stock_quantity integer not null default 0 check (stock_quantity >= 0),
  is_featured    boolean not null default false,
  is_active      boolean not null default true,
  display_order  integer not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table public.combo_items (
  id         uuid primary key default gen_random_uuid(),
  combo_id   uuid not null references public.combos (id) on delete cascade,
  product_id uuid references public.products (id),
  quantity   integer not null default 1 check (quantity > 0),
  created_at timestamptz not null default now()
);
create index combo_items_combo_id_idx on public.combo_items (combo_id);
create index combo_items_product_id_idx on public.combo_items (product_id);

create table public.reviews (
  id            uuid primary key default gen_random_uuid(),
  product_id    uuid references public.products (id),
  customer_name text not null,
  rating        integer not null default 5 check (rating between 1 and 5),
  title         text,
  review_text   text,
  is_approved   boolean not null default false,
  is_featured   boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index reviews_product_id_idx on public.reviews (product_id);

-- ---------------------------------------------------------------------------
-- Content
-- ---------------------------------------------------------------------------
create table public.hero_slides (
  id                uuid primary key default gen_random_uuid(),
  title             text,
  subtitle          text,
  description       text,
  button_text       text,
  button_link       text,
  image_url         text,
  image_path        text,
  mobile_image_url  text,
  mobile_image_path text,
  display_order     integer not null default 0,
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table public.instagram_reels (
  id             uuid primary key default gen_random_uuid(),
  title          text,
  instagram_url  text,
  thumbnail_url  text,
  thumbnail_path text,
  display_order  integer not null default 0,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table public.homepage_sections (
  id            uuid primary key default gen_random_uuid(),
  section_key   text not null unique,
  title         text,
  subtitle      text,
  description   text,
  image_url     text,
  image_path    text,
  button_text   text,
  button_link   text,
  is_active     boolean not null default true,
  display_order integer not null default 0,
  settings      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Key/value settings; values stored as text (numbers converted by the app and place_order)
create table public.store_settings (
  id            uuid primary key default gen_random_uuid(),
  setting_key   text not null unique,
  setting_value text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Commerce
-- ---------------------------------------------------------------------------
create table public.coupons (
  id                   uuid primary key default gen_random_uuid(),
  code                 text not null,
  description          text,
  discount_type        text not null default 'percentage' check (discount_type in ('percentage', 'fixed')),
  discount_value       numeric(12, 2) not null default 0 check (discount_value >= 0),
  minimum_order_amount numeric(12, 2) not null default 0 check (minimum_order_amount >= 0),
  usage_limit          integer check (usage_limit is null or usage_limit >= 0),
  used_count           integer not null default 0 check (used_count >= 0),
  is_active            boolean not null default true,
  starts_at            timestamptz,
  expires_at           timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
-- Codes are matched case-insensitively by validate_coupon / place_order
create unique index coupons_code_upper_key on public.coupons (upper(code));

create table public.customers (
  id           uuid primary key default gen_random_uuid(),
  email        text,
  phone        text,
  first_name   text,
  last_name    text,
  total_orders integer not null default 0,
  total_spent  numeric(12, 2) not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table public.orders (
  id               uuid primary key default gen_random_uuid(),
  order_number     text not null unique,
  customer_id      uuid,
  customer_name    text not null,
  customer_email   text,
  customer_phone   text,
  shipping_address jsonb not null default '{}'::jsonb,
  subtotal         numeric(12, 2) not null default 0,
  shipping_amount  numeric(12, 2) not null default 0,
  discount_amount  numeric(12, 2) not null default 0,
  total_amount     numeric(12, 2) not null default 0 check (total_amount >= 0),
  payment_method   text not null default 'COD',
  payment_status   text not null default 'pending'
                   check (payment_status in ('pending', 'paid', 'failed', 'refunded')),
  order_status     text not null default 'pending'
                   check (order_status in ('pending', 'confirmed', 'processing', 'shipped',
                                           'out_for_delivery', 'delivered', 'cancelled')),
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index orders_created_at_idx on public.orders (created_at desc);
create index orders_order_status_idx on public.orders (order_status);

create table public.order_items (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid not null references public.orders (id) on delete cascade,
  product_id   uuid references public.products (id),          -- null for combo lines
  variant_id   uuid references public.product_variants (id),
  product_name text not null,
  bottle_type  text,
  size_ml      text,
  quantity     integer not null default 1 check (quantity > 0),
  unit_price   numeric(12, 2) not null default 0 check (unit_price >= 0),
  total_price  numeric(12, 2) not null default 0 check (total_price >= 0),
  created_at   timestamptz not null default now()
);
create index order_items_order_id_idx on public.order_items (order_id);
create index order_items_product_id_idx on public.order_items (product_id);
create index order_items_variant_id_idx on public.order_items (variant_id);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['admin_users', 'categories', 'products', 'product_variants', 'combos', 'reviews',
                           'hero_slides', 'instagram_reels', 'homepage_sections', 'store_settings',
                           'coupons', 'customers', 'orders']
  loop
    execute format('create trigger ps_set_updated_at before update on public.%I
                    for each row execute function public.ps_set_updated_at()', t);
  end loop;
end $$;

-- RLS on from the start; policies and Data API grants come in step 2
do $$
declare t text;
begin
  foreach t in array array['admin_users', 'categories', 'products', 'product_variants', 'product_images',
                           'combos', 'combo_items', 'reviews', 'hero_slides', 'instagram_reels',
                           'homepage_sections', 'store_settings', 'coupons', 'customers', 'orders', 'order_items']
  loop
    execute format('alter table public.%I enable row level security', t);
    -- Supabase may grant new tables to anon/authenticated by default; step 2 grants exactly what is needed
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;

-- Refresh the Data API schema cache so new tables/functions are visible immediately (sent at commit)
notify pgrst, 'reload schema';

commit;
