-- ============================================================================
-- PS PERFUMES — STEP 13 rollback
-- Status: PROPOSED. Run only after written approval.
--
-- WARNING: dropping contact_enquiries deletes every stored enquiry, and dropping the hero
-- columns forgets the mobile films and music set in Admin → Hero Sections (the files stay in
-- Storage). Export the enquiries first if they are needed:
--   select * from public.contact_enquiries order by created_at;
-- ============================================================================

begin;

set local lock_timeout = '5s';

drop table if exists public.contact_enquiries;

alter table public.hero_slides
  drop column if exists mobile_video_url,
  drop column if exists mobile_video_path,
  drop column if exists audio_url,
  drop column if exists audio_path;

-- Stored MP3 files remain in the bucket; new MP3 uploads are refused again
update storage.buckets
   set allowed_mime_types = array_remove(allowed_mime_types, 'audio/mpeg')
 where id = 'Ps-perfumes-media';

commit;
