-- ============================================================================
-- PS PERFUMES — STEP 11 POST-MIGRATION VERIFICATION (READ-ONLY)
-- Target: ps-perfumes-production (project ref pwacxxrghlglvdtclbig)
-- Status: PROPOSED. One read-only check, then one SELECT; it changes nothing.
--
-- NEVER RUN THIS BEFORE THE MIGRATION. Run the whole file only after 11_shipping.sql has succeeded.
-- Every row with ok = false needs review. ok = null is information, for example the decisions
-- that are still open.
-- ============================================================================

do $$
begin
  if to_regprocedure('public.ps_shipping_quote(text, numeric)') is null or to_regclass('public.shipping_config') is null then
    raise exception 'Migration 11 is not applied, so nothing was verified. No data was changed.';
  end if;
end $$;

with
fp(sig, expected) as (
  values ('place_order(jsonb, jsonb, text, text, uuid)', '5bb8e3ce49eafb371a0644a783c921a2'),
         ('place_order_core(jsonb, jsonb, text, text, uuid)', 'b229458111f7d02b5e3a26f642bcdfbb'),
         ('mark_order_paid(text, text, bigint)', 'ae7666b99cc00a000ebe74611c4e1f24'),
         ('ps_orders_payment_guard()', 'acfa79d5e0d9f1f6adabc914cb1ba7fe')
),
cfg as (select * from public.shipping_config where id),
checks(n, label, ok) as (
  select 1, 'fingerprint ' || f.sig,
         (select md5(ltrim(replace(prosrc, E'\r', ''), E'\n')) from pg_proc
           where oid = to_regprocedure('public.' || f.sig)::oid) = f.expected
    from fp f
  union all select 2, 'exactly one place_order and one place_order_core',
         (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname = 'place_order') = 1
     and (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname = 'place_order_core') = 1
  union all select 3, 'visitors can call place_order and get_shipping_quote',
         has_function_privilege('anon', 'public.place_order(jsonb, jsonb, text, text, uuid)', 'EXECUTE')
     and has_function_privilege('anon', 'public.get_shipping_quote(text, numeric)', 'EXECUTE')
  union all select 4, 'visitors cannot call place_order_core or ps_shipping_quote',
         not has_function_privilege('anon', 'public.place_order_core(jsonb, jsonb, text, text, uuid)', 'EXECUTE')
     and not has_function_privilege('anon', 'public.ps_shipping_quote(text, numeric)', 'EXECUTE')
     and not has_function_privilege('authenticated', 'public.ps_shipping_quote(text, numeric)', 'EXECUTE')
  union all select 5, 'RLS on for the three shipping tables',
         (select bool_and(relrowsecurity) from pg_class
           where oid in ('public.shipping_zones'::regclass, 'public.shipping_pincodes'::regclass, 'public.shipping_config'::regclass))
  union all select 6, 'visitors cannot read or write the shipping tables',
         not has_table_privilege('anon', 'public.shipping_pincodes', 'SELECT,INSERT,UPDATE,DELETE')
     and not has_table_privilege('anon', 'public.shipping_zones', 'SELECT,INSERT,UPDATE,DELETE')
     and not has_table_privilege('anon', 'public.shipping_config', 'SELECT,INSERT,UPDATE,DELETE')
  union all select 7, 'shipping_config has exactly one row', (select count(*) from public.shipping_config) = 1
  union all select 8, 'guards installed',
         (select count(*) from pg_trigger where tgname in ('ps_shipping_config_guard', 'ps_shipping_rates_guard') and not tgisinternal) = 3
  union all select 9, 'orders has shipping_pincode and shipping_rate',
         (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'orders'
           and column_name in ('shipping_pincode', 'shipping_rate')) = 2
  union all select 10, 'pincode mode only with every decision recorded',
         (select mode = 'legacy' or (fallback_allowed is not null and free_shipping_rule is not null) from cfg)
)
select n, label, ok from checks
union all select 20, 'information: mode = ' || (select mode from cfg), null
union all select 21, 'information: active serviceable PIN codes = ' ||
  (select count(*) from public.shipping_pincodes where is_active and is_serviceable), null
union all select 22, 'information: zones = ' || (select count(*) from public.shipping_zones), null
union all select 23, 'information: fallback decision = ' ||
  coalesce((select case fallback_allowed when true then 'allowed, ' || fallback_charge when false then 'not allowed' end from cfg), 'NOT DECIDED'), null
union all select 24, 'information: free shipping decision = ' ||
  coalesce((select free_shipping_rule || coalesce(' from ' || free_shipping_threshold, '') from cfg), 'NOT DECIDED'), null
order by n, label;
