-- ============================================================================
-- PS PERFUMES — NEW PROJECT: fixups after importing data from the old project
-- Target: ps-perfumes-production (project ref pwacxxrghlglvdtclbig)
-- Status: NOT APPLIED. Run only after the data import (README §4) AND the media copy
--         (scripts/copy-storage-to-new-project.mjs), and only after approval.
--
-- What it does (one transaction, rows keep their ids):
--   1. Rewrites stored public URLs from the old project/bucket to the new ones:
--        https://jnrmmhzhhmjxefapkemv.supabase.co/storage/v1/object/public/ps-perfumes/<path>
--     -> https://pwacxxrghlglvdtclbig.supabase.co/storage/v1/object/public/Ps-perfumes-media/<path>
--      Object paths are unchanged by the copy, so only the prefix changes.
--   2. Removes a leading "ps-perfumes/" from *_path columns (the app strips only the new
--      bucket name).
--   3. store_settings: if the old setting_value column was jsonb, string values arrive as
--      '"text"'; they are unwrapped to plain text.
-- updated_at triggers are disabled during the rewrite so imported timestamps are kept.
-- Re-running is harmless (every statement only matches rows not yet rewritten).
-- ============================================================================

begin;

create or replace function pg_temp.ps_fix_url(v text)
returns text language sql immutable as $$
  select replace(v,
    'https://jnrmmhzhhmjxefapkemv.supabase.co/storage/v1/object/public/ps-perfumes/',
    'https://pwacxxrghlglvdtclbig.supabase.co/storage/v1/object/public/Ps-perfumes-media/')
$$;

create or replace function pg_temp.ps_fix_path(v text)
returns text language sql immutable as $$
  select regexp_replace(v, '^/?ps-perfumes/', '')
$$;

do $$
declare t text;
begin
  foreach t in array array['categories', 'products', 'combos', 'hero_slides', 'instagram_reels',
                           'homepage_sections', 'store_settings']
  loop
    execute format('alter table public.%I disable trigger ps_set_updated_at', t);
  end loop;
end $$;

update public.products
   set main_image_url  = pg_temp.ps_fix_url(main_image_url),
       main_image_path = pg_temp.ps_fix_path(main_image_path),
       fragrance_notes = replace(replace(fragrance_notes::text,
         'https://jnrmmhzhhmjxefapkemv.supabase.co/storage/v1/object/public/ps-perfumes/',
         'https://pwacxxrghlglvdtclbig.supabase.co/storage/v1/object/public/Ps-perfumes-media/'),
         '"ps-perfumes/', '"')::jsonb
 where main_image_url like '%jnrmmhzhhmjxefapkemv%' or main_image_path like '%ps-perfumes/%'
    or fragrance_notes::text like '%jnrmmhzhhmjxefapkemv%' or fragrance_notes::text like '%"ps-perfumes/%';

update public.product_images
   set image_url = pg_temp.ps_fix_url(image_url), image_path = pg_temp.ps_fix_path(image_path)
 where image_url like '%jnrmmhzhhmjxefapkemv%' or image_path like '%ps-perfumes/%';

update public.categories
   set image_url = pg_temp.ps_fix_url(image_url), image_path = pg_temp.ps_fix_path(image_path)
 where image_url like '%jnrmmhzhhmjxefapkemv%' or image_path like '%ps-perfumes/%';

update public.combos
   set image_url = pg_temp.ps_fix_url(image_url), image_path = pg_temp.ps_fix_path(image_path)
 where image_url like '%jnrmmhzhhmjxefapkemv%' or image_path like '%ps-perfumes/%';

update public.hero_slides
   set image_url = pg_temp.ps_fix_url(image_url), image_path = pg_temp.ps_fix_path(image_path),
       mobile_image_url = pg_temp.ps_fix_url(mobile_image_url), mobile_image_path = pg_temp.ps_fix_path(mobile_image_path)
 where image_url like '%jnrmmhzhhmjxefapkemv%' or mobile_image_url like '%jnrmmhzhhmjxefapkemv%'
    or image_path like '%ps-perfumes/%' or mobile_image_path like '%ps-perfumes/%';

update public.instagram_reels
   set thumbnail_url = pg_temp.ps_fix_url(thumbnail_url), thumbnail_path = pg_temp.ps_fix_path(thumbnail_path)
 where thumbnail_url like '%jnrmmhzhhmjxefapkemv%' or thumbnail_path like '%ps-perfumes/%';

update public.homepage_sections
   set image_url = pg_temp.ps_fix_url(image_url), image_path = pg_temp.ps_fix_path(image_path),
       settings = replace(settings::text,
         'https://jnrmmhzhhmjxefapkemv.supabase.co/storage/v1/object/public/ps-perfumes/',
         'https://pwacxxrghlglvdtclbig.supabase.co/storage/v1/object/public/Ps-perfumes-media/')::jsonb
 where image_url like '%jnrmmhzhhmjxefapkemv%' or image_path like '%ps-perfumes/%'
    or settings::text like '%jnrmmhzhhmjxefapkemv%';

-- Unwrap JSON-encoded strings ('"PS PERFUMES"' -> 'PS PERFUMES'); invalid JSON is left as is
update public.store_settings s
   set setting_value = (s.setting_value::jsonb #>> '{}')
 where s.setting_value ~ '^\s*".*"\s*$'
   and pg_input_is_valid(s.setting_value, 'jsonb');

update public.store_settings
   set setting_value = pg_temp.ps_fix_url(setting_value)
 where setting_value like '%jnrmmhzhhmjxefapkemv%';

-- order_items.product_name / orders are historical text records: not rewritten.

do $$
declare t text;
begin
  foreach t in array array['categories', 'products', 'combos', 'hero_slides', 'instagram_reels',
                           'homepage_sections', 'store_settings']
  loop
    execute format('alter table public.%I enable trigger ps_set_updated_at', t);
  end loop;
end $$;

commit;

-- Then re-run 05_verify.sql: old_project_url_refs must be 0 and row_counts must match the
-- old project's counts recorded before the export (README §4 step 1).
