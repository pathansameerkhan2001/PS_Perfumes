-- ============================================================================
-- PS PERFUMES — STEP 13: hero mobile film + background music, contact enquiries
-- Target: ps-perfumes-production (project ref pwacxxrghlglvdtclbig)
-- Status: PROPOSED. NOT APPLIED. Run only after written approval, manually, in the SQL Editor of
--         the project above. Independent of steps 08 to 12: it touches no checkout, payment,
--         product or category object.
--
-- What it adds
--   1. hero_slides: four nullable columns for Admin → Hero Sections
--        mobile_video_url / mobile_video_path  lighter MP4 for phones (optional)
--        audio_url / audio_path                MP3 background music (optional; the website
--                                              never plays it until the visitor presses Play)
--      Existing rows and columns are not changed.
--   2. contact_enquiries: messages from the Contact page, read in Admin → Enquiries.
--        Visitors may only INSERT name, email, phone, subject and message (column grants);
--        the status always starts as 'unread'. They can never read, change or delete rows.
--        Admins (public.is_admin()) read them and set the status: unread → read → resolved.
--   3. Storage: the media bucket also accepts audio/mpeg (MP3). Size limit unchanged (50 MB).
--
-- What it does NOT change
--   Any existing row, policy, grant or function. Products, categories, orders, payments, COD and
--   Razorpay are untouched. homepage_sections needs no change (admins can already write it).
--
-- One transaction: on any error nothing changes, and the file can simply be run again.
-- VERIFY: 13_verify_readonly.sql. ROLLBACK: 13_rollback.sql.
-- NOTE: re-running 03_storage.sql later resets the bucket's types and removes audio/mpeg;
--       add 'audio/mpeg' to its list too when this step is approved.
-- ============================================================================

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- ---------------------------------------------------------------------------
-- 0. Preconditions: stop before changing anything if the database is not as expected
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.hero_slides') is null then
    raise exception 'public.hero_slides is missing. Review before continuing.';
  end if;
  if to_regprocedure('public.is_admin()') is null then
    raise exception 'public.is_admin() is missing (02_auth_functions_rls.sql). Review before continuing.';
  end if;
  if to_regprocedure('public.ps_set_updated_at()') is null then
    raise exception 'public.ps_set_updated_at() is missing (01_schema.sql). Review before continuing.';
  end if;
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'hero_slides'
               and column_name in ('mobile_video_url', 'mobile_video_path', 'audio_url', 'audio_path')) then
    raise exception 'hero_slides already has a step-13 column — step 13 appears to be applied already';
  end if;
  if to_regclass('public.contact_enquiries') is not null then
    raise exception 'public.contact_enquiries already exists (perhaps from 20261020_contact_enquiries_optional.sql). Review it before continuing.';
  end if;
  if not exists (select 1 from storage.buckets where id = 'Ps-perfumes-media') then
    raise exception 'Storage bucket Ps-perfumes-media is missing (03_storage.sql).';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. Hero media columns
-- ---------------------------------------------------------------------------
alter table public.hero_slides
  add column mobile_video_url  text,
  add column mobile_video_path text,
  add column audio_url         text,
  add column audio_path        text;

comment on column public.hero_slides.mobile_video_url is 'Optional lighter MP4 hero film for phones (Admin → Hero Sections).';
comment on column public.hero_slides.audio_url is 'Optional MP3 background music; the website plays it only after the visitor presses Play.';

-- ---------------------------------------------------------------------------
-- 2. Contact enquiries
-- ---------------------------------------------------------------------------
create table public.contact_enquiries (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(btrim(name)) between 1 and 120),
  email       text not null check (char_length(email) between 3 and 200 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone       text check (phone is null or char_length(phone) <= 30),
  subject     text check (subject is null or char_length(subject) <= 200),
  message     text not null check (char_length(btrim(message)) between 1 and 5000),
  status      text not null default 'unread' check (status in ('unread', 'read', 'resolved')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.contact_enquiries is
  'Contact-page messages. Visitors insert only; admins read and set status (unread, read, resolved).';

create index contact_enquiries_created_at_idx on public.contact_enquiries (created_at desc);
create index contact_enquiries_status_created_idx on public.contact_enquiries (status, created_at desc);

create trigger ps_contact_enquiries_updated_at
  before update on public.contact_enquiries
  for each row execute function public.ps_set_updated_at();

alter table public.contact_enquiries enable row level security;

-- Visitors: a new, unread message only
create policy "ps_public_insert_contact_enquiries" on public.contact_enquiries
  for insert to anon, authenticated
  with check (status = 'unread');

-- Admins: everything
create policy "ps_admin_manage_contact_enquiries" on public.contact_enquiries
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

revoke all on public.contact_enquiries from public, anon, authenticated;
-- Only the message fields can be written by an insert; id, status and dates take their defaults
grant insert (name, email, phone, subject, message) on public.contact_enquiries to anon, authenticated;
-- Signed-in users pass the select/update/delete policy only when they are admins
grant select, update, delete on public.contact_enquiries to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Storage: accept MP3 for the hero music (other types and the 50 MB limit unchanged)
-- ---------------------------------------------------------------------------
update storage.buckets
   set allowed_mime_types = array_append(allowed_mime_types, 'audio/mpeg')
 where id = 'Ps-perfumes-media'
   and allowed_mime_types is not null
   and not ('audio/mpeg' = any (allowed_mime_types));

-- ---------------------------------------------------------------------------
-- 4. Self-check before commit
-- ---------------------------------------------------------------------------
do $$
begin
  if (select count(*) from information_schema.columns
       where table_schema = 'public' and table_name = 'hero_slides'
         and column_name in ('mobile_video_url', 'mobile_video_path', 'audio_url', 'audio_path')) <> 4 then
    raise exception 'hero_slides columns were not all added — rolling back';
  end if;
  if (select count(*) from pg_policies where schemaname = 'public' and tablename = 'contact_enquiries') <> 2 then
    raise exception 'contact_enquiries does not have exactly the two expected policies — rolling back';
  end if;
  if has_table_privilege('anon', 'public.contact_enquiries', 'SELECT')
     or has_table_privilege('anon', 'public.contact_enquiries', 'UPDATE')
     or has_table_privilege('anon', 'public.contact_enquiries', 'DELETE') then
    raise exception 'anon can read or change contact_enquiries — rolling back';
  end if;
  if has_column_privilege('anon', 'public.contact_enquiries', 'status', 'INSERT') then
    raise exception 'anon can set the enquiry status — rolling back';
  end if;
  if not exists (select 1 from storage.buckets where id = 'Ps-perfumes-media' and 'audio/mpeg' = any (allowed_mime_types)) then
    raise exception 'The bucket does not accept audio/mpeg — rolling back';
  end if;
end $$;

commit;
