-- ============================================================================
-- PS PERFUMES — OPTIONAL: contact form storage
-- File: supabase/migrations/20261020_contact_enquiries_optional.sql
-- Status: NOT APPLIED. Run only if the store owner wants contact-form messages stored
--         in the database and read in Admin → Enquiries.
-- Requires: 20261019_admin_media_and_product_delete.sql applied first (uses public.is_admin()).
--
-- Without this table the Contact page detects that storage is unavailable, disables the
-- form and shows the store's e-mail / Instagram / WhatsApp details instead. Nothing is
-- ever reported as "sent" unless the database stored it.
--
-- Creates one new table. Does not change or delete any existing data.
-- Visitors may only INSERT a new message (no read, update or delete). Admins manage them.
-- Rollback: drop table public.contact_enquiries;   (deletes the stored messages)
-- ============================================================================

begin;

do $$
begin
  -- is_admin() already existed in production before the main migration, so check for a
  -- function that only the main migration creates.
  if to_regprocedure('public.admin_delete_product(uuid)') is null then
    raise exception 'Apply 20261019_admin_media_and_product_delete.sql first (admin_delete_product not found)';
  end if;
  if to_regclass('public.contact_enquiries') is not null then
    raise exception 'public.contact_enquiries already exists — nothing to do';
  end if;
end $$;

create table public.contact_enquiries (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  email text not null check (char_length(email) between 3 and 200 and email like '%@%'),
  phone text check (phone is null or char_length(phone) <= 30),
  subject text check (subject is null or char_length(subject) <= 200),
  message text not null check (char_length(message) between 1 and 5000),
  status text not null default 'unread' check (status in ('unread', 'read', 'archived')),
  created_at timestamptz not null default now()
);

create index contact_enquiries_created_at_idx on public.contact_enquiries (created_at desc);

alter table public.contact_enquiries enable row level security;

create policy "ps_contact_insert" on public.contact_enquiries
  for insert to anon, authenticated
  with check (status = 'unread');

create policy "ps_admin_manage_contact_enquiries" on public.contact_enquiries
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

grant insert on public.contact_enquiries to anon, authenticated;
grant select, update, delete on public.contact_enquiries to authenticated;

commit;

-- Verify (read-only): select count(*) from public.contact_enquiries;
-- Then submit the Contact form in a private window and check the row appears in Admin → Enquiries.
