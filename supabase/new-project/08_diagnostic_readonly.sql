-- ============================================================================
-- PS PERFUMES — STEP 8 DIAGNOSTIC (READ-ONLY): is 08_checkout_hardening.sql fully applied?
-- Target: ps-perfumes-production (project ref pwacxxrghlglvdtclbig)
-- One SELECT on the system catalogue and on order counts. It writes nothing, takes no row locks
-- and returns no customer data. Run the WHOLE file and export the grid as CSV.
-- ok: true = as migration 08 expects, false = review, null = information only.
-- The fingerprint is the md5 of the place_order body in 08_checkout_hardening.sql, without
-- carriage returns. That file has had one version only (commit 2710106).
-- ============================================================================

with
target as (
  select to_regprocedure('public.place_order(jsonb, jsonb, text, text, uuid)') as fn
),
p as (
  select pr.oid, pr.prosrc, pr.proacl, pr.proowner, pr.prosecdef, pr.provolatile, pr.proconfig,
         pr.prorettype, l.lanname
  from pg_proc pr
  join target t on pr.oid = t.fn
  join pg_language l on l.oid = pr.prolang
),
acl as (
  select a.grantee, a.privilege_type
  from p, lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
),
markers(label, needle) as (
  values ('advisory lock on the key',   'pg_advisory_xact_lock(hashtextextended(''ps.place_order:'''),
         ('replay answer',              '''replayed'', true'),
         ('replay e-mail check',        'This checkout was already used for another order'),
         ('COD-only check',             'Only Cash on Delivery is available at the moment'),
         ('variant locks',              'for update of v'),
         ('combo locks',                'for update of c'),
         ('combo product check',        'it contains a product that is no longer sold'),
         ('per-order stock totals',     'select coalesce(sum((x ->> ''quantity'')::int), 0) into v_need'),
         ('key saved on the order',     'p_idempotency_key);')
),
idx as (
  select c.relname, i.indisunique, i.indisvalid, i.indpred is not null as is_partial,
         pg_get_indexdef(i.indexrelid) as def
  from pg_index i
  join pg_class c on c.oid = i.indexrelid
  where i.indrelid = 'public.orders'::regclass and c.relname = 'orders_idempotency_key_key'
),
col as (
  select data_type, udt_name, is_nullable, column_default
  from information_schema.columns
  where table_schema = 'public' and table_name = 'orders' and column_name = 'idempotency_key'
)
select * from (
  -- ---------------- Column ----------------
  select '1 column' as section, 'orders.idempotency_key is a nullable uuid without default' as check_name,
         coalesce((select udt_name = 'uuid' and is_nullable = 'YES' and column_default is null from col), false) as ok,
         coalesce((select data_type::text || ' / ' || udt_name::text || ' / nullable ' || is_nullable::text || ' / default ' || coalesce(column_default::text, 'none') from col), 'column missing') as detail
  union all
  select '1 column', 'column comment set', col_description('public.orders'::regclass,
           (select attnum from pg_attribute where attrelid = 'public.orders'::regclass and attname = 'idempotency_key')) is not null,
         coalesce(col_description('public.orders'::regclass,
           (select attnum from pg_attribute where attrelid = 'public.orders'::regclass and attname = 'idempotency_key')), 'none')

  -- ---------------- Index ----------------
  union all
  select '2 index', 'orders_idempotency_key_key: unique, partial, valid',
         coalesce((select indisunique and indisvalid and is_partial from idx), false),
         coalesce((select def from idx), 'index missing')

  -- ---------------- Function ----------------
  union all
  select '3 function', 'five-argument place_order exists', (select fn is not null from target),
         coalesce((select pg_get_function_arguments(oid) from p), 'missing')
  union all
  select '3 function', 'four-argument place_order is gone',
         to_regprocedure('public.place_order(jsonb, jsonb, text, text)') is null, 'expect true'
  union all
  select '3 function', 'exactly one place_order',
         (select count(*) = 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'place_order'),
         (select coalesce(string_agg(pg_get_function_identity_arguments(oid), ' | '), 'none')
            from pg_proc where pronamespace = 'public'::regnamespace and proname = 'place_order')
  union all
  select '3 function', 'plpgsql, returns jsonb, security definer, volatile',
         coalesce((select lanname = 'plpgsql' and prorettype = 'jsonb'::regtype and prosecdef and provolatile = 'v' from p), false),
         coalesce(
           (
             select lanname::text
                 || ' / ' || format_type(prorettype, null)
                 || ' / definer ' || prosecdef::text
                 || ' / volatility ' || provolatile::text
             from p
           ),
           'missing'
         )
  union all
  select '3 function', 'search_path is public, pg_temp',
         coalesce((select proconfig = array['search_path=public, pg_temp'] from p), false),
         coalesce((select array_to_string(proconfig, '; ') from p), 'not set')
  union all
  select '3 function', 'body is byte-identical to migration 08 (fingerprint)',
         coalesce((select md5(ltrim(replace(prosrc, E'\r', ''), E'\n')) = 'f58df5ff55e84e958d1e27336cd82f6e' from p), false),
         coalesce((select md5(ltrim(replace(prosrc, E'\r', ''), E'\n')) from p), 'missing') || ' (expected f58df5ff55e84e958d1e27336cd82f6e)'
  union all
  select '3 function', 'all migration 08 logic markers present',
         coalesce((select bool_and(position(m.needle in p.prosrc) > 0) from markers m, p), false),
         coalesce((select string_agg(m.label, ', ') from markers m, p where position(m.needle in p.prosrc) = 0), 'none missing')
  union all
  select '3 function', 'stock decrement stays off (the migration default)',
         coalesce((select position('c_decrement_stock constant boolean := false' in prosrc) > 0 from p), false),
         'expect true'

  -- ---------------- Permissions ----------------
  union all
  select '4 permissions', 'anon may execute',
         coalesce((select has_function_privilege('anon', fn::oid, 'EXECUTE') from target), false), 'expect true'
  union all
  select '4 permissions', 'authenticated may execute',
         coalesce((select has_function_privilege('authenticated', fn::oid, 'EXECUTE') from target), false), 'expect true'
  union all
  select '4 permissions', 'no execute for PUBLIC',
         not exists (select 1 from acl where grantee = 0 and privilege_type = 'EXECUTE'), 'expect true'
  union all
  select '4 permissions', 'owner and full grant list (info)', null,
         (select pg_get_userbyid(proowner)::text || ' | ' || coalesce(proacl::text, 'default') from p)
  union all
  select '4 permissions', 'validate_coupon present and callable by anon',
         coalesce(has_function_privilege('anon', to_regprocedure('public.validate_coupon(text, numeric)')::oid, 'EXECUTE'), false),
         'expect true'
  union all
  select '4 permissions', 'visitors cannot read orders',
         not (has_table_privilege('anon', 'public.orders', 'SELECT') or has_table_privilege('anon', 'public.order_items', 'SELECT')),
         'expect true'

  -- ---------------- Constraints and triggers (08 adds none; listed to spot other changes) ----------------
  union all
  select '5 constraints', 'constraints on orders (info)', null,
         (select string_agg(conname::text || ': ' || pg_get_constraintdef(oid), ' | ' order by conname)
            from pg_constraint where conrelid = 'public.orders'::regclass)
  union all
  select '5 triggers', 'orders has only the setup trigger ps_set_updated_at',
         not exists (select 1 from pg_trigger where tgrelid = 'public.orders'::regclass
                       and not tgisinternal and tgname <> 'ps_set_updated_at'),
         (select coalesce(string_agg(tgname::text, ', '), 'none') from pg_trigger
           where tgrelid = 'public.orders'::regclass and not tgisinternal)

  -- ---------------- Step 09 must not be present yet ----------------
  union all
  select '6 step 09', 'step 09 not applied',
         to_regprocedure('public.place_order_core(jsonb, jsonb, text, text, uuid)') is null
         and not exists (select 1 from information_schema.columns
                         where table_schema = 'public' and table_name = 'orders' and column_name = 'razorpay_order_id'),
         'true = 09 can still run'

  -- ---------------- Data (counts only) ----------------
  union all
  select '7 data', 'orders total / orders saved with a key (info)', null,
         (select count(*)::text || ' / ' || count(idempotency_key)::text from public.orders)
  union all
  select '7 data', 'first and last order saved with a key (info)', null,
         (select coalesce(min(created_at)::text, 'none') || ' / ' || coalesce(max(created_at)::text, 'none')
            from public.orders where idempotency_key is not null)

  -- ---------------- Full definition, for review ----------------
  union all
  select '8 definition', 'pg_get_functiondef (info)', null,
         (select pg_get_functiondef(fn::oid) from target)
) checks
order by section, check_name;
