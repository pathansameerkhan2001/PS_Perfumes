-- ============================================================================
-- PS PERFUMES — STEP 16: flat Air Shipping, ₹49 per order
-- Target: ps-perfumes-production (project ref pwacxxrghlglvdtclbig)
-- Status: PROPOSED. NOT APPLIED. Run only after written approval, manually, in the SQL Editor.
--
-- What it changes
--   One line in each checkout function, nothing else:
--     place_order       (COD, step 08)
--     place_order_core  (Razorpay, step 10 v2)
--   before:  v_shipping := case when v_subtotal >= v_threshold then 0 else v_fee end;
--   after:   v_shipping := case when v_subtotal > 0 then 49 else 0 end; -- Step 16: flat Air Shipping
--   So every order is charged ₹49 shipping, with no free-shipping threshold, whatever
--   store_settings.free_shipping_threshold / standard_shipping_fee hold (those rows are left as they are).
--   The storefront shows the same amount (src/config/shipping.js, FLAT_SHIPPING_FEE).
--
-- What it does NOT change
--   Signatures, grants, owners, coupons, product prices, stock, SKUs, variant ids, existing orders,
--   mark_order_paid, the payment guard, step 10 objects. Existing orders keep the shipping they paid.
--
-- How
--   Each function's live definition (pg_get_functiondef) is re-created with that one line replaced.
--   CREATE OR REPLACE keeps the function's privileges. Fingerprints (md5 of prosrc, the same check
--   as step 11) prove the function was exactly the step 08 / 09 v2 version before, and is exactly
--   the expected patched version after.
--
-- Order with other steps
--   Requires 08 and 09 v2. Step 11 (PIN code shipping, not applied) replaces both functions and
--   checks their step 08 / 09 v2 fingerprints, so it refuses to run after this step: roll this
--   step back (16_rollback.sql) first, or revise 11 before applying it.
--
-- One transaction: on any error nothing changes. Re-running after success changes nothing.
-- VERIFY: 16_verify_readonly.sql. ROLLBACK: 16_rollback.sql.
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
  if to_regprocedure('public.ps_shipping_quote(text, numeric)') is not null then
    raise exception 'Step 11 (PIN code shipping) is applied. This step is written for 08 / 09 v2 only. Review before continuing.';
  end if;
  if (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname = 'place_order') <> 1 then
    raise exception 'Expected exactly one place_order function. Review before continuing.';
  end if;

  for r in
    select * from (values
      ('place_order(jsonb, jsonb, text, text, uuid)',      'f58df5ff55e84e958d1e27336cd82f6e', '7e6e340c8f2fb2c9deb0f7c753ac7a8a'),
      ('place_order_core(jsonb, jsonb, text, text, uuid)', '11e685594045be8687ee025bcba72c8c', '99cfea71ece5e3b8706ff5b5c74ecc43')
    ) as t(sig, fp_before, fp_after)
  loop
    v_oid := to_regprocedure('public.' || r.sig)::oid;
    if v_oid is null then
      raise exception 'public.% is missing. Apply steps 08 and 09 v2 first.', r.sig;
    end if;
    select md5(ltrim(replace(prosrc, E'\r', ''), E'\n')) into v_fp from pg_proc where oid = v_oid;

    if v_fp = r.fp_after then
      raise notice 'public.% already charges flat shipping; unchanged.', r.sig;
      continue;
    end if;
    if v_fp is distinct from r.fp_before then
      raise exception 'public.% differs from steps 08 / 09 v2 (fingerprint %). Review before continuing.', r.sig, v_fp;
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
    raise notice 'public.% now charges flat ₹49 shipping.', r.sig;
  end loop;
end $$;

commit;
