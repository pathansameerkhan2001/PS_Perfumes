-- ============================================================================
-- PS PERFUMES — READ-ONLY export of the live checkout functions (run BEFORE step 16)
-- Changes nothing. Run it in the Production SQL Editor yourself and save each `definition` cell
-- as your own copy. Compare `fingerprint` with the backup files in this folder:
--   place_order       f58df5ff55e84e958d1e27336cd82f6e
--   place_order_core  11e685594045be8687ee025bcba72c8c
-- If both match (matches_backup = true), the backup files are byte-identical to Production's function bodies.
-- ============================================================================

select t.fn,
       md5(ltrim(replace(p.prosrc, E'\r', ''), E'\n'))                 as fingerprint,
       md5(ltrim(replace(p.prosrc, E'\r', ''), E'\n')) = t.fp_backup   as matches_backup,
       p.prosecdef                                                      as security_definer,
       p.proconfig                                                      as config,
       p.provolatile                                                    as volatility,
       pg_get_userbyid(p.proowner)                                      as owner,
       p.proacl::text                                                   as permissions,
       pg_get_functiondef(p.oid)                                        as definition
from (values
  ('place_order(jsonb, jsonb, text, text, uuid)',      'f58df5ff55e84e958d1e27336cd82f6e'),
  ('place_order_core(jsonb, jsonb, text, text, uuid)', '11e685594045be8687ee025bcba72c8c')
) as t(fn, fp_backup)
left join pg_proc p on p.oid = to_regprocedure('public.' || t.fn)::oid
order by t.fn;
