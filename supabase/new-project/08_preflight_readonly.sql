-- ============================================================================
-- PS PERFUMES — STEP 8 PREFLIGHT (READ-ONLY): checkout hardening
-- Target: ps-perfumes-production (project ref pwacxxrghlglvdtclbig)
-- Run BEFORE 08_checkout_hardening.sql. Changes nothing (SELECT only, no row locks).
-- Export the result grid as CSV for review. Continue with 08 only when every
-- "ok_*" column is true; the "info_*" columns are for review only.
-- ============================================================================

with
fn as (
  select
    to_regprocedure('public.place_order(jsonb, jsonb, text, text)') is not null        as old_place_order,
    to_regprocedure('public.place_order(jsonb, jsonb, text, text, uuid)') is not null  as new_place_order,
    to_regprocedure('public.validate_coupon(text, numeric)') is not null               as validate_coupon,
    (select count(*) from pg_proc
      where pronamespace = 'public'::regnamespace and proname = 'place_order')         as place_order_count,
    (select coalesce(string_agg('place_order(' || pg_get_function_identity_arguments(oid) || ')', ', '), 'none')
       from pg_proc where pronamespace = 'public'::regnamespace and proname = 'place_order') as place_order_sigs
),
col as (
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'orders' and column_name = 'idempotency_key'
  ) as has_idempotency_key
),
tbl as (
  select
    to_regclass('public.orders') is not null
    and to_regclass('public.order_items') is not null
    and to_regclass('public.combos') is not null
    and to_regclass('public.combo_items') is not null
    and to_regclass('public.product_variants') is not null
    and to_regclass('public.products') is not null
    and to_regclass('public.coupons') is not null
    and to_regclass('public.store_settings') is not null as tables_present
),
-- Active combos the new checkout would refuse (informational: they already cannot be bought
-- on the storefront, which hides the Add to cart button for them)
bad_combos as (
  select coalesce(jsonb_agg(jsonb_build_object(
           'combo', c.name,
           'stock', c.stock_quantity,
           'items', (select count(*) from public.combo_items ci where ci.combo_id = c.id),
           'unavailable_items', (
             select count(*) from public.combo_items ci
             left join public.products p on p.id = ci.product_id
             where ci.combo_id = c.id and (p.id is null or not coalesce(p.is_active, false)))
         ) order by c.name), '[]'::jsonb) as list
  from public.combos c
  where coalesce(c.is_active, false)
    and (
      coalesce(c.stock_quantity, 0) <= 0
      or not exists (select 1 from public.combo_items ci where ci.combo_id = c.id)
      or exists (
        select 1 from public.combo_items ci
        left join public.products p on p.id = ci.product_id
        where ci.combo_id = c.id and (p.id is null or not coalesce(p.is_active, false)))
    )
),
-- Possible duplicate orders already in the table (same e-mail and total within 10 minutes)
dupes as (
  select count(*) as n
  from public.orders a
  join public.orders b
    on a.id < b.id
   and lower(coalesce(a.customer_email, '')) = lower(coalesce(b.customer_email, ''))
   and a.total_amount = b.total_amount
   and abs(extract(epoch from (a.created_at - b.created_at))) < 600
)
select
  current_database()                                   as info_database,
  (select tables_present from tbl)                     as ok_tables_present,
  (select old_place_order from fn)                     as ok_old_place_order_installed,
  not (select new_place_order from fn)                 as ok_08_not_yet_applied,
  not (select has_idempotency_key from col)            as ok_no_idempotency_column_yet,
  (select validate_coupon from fn)                     as ok_validate_coupon_installed,
  (select place_order_count = 1 from fn)               as ok_single_place_order_signature,
  (select place_order_sigs from fn)                    as info_place_order_signatures,
  -- 08 locks these rows during checkout; with no long-running writers here, locks are brief
  (select count(*) from public.product_variants)       as info_variants,
  (select count(*) from public.orders)                 as info_orders,
  (select count(*) from public.combos where coalesce(is_active, false)) as info_active_combos,
  (select list from bad_combos)                        as info_active_combos_refused_by_08,
  (select n from dupes)                                as info_possible_existing_duplicate_orders,
  (select count(*) from pg_stat_activity
    where datname = current_database() and state = 'active' and pid <> pg_backend_pid()) as info_other_active_sessions;
