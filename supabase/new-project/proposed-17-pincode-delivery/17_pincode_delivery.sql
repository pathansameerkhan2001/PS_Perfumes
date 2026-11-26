-- ============================================================================
-- PS PERFUMES — STEP 17: PIN-code-based delivery charges
-- Target: ps-perfumes-production (project ref pwacxxrghlglvdtclbig)
-- Status: PROPOSED. NOT APPLIED. Run only after written approval, manually, in the SQL Editor.
--
-- What it changes
--   One line in each checkout function, nothing else:
--     place_order       (COD, step 08 / patched in step 16)
--     place_order_core  (Razorpay, step 10 v2 / patched in step 16)
--   before:  v_shipping := case when v_subtotal > 0 then 49 else 0 end; -- Step 16: flat Air Shipping
--   after:   v_shipping := case when v_subtotal > 0 and v_pincode not in ('516001', '516002') then 49 else 0 end; -- Step 17: PIN 516001 & 516002 free, others ₹49
--
-- Delivery rule:
--   - PIN 516001 & 516002 (Kadapa atelier) -> Free delivery (₹0)
--   - All other valid 6-digit Indian PIN codes -> ₹49 delivery charge
--   - Empty cart (v_subtotal <= 0) -> ₹0
--   Note: v_pincode is already validated by both functions earlier in the body:
--     if v_pincode !~ '^[1-9][0-9]{5}$' then raise exception 'Enter a valid 6-digit PIN code.'; end if;
--   The backend is fully authoritative and calculates delivery charge directly from v_pincode.
--
-- What it does NOT change
--   Signatures, grants, owners, coupons, product prices, stock, SKUs, variant ids, existing orders,
--   mark_order_paid, the payment guard, step 10 objects. Existing orders keep the shipping they paid.
--
-- How
--   Each function's live definition (pg_get_functiondef) is re-created with that one line replaced.
--   CREATE OR REPLACE keeps the function's privileges. Fingerprints (md5 of prosrc) prove the function
--   was exactly the step 16 version before, and is exactly the expected patched version after.
--
-- Order with other steps
--   Requires Step 16 to be applied first.
--
-- One transaction: on any error nothing changes. Re-running after success changes nothing.
-- VERIFY: 17_verify_readonly.sql. ROLLBACK: 17_rollback.sql.
-- ============================================================================

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $$
declare
  c_old constant text := '  v_shipping := case when v_subtotal > 0 then 49 else 0 end; -- Step 16: flat Air Shipping';
  c_new constant text := '  v_shipping := case when v_subtotal > 0 and v_pincode not in (''516001'', ''516002'') then 49 else 0 end; -- Step 17: PIN 516001 & 516002 free, others ₹49';
  r      record;
  v_oid  oid;
  v_fp   text;
  v_def  text;
begin
  if to_regprocedure('public.ps_shipping_quote(text, numeric)') is not null then
    raise exception 'Step 11 (PIN code shipping table) is applied. This step is written for 16 only. Review before continuing.';
  end if;
  if (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname = 'place_order') <> 1 then
    raise exception 'Expected exactly one place_order function. Review before continuing.';
  end if;

  for r in
    select * from (values
      ('place_order(jsonb, jsonb, text, text, uuid)',      '7e6e340c8f2fb2c9deb0f7c753ac7a8a', '5ce511e7c3119b4210d0c9128f06301b'),
      ('place_order_core(jsonb, jsonb, text, text, uuid)', '99cfea71ece5e3b8706ff5b5c74ecc43', '8f318b975a346db1012356db55a3ac27')
    ) as t(sig, fp_before, fp_after)
  loop
    v_oid := to_regprocedure('public.' || r.sig)::oid;
    if v_oid is null then
      raise exception 'public.% is missing. Apply step 16 first.', r.sig;
    end if;
    select md5(ltrim(replace(prosrc, E'\r', ''), E'\n')) into v_fp from pg_proc where oid = v_oid;

    if v_fp = r.fp_after then
      raise notice 'public.% already charges PIN-code-based delivery; unchanged.', r.sig;
      continue;
    end if;
    if v_fp is distinct from r.fp_before then
      raise exception 'public.% differs from step 16 (fingerprint %). Review before continuing.', r.sig, v_fp;
    end if;

    v_def := replace(pg_get_functiondef(v_oid), E'\r', '');
    if (length(v_def) - length(replace(v_def, c_old, ''))) / length(c_old) <> 1 then
      raise exception 'public.%: the shipping line was not found exactly once. Review before continuing.', r.sig;
    end if;
    execute replace(v_def, c_old, c_new);

    select md5(ltrim(replace(prosrc, E'\r', ''), E'\n')) into v_fp from pg_proc where oid = v_oid;
    if v_fp is distinct from r.fp_after then
      raise exception 'public.%: unexpected result (fingerprint %). Nothing was changed.', r.sig, v_fp;
    end if;
    raise notice 'public.% now charges PIN-code delivery (516001 & 516002 free, others ₹49).', r.sig;
  end loop;
end $$;

commit;
