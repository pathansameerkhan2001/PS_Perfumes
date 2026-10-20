# 14 — AWS Migration Assessment (Supabase repair vs. AWS)

**Status:** assessment only. No AWS resources have been created, and no provider, data or production configuration has been changed. **Prepared:** 2026-10-20.

## 1. Recommendation

**Repair Supabase. Do not migrate to AWS now.**

The admin warning, the 403 upload error and the empty admin dashboard all come from one cause: the database-side admin check (`is_admin()`) does not recognise the administrator, and the prepared migration that fixes it (`supabase/migrations/20261019_admin_media_and_product_delete.sql`) has not been applied. This is a configuration gap, not a platform limitation. The fix is a single reviewed SQL transaction that rolls back completely on any error. Section 4 of [13](13-Production-Migration-and-Handover.md) gives the full go/no-go procedure for it.

An AWS migration would not fix that cause any faster. It would replace a one-transaction repair with a multi-week rewrite of authentication, every data-access path and the media pipeline.

Reconsider AWS only if one of these becomes true:
- The migration's documented stop conditions cannot be resolved. For example, the SQL Editor role cannot manage policies on `storage.objects`, **and** the policies also cannot be created in Dashboard → Storage → Policies.
- The business needs server-side logic Supabase cannot host. This is unlikely: payment webhooks and email can run in Supabase Edge Functions.
- There is a separate organisational requirement for AWS, such as consolidated billing, compliance or existing AWS operations staff.

## 2. Side-by-side comparison

| Dimension | Repair Supabase | Migrate to AWS (S3 + RDS PostgreSQL + API) |
|---|---|---|
| Fixes the current outage | Yes. Apply the migration, then verify with the simulation file | Only after the whole migration is finished |
| Implementation effort | Hours: backup, diagnostics, review, apply, verify | About 4–8 engineer-weeks (see §3) |
| Code changed | None for the fix (already in the repo) | All 14 service modules, auth, admin guard, storage helper, checkout |
| New components to build | None | Backend API, auth flows, presigned-upload endpoint, IAM, deployment pipeline |
| Monthly cost (current traffic) | Supabase Free or Pro (Pro is about US$25/month) | About US$30–80/month: RDS single-AZ small instance, storage, backups, API, S3, CloudFront. Multi-AZ roughly doubles the RDS cost. Estimate only — check current ap-south-1 pricing |
| Security model | Postgres RLS + Storage policies, already written and reviewed | Must be rebuilt in API code. Every endpoint needs its own authorisation check, so one missed check exposes data |
| Data-migration risk | None. The migration deletes no rows or files | Schema + data dump/restore, auth user migration (password hashes), media copy, URL rewrites |
| Downtime | None expected (one short transaction) | Planned cutover window plus a DNS/config switch |
| Ongoing maintenance | Low: managed Postgres, Auth, Storage | Higher: patching/upgrades for the API runtime, IAM reviews, RDS maintenance windows, monitoring and alarms |
| Rollback | Rollback block in the migration plus saved `is_admin()` definition | Must keep Supabase running in parallel until AWS is proven |

## 3. What an AWS migration would involve (if ever approved)

1. **Database (Amazon RDS for PostgreSQL)**
   - `pg_dump` the `public` schema and data from Supabase, then restore it into RDS (same PostgreSQL major version).
   - RLS policies that reference `auth.uid()` / `auth.jwt()` will not work on RDS: those functions are Supabase-specific. Either rewrite the policies for a custom JWT claim setting, or (more common) enforce authorisation in the API and connect as a least-privilege role.
   - The `security definer` functions (`admin_delete_product`, `place_order`, `validate_coupon`, admin-user functions) must be ported and re-tested.
2. **Authentication**
   - Supabase Auth users (including bcrypt password hashes) live in `auth.users`. Options: Amazon Cognito (bulk import with a forced password reset, or a user-migration Lambda trigger), or a self-built auth service. Either way, admins and customers sign in again.
   - The admin role moves from `admin_users` + RLS to Cognito groups or claims, checked in the API.
3. **Backend API (required, because the browser must never hold database or AWS credentials)**
   - API Gateway + Lambda (or a small container on ECS/App Runner) exposing the operations the 14 service modules currently perform directly against Supabase.
   - Each endpoint validates the caller's JWT and role. Inputs are validated server-side, and prices are always computed server-side (as `place_order` does today).
4. **Media (Amazon S3 + CloudFront)**
   - Bucket with **Block Public Access on**. Public delivery through CloudFront with Origin Access Control.
   - Uploads: the admin calls the API, which checks the admin role and returns a **presigned PUT URL** limited to one key under an allowed prefix (`products/`, `hero/`, …), with a short expiry and a content-type/size condition. The browser uploads directly to S3 and never sees AWS credentials.
   - IAM: the API's execution role gets only `s3:PutObject` / `s3:DeleteObject` on `arn:aws:s3:::<bucket>/products/*` (and the other allowed prefixes), plus `s3:GetObject` only if needed. No `s3:*`, and no bucket-wide `ListBucket` unless required.
   - Copy existing objects from the `ps-perfumes` bucket (Supabase S3-compatible endpoint or download/upload). Then rewrite stored URLs in `products.main_image_url`, `fragrance_notes` gallery entries, `hero_slides`, `instagram_reels`, `categories`, `combos` and `homepage_sections` with a reviewed, reversible SQL update.
5. **Application configuration**
   - Replace `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` with `VITE_API_BASE_URL` (plus Cognito pool/client IDs if Cognito is used). No AWS secret ever goes in a `VITE_*` variable, because Vite inlines them into the public bundle.
   - Server-side secrets go in AWS Secrets Manager or SSM Parameter Store.
6. **Cutover and rollback**
   - Freeze admin edits, take a final Supabase backup, run the final data and media sync, deploy the AWS-backed frontend, and smoke-test.
   - Rollback: redeploy the previous Vercel build (still pointing at Supabase). Supabase stays read-write and untouched until AWS has run cleanly for an agreed period. Orders placed on AWS during a rollback window must be copied back by hand, so keep that window short.

## 4. Security requirements that apply either way

- RLS stays enabled on every application table. Anonymous users may only read active/public rows and create orders through `place_order`.
- No service-role key, database password or AWS credential in the frontend, the repository or any `VITE_*` variable.
- Admin authority comes from server-controlled data only (`admin_users` row or `app_metadata.role`), never from email patterns or `user_metadata`.
- Turn off public sign-up while the only accounts are admins (Authentication → Sign In / Providers), or keep it on with the strict `is_admin()` from the migration.
- Enable MFA for dashboard and admin accounts.
