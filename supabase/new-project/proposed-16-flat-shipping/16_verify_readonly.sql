-- ============================================================================
-- PS PERFUMES — STEP 16 VERIFY (read-only). Safe to run at any time; changes nothing.
-- state: 'step16' = flat ₹49 shipping is live; 'original' = step 08 / 09 v2 rule (₹99 / ₹1,500);
--        'other' = neither — review before running 16 or its rollback.
-- ============================================================================

select t.fn,
       md5(ltrim(replace(p.prosrc, E'\r', ''), E'\n')) as fingerprint,
       case md5(ltrim(replace(p.prosrc, E'\r', ''), E'\n'))
         when t.fp_step16   then 'step16'
         when t.fp_original then 'original'
         else 'other'
       end as state,
       position('then 49 else 0 end; -- Step 16' in p.prosrc) > 0 as charges_flat_49
from (values
  ('place_order(jsonb, jsonb, text, text, uuid)',      'f58df5ff55e84e958d1e27336cd82f6e', '7e6e340c8f2fb2c9deb0f7c753ac7a8a'),
  ('place_order_core(jsonb, jsonb, text, text, uuid)', '11e685594045be8687ee025bcba72c8c', '99cfea71ece5e3b8706ff5b5c74ecc43')
) as t(fn, fp_original, fp_step16)
left join pg_proc p on p.oid = to_regprocedure('public.' || t.fn)::oid
order by t.fn;
