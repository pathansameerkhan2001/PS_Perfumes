# Step 13 (proposed): hero mobile film and music, contact enquiries

**Status: NOT APPLIED. Nothing here has been run against Production.**

| File | What it does |
|---|---|
| `13_admin_media_enquiries.sql` | One transaction: 4 nullable `hero_slides` columns, the `contact_enquiries` table with RLS, MP3 allowed in the media bucket |
| `13_verify_readonly.sql` | Read-only checks, safe before and after |
| `13_rollback.sql` | Undo (deletes stored enquiries; see its warning) |

## What works before it is applied

- **Homepage admin:** nothing is needed. `homepage_sections` already lets admins insert and update. The table is simply empty, and the first **Save All Layouts** creates the rows.
- **Hero Sections:** desktop film, poster, label, subtitle, order and status work today. The **mobile film** and **background music** fields are shown as unavailable until this step adds their columns.
- **Music uploads:** MP3 uploads are refused by the bucket until this step; a public MP3 URL can be saved once the columns exist.
- **Enquiries:** the Contact page keeps showing e-mail, Instagram and WhatsApp instead of the form, and Admin → Enquiries explains that storage is not set up. It never shows a misleading empty list.

## Order

1. Run `13_verify_readonly.sql` (expect the step-13 checks to be false or 0).
2. Run `13_admin_media_enquiries.sql`.
3. Run `13_verify_readonly.sql` again (every `ok` true).
4. Add `'audio/mpeg'` to the bucket list in `03_storage.sql`, so a later re-run of that file does not remove it.

## Supersedes

`supabase/migrations/20261020_contact_enquiries_optional.sql` (never applied). This step uses the statuses the admin now offers (`unread`, `read`, `resolved`), adds `updated_at`, and limits visitor inserts to the message columns. Do not run both.

## Not covered

There is no database-side rate limit on enquiries. The form is protected by the column grants and checks only; add a captcha or an Edge Function if spam appears.
