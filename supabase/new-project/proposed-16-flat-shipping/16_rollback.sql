-- ============================================================================
-- PS PERFUMES — STEP 16 ROLLBACK: back to the store_settings shipping rule
-- Status: PROPOSED. Run only after written approval, manually, in the SQL Editor.
--
-- Restores the one shipping line in place_order and place_order_core, so both are again exactly
-- the step 08 / 09 v2 functions (fingerprints checked). Shipping is then the store_settings rule
-- (free_shipping_threshold / standard_shipping_fee, defaults 1500 / 99) as before step 16.
-- Revert the storefront code (src/config/shipping.js and its users) at the same time, or the
-- storefront shows ₹49 while checkout charges the old rule.
-- One transaction. Re-running after success changes nothing.
-- ============================================================================

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $$
declare
  c_old constant text := '  v_shipping := case when v_subtotal >= v_threshold then 0 else v_fee end;';
  c_new constant text := '  v_shipping := case when v_subtotal > 0 then 49 else 0 end; -- Step 16: flat Air Shipping';
  r      record;
  v_oid  oid;
  v_fp   text;
  v_def  text;
begin
  for r in
    select * from (values
      ('place_order(jsonb, jsonb, text, text, uuid)',      'f58df5ff55e84e958d1e27336cd82f6e', '7e6e340c8f2fb2c9deb0f7c753ac7a8a'),
      ('place_order_core(jsonb, jsonb, text, text, uuid)', '11e685594045be8687ee025bcba72c8c', '99cfea71ece5e3b8706ff5b5c74ecc43')
    ) as t(sig, fp_original, fp_step16)
  loop
    v_oid := to_regprocedure('public.' || r.sig)::oid;
    if v_oid is null then
      raise exception 'public.% is missing. Review before continuing.', r.sig;
    end if;
    select md5(ltrim(replace(prosrc, E'\r', ''), E'\n')) into v_fp from pg_proc where oid = v_oid;

    if v_fp = r.fp_original then
      raise notice 'public.% is already the step 08 / 09 v2 version; unchanged.', r.sig;
      continue;
    end if;
    if v_fp is distinct from r.fp_step16 then
      raise exception 'public.% is not the step 16 version (fingerprint %). Review before continuing.', r.sig, v_fp;
    end if;

    v_def := replace(pg_get_functiondef(v_oid), E'\r', '');
    execute replace(v_def, c_new, c_old);

    select md5(ltrim(replace(prosrc, E'\r', ''), E'\n')) into v_fp from pg_proc where oid = v_oid;
    if v_fp is distinct from r.fp_original then
      raise exception 'public.%: unexpected result (fingerprint %). Nothing was changed.', r.sig, v_fp;
    end if;
    raise notice 'public.% restored to the store_settings shipping rule.', r.sig;
  end loop;
end $$;

commit;
