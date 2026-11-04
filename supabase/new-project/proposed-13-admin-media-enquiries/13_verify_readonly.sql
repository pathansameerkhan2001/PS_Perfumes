-- ============================================================================
-- PS PERFUMES — STEP 13 verification (READ-ONLY: changes nothing; safe before or after step 13)
-- Each row: check, expected, actual, ok.
-- ============================================================================

with checks as (
  select 'hero_slides step-13 columns' as check_name, '4' as expected,
         (select count(*)::text from information_schema.columns
           where table_schema = 'public' and table_name = 'hero_slides'
             and column_name in ('mobile_video_url', 'mobile_video_path', 'audio_url', 'audio_path')) as actual
  union all
  select 'contact_enquiries exists', 'true', (to_regclass('public.contact_enquiries') is not null)::text
  union all
  select 'contact_enquiries RLS enabled', 'true',
         coalesce((select relrowsecurity::text from pg_class where oid = to_regclass('public.contact_enquiries')), 'false')
  union all
  select 'contact_enquiries policies', '2',
         (select count(*)::text from pg_policies where schemaname = 'public' and tablename = 'contact_enquiries')
  union all
  select 'anon can read enquiries', 'false',
         case when to_regclass('public.contact_enquiries') is null then 'false'
              else has_table_privilege('anon', 'public.contact_enquiries', 'SELECT')::text end
  union all
  select 'anon can set enquiry status', 'false',
         case when to_regclass('public.contact_enquiries') is null then 'false'
              else has_column_privilege('anon', 'public.contact_enquiries', 'status', 'INSERT')::text end
  union all
  select 'anon can insert an enquiry message', 'true',
         case when to_regclass('public.contact_enquiries') is null then 'false'
              else has_column_privilege('anon', 'public.contact_enquiries', 'message', 'INSERT')::text end
  union all
  select 'bucket accepts audio/mpeg', 'true',
         coalesce((select ('audio/mpeg' = any (allowed_mime_types))::text from storage.buckets where id = 'Ps-perfumes-media'), 'false')
  union all
  select 'bucket size limit (bytes)', '52428800',
         (select file_size_limit::text from storage.buckets where id = 'Ps-perfumes-media')
)
select check_name, expected, actual, (expected = actual) as ok from checks;
