-- ============================================================================
-- PS PERFUMES — STEP 17 VERIFY (read-only). Safe to run at any time; changes nothing.
-- state: 'step17' = PIN-code delivery rule (516001 & 516002 free, others ₹49) is live;
--        'step16' = flat ₹49 shipping is live;
--        'original' = step 08 / 09 v2 rule (₹99 / ₹1,500);
--        'other' = neither — review before running 17 or its rollback.
-- ============================================================================

select t.fn,
       md5(ltrim(replace(p.prosrc, E'\r', ''), E'\n')) as fingerprint,
       t.fp_step17 as expected_step17,
       case md5(ltrim(replace(p.prosrc, E'\r', ''), E'\n'))
         when t.fp_step17   then 'step17'
         when t.fp_step16   then 'step16'
         when t.fp_original then 'original'
         else 'other'
       end as state,
       position('v_pincode not in (''516001'', ''516002'') then 49 else 0 end; -- Step 17' in p.prosrc) > 0 as charges_pincode_rule
from (values
  ('place_order(jsonb, jsonb, text, text, uuid)',      '5ce511e7c3119b4210d0c9128f06301b', '7e6e340c8f2fb2c9deb0f7c753ac7a8a', 'f58df5ff55e84e958d1e27336cd82f6e'),
  ('place_order_core(jsonb, jsonb, text, text, uuid)', '8f318b975a346db1012356db55a3ac27', '99cfea71ece5e3b8706ff5b5c74ecc43', '11e685594045be8687ee025bcba72c8c')
) as t(fn, fp_step17, fp_step16, fp_original)
left join pg_proc p on p.oid = to_regprocedure('public.' || t.fn)::oid
order by t.fn;
