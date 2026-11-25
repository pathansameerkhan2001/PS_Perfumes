-- ============================================================================
-- PS PERFUMES — STEP 17 ROLLBACK: back to Step 16 (flat ₹49 shipping)
-- Status: PROPOSED. Run only after written approval, manually, in the SQL Editor.
--
-- Restores the one shipping line in place_order and place_order_core, so both are again exactly
-- the Step 16 functions (fingerprints checked). Shipping is then flat ₹49 for all PIN codes.
-- One transaction. Re-running after success changes nothing.
-- ============================================================================

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $$
declare
  c_step16 constant text := '  v_shipping := case when v_subtotal > 0 then 49 else 0 end; -- Step 16: flat Air Shipping';
  c_step17 constant text := '  v_shipping := case when v_subtotal > 0 and v_pincode <> ''516001'' then 49 else 0 end; -- Step 17: PIN 516001 free, others ₹49';
  r        record;
  v_oid    oid;
  v_fp     text;
  v_def    text;
begin
  for r in
    select * from (values
      ('place_order(jsonb, jsonb, text, text, uuid)',      'fb2885684155bbd2b930a7b16cb329eb', '7e6e340c8f2fb2c9deb0f7c753ac7a8a'),
      ('place_order_core(jsonb, jsonb, text, text, uuid)', '8be0ba3088c0cd75671598eb5468e13c', '99cfea71ece5e3b8706ff5b5c74ecc43')
    ) as t(sig, fp_step17, fp_step16)
  loop
    v_oid := to_regprocedure('public.' || r.sig)::oid;
    if v_oid is null then
      raise exception 'public.% is missing. Review before continuing.', r.sig;
    end if;
    select md5(ltrim(replace(prosrc, E'\r', ''), E'\n')) into v_fp from pg_proc where oid = v_oid;

    if v_fp = r.fp_step16 then
      raise notice 'public.% is already the step 16 version; unchanged.', r.sig;
      continue;
    end if;
    if v_fp is distinct from r.fp_step17 then
      raise exception 'public.% is not the step 17 version (fingerprint %). Review before continuing.', r.sig, v_fp;
    end if;

    v_def := replace(pg_get_functiondef(v_oid), E'\r', '');
    execute replace(v_def, c_step17, c_step16);

    select md5(ltrim(replace(prosrc, E'\r', ''), E'\n')) into v_fp from pg_proc where oid = v_oid;
    if v_fp is distinct from r.fp_step16 then
      raise exception 'public.%: unexpected result (fingerprint %). Nothing was changed.', r.sig, v_fp;
    end if;
    raise notice 'public.% restored to flat ₹49 shipping (step 16).', r.sig;
  end loop;
end $$;

commit;
