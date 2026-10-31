# Moving PS PERFUMES to the new Supabase project

| | Old (source, read-only from now on) | New (target) |
|---|---|---|
| Project | `jnrmmhzhhmjxefapkemv` | `ps-perfumes-production` · `pwacxxrghlglvdtclbig` |
| URL | `https://jnrmmhzhhmjxefapkemv.supabase.co` | `https://pwacxxrghlglvdtclbig.supabase.co` |
| Bucket | `ps-perfumes` | `Ps-perfumes-media` (case-sensitive) |

**Status:** prepared, **nothing applied**. Every ⛔ step needs explicit approval. The old project is never modified: it is only read during the export. That includes no password resets and no new keys there. Without approval, do not change the old project, Vercel's production settings, or the live site.

## 0. Current state (2026-10-20) and the short path to a working admin

- Live site: built against `pwacxxrghlglvdtclbig` with bucket `Ps-perfumes-media` (checked in the deployed bundle; no old-project references).
- Admin sign-in **succeeds** (Auth works), then the panel reports *"the database administrator check (is_admin) is not installed"*. That means steps 1–4 below have not been applied yet. This is expected, not a code fault.

Run in the new project's SQL Editor, each file **in full**, in this order:
`00` (read-only, check the result) → `01` → `02` → `03` → `04` → `05` (read-only). Then sign out and back in at `/admin/login`.

What each result means at login:

| Login message | Meaning |
|---|---|
| "…is_admin is not installed…" | `02` not applied (or the schema cache not yet refreshed — wait a minute and retry) |
| "…not registered as an active administrator…" | `02` applied, but `04` not applied or it was rolled back |
| Dashboard opens, no red banner | `is_admin()` returned true for this session |

## 1. What the application uses

| Area | Objects |
|---|---|
| Tables (16) | `admin_users`, `categories`, `products`, `product_variants`, `product_images`, `combos`, `combo_items`, `reviews`, `hero_slides`, `instagram_reels`, `homepage_sections`, `store_settings`, `coupons`, `customers`, `orders`, `order_items` (+ optional `contact_enquiries`) |
| RPC functions | `is_admin`, `is_super_admin`, `validate_coupon`, `place_order`, `admin_delete_product`, `admin_list_admin_users`, `admin_grant_admin`, `admin_update_admin`, `admin_revoke_admin` |
| Triggers | `ps_set_updated_at` (BEFORE UPDATE) on tables with `updated_at`. No triggers on `auth.users` |
| Auth | Email + password, **administrators only**. The storefront has no customer accounts; orders are guest orders (`customer_id` is always null) |
| Storage folders | `products/`, `categories/`, `combos/`, `hero/` (incl. `hero/ps-perfumes-hero-desktop.mp4`, loaded by the homepage), `homepage/`, `reels/`, `reviews/`, `logo/`, `banners/` |
| Stored media references | Full public URLs in `*_url` columns and in `products.fragrance_notes` (glass/pvc/gallery images), object paths in `*_path` columns |

Not used by the code and not created: `profiles`, `wishlists`, `site_settings`, `cart_items`, `inventory`. `supabase/schema.sql` and `supabase/migrations/storage_and_permissions_fix.sql` are stale or unsafe and must not be run on the new project.

## 2. Schema setup (new project, SQL Editor) — run in this order

Check before every run: the browser URL contains `/project/pwacxxrghlglvdtclbig/`. Run each file **in full**. Each one is a single transaction, so any error leaves nothing behind.

| # | File | Effect |
|---|---|---|
| ⛔ 0 | `00_preflight_readonly.sql` | **Read-only.** Confirms Auth user `a5b3ff02-8d08-454a-8474-d5f51a4d890f` exists, is `brandnix.in@gmail.com`, is confirmed. Reports any tables, `admin_users` schema/rows, `is_admin()` definition, buckets and Storage policies already in the project. Continue with 1 only if `public_tables` is `[]` and the user checks pass; otherwise send the CSV for review |
| ⛔ 1 | `01_schema.sql` | 16 tables, constraints, indexes, `updated_at` triggers, RLS **enabled**, default Data API grants revoked. Refuses to run if `products`/`orders` already exist |
| ⛔ 2 | `02_auth_functions_rls.sql` | `is_admin()` (active `admin_users` row or server-set `app_metadata.role`; no e-mail or `user_metadata` trust), coupon and checkout functions, safe delete, admin-user RPCs, exact grants, RLS policies (table in §3) |
| 2-check | `02_check_readonly.sql` | **Read-only.** If `02` reports "policy … already exists", Step 2 was most likely applied before. This shows whether it is complete (`step2_complete = true` → go straight to 03). `02` itself is re-runnable: it replaces only its own `ps_*` policies by name and stops if any other policy exists on these tables |
| ⛔ 3 | `03_storage.sql` | Bucket `Ps-perfumes-media` (public read by URL, 50 MB, jpeg/png/webp/mp4) and three admin-only Storage policies. If the SQL role cannot manage `storage.objects`, it stops; create the same three policies in Dashboard → Storage → Policies |
| — | Dashboard → Authentication → Users | Only if step 0 showed the UID missing or unconfirmed: fix it there (the UID `a5b3ff02-…` was supplied as already created) |
| ⛔ 4 | `04_bootstrap_admin.sql` | Creates or updates the **single** `admin_users` row for UID `a5b3ff02-8d08-454a-8474-d5f51a4d890f` (super_admin, active) after re-checking the UID/e-mail match. Then runs `is_admin()`/`is_super_admin()` as that user and **rolls back** unless both are true |
| 5 | `05_verify.sql` | Read-only checks + rolled-back permission probes; expected values are in its header. Export the grid as CSV |
| ⛔ 8 | `08_checkout_hardening.sql` | Run `08_preflight_readonly.sql` first. Combo validation and idempotent checkout. Already applied in Production: do not edit it or run it again |
| ⛔ 9 | `proposed-09-v2/09v2_razorpay_payments.sql` | Razorpay columns, server-only payment functions and the payment guard trigger. Requires 08 and does **not** replace its `place_order`. **Not applied yet.** Back up first, run `proposed-09-v2/09v2_precheck_readonly.sql` before it and `proposed-09-v2-r1/09v2r1_verify_readonly.sql` after it. **Never run the verification script before the migration**; see [docs/KT/15](../../docs/KT/15-Razorpay-Payments.md). This does not enable Pay Online, which is a separate approval. To remove it, follow [docs/KT/16](../../docs/KT/16-Razorpay-Rollback-Runbook.md) and `09v2_rollback.sql`, never the files alone |
| ⛔ opt. | `../migrations/20261020_contact_enquiries_optional.sql` | Only if contact-form messages should be stored (owner decision). Works unchanged on the new project after step 2 |

**Do not run** the old-project files `20261019_*`, `20261022_*`, `20261023_*` or `repairs/*` on the new project; their content is already included in steps 2–3.

**Do not run** `09_razorpay_payments.sql` or `09_rollback.sql`. They are the original Step 9, superseded by `proposed-09-v2/`, and the original replaces `place_order`. These files in this folder are still used with v2: `09_reconciliation_readonly.sql`, `09_rollback_preflight_readonly.sql`, `09_rollback_postcheck_readonly.sql` and `09_rollback_cleanup_optional.sql`.

## 3. Access model (RLS stays enabled on every table)

| Table / object | Visitor (anon) | Signed-in non-admin | Admin (`is_admin()`) |
|---|---|---|---|
| products, categories, combos, hero_slides, instagram_reels | read active rows | same as visitor | full manage |
| product_variants | read active variants of active products | same | full manage |
| product_images, combo_items | read rows whose parent is active | same | full manage |
| homepage_sections | read | same | full manage |
| reviews | read approved | same | full manage |
| store_settings | read public contact/shipping keys only | same | full manage |
| coupons, customers | none (codes checked via `validate_coupon`) | none | full manage |
| orders, order_items | none. Orders are created **only** by `place_order()`, which prices everything from the database | none | full manage |
| admin_users | none | read **own** row | read all; changes only via super_admin RPCs |
| Storage `Ps-perfumes-media` | files load by public URL; no listing, no writes | none | select / insert / delete in the folders above; no overwrite |

## 4. Data migration (only after steps 1–5 pass)

**What can be migrated:** every row of the 15 data tables, keeping ids (so all relationships, order history and image paths stay intact), plus all Storage objects at identical paths.

**Not migrated:**
- `admin_users`: Auth user ids differ between projects; step 4 recreates the admin.
- `auth.users` / passwords: there are no customer accounts, and admins set a new password.
- `contact_enquiries`: it does not exist in the old project.

**Blocker found 2026-10-20:** `jnrmmhzhhmjxefapkemv.supabase.co` no longer exists in DNS (NXDOMAIN via Google and Cloudflare resolvers). The old project is paused, removed or deleted, so nothing below can be exported until its state is known. Check it in the Supabase dashboard. A paused project can usually be restored from there, but that changes the old project and needs approval. If it was deleted, data can only come from a backup taken earlier.

**Unknown until exported:** the actual old row counts. Anonymous reads of the old project return 0 rows except `categories`, so the true counts can only be seen with owner access.

1. **Record the source counts (read-only):** old project → SQL Editor → run `supabase/diagnostics/20261019_media_and_product_delete_diagnostics.sql` → export CSV. Section 16 holds the row counts, section 13 the status and discount constraints.
2. **Export the old schema for comparison (read-only):** with the old database's existing connection string (Dashboard → Connect → Session pooler):
   ```
   pg_dump "<OLD_DB_URL>" --schema-only --schema=public --no-owner --no-privileges -f old_public_schema.sql
   ```
   **Stop and review it against `01_schema.sql` before importing.** Extra old columns, different types or status values outside the CHECK constraints would make the import fail (safely, in one transaction). The schema is adjusted first if needed.
   If the database password is not known, do **not** reset it on the old project (that modifies it). Use option B below instead.
3. **Option A — export the data (read-only, preferred):**
   ```
   pg_dump "<OLD_DB_URL>" --data-only --column-inserts --no-owner --no-privileges \
     -t public.categories -t public.products -t public.product_variants -t public.product_images \
     -t public.combos -t public.combo_items -t public.reviews -t public.hero_slides \
     -t public.instagram_reels -t public.homepage_sections -t public.store_settings \
     -t public.coupons -t public.customers -t public.orders -t public.order_items \
     -f old_public_data.sql
   ```
   This file contains customer names, phone numbers and addresses. Keep it off Git and off shared drives, and delete it after the import is verified.
   **Option B — no database password:** old project → Table Editor → each table → Export → CSV. Then new project → Table Editor → same table → Import CSV, in the order of the `-t` list above (parents before children).
4. ⛔ **Import (new project):**
   ```
   psql "<NEW_DB_URL>" --single-transaction -v ON_ERROR_STOP=1 -f old_public_data.sql
   ```
   All-or-nothing. Use `pg_dump`/`psql` version 17 (≥ the server version).
5. ⛔ **Copy media** (trusted machine; secret keys only in the shell, see the script header):
   ```
   node scripts/copy-storage-to-new-project.mjs          # dry run
   node scripts/copy-storage-to-new-project.mjs --apply  # copy
   ```
   It uses the old project's **existing** secret/service-role key (reading it does not change the project). It never deletes, never overwrites, and reports files whose type the new bucket rejects.
6. ⛔ **Rewrite media URLs:** run `06_post_import_fixups.sql` (old host/bucket → new; `ps-perfumes/` prefixes; JSON-quoted settings). Needs PostgreSQL 16+ (`pg_input_is_valid`); new projects run 17.
7. **Verify:** re-run `05_verify.sql`. `row_counts` must equal step 1, and `old_project_url_refs` must be 0.
8. **Orders placed after the export** on the old site: compare `max(created_at)` of orders in both projects at cutover and import the difference the same way. To avoid a gap, pause checkout on the old site during the cutover (owner decision).

## 5. Environment variables

The code reads exactly these (all in `src/`, through `import.meta.env`):

| Variable | Where | Value |
|---|---|---|
| `VITE_SUPABASE_URL` | Vercel (Preview first, then Production) + local `.env` | `https://pwacxxrghlglvdtclbig.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | same | new project's **publishable** key (`sb_publishable_…`), Project Settings → API Keys |
| `VITE_SUPABASE_STORAGE_BUCKET` | same | `Ps-perfumes-media` (**new variable**; without it the app uses the old name `ps-perfumes`) |
| `VITE_SITE_URL` | same | `https://psperfumes.com` |
| `VITE_ADMIN_EMAIL` | optional | no longer used for access |

- `SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY` (without `VITE_`) are **not read** by the app. Vite only exposes `VITE_*` variables to the browser code.
- `SUPABASE_SECRET_KEY` is **not needed by the app at all**: there is no backend, and every privileged operation is a `security definer` database function guarded by `is_admin()`. Never add it to Vercel as a `VITE_*` variable, to `.env`, or to Git. Its only use is the one-off media copy script, on a trusted machine, from shell variables.
- The JWKS URL is not needed by the app. Supabase verifies tokens itself. It matters only if a backend that verifies Supabase JWTs is added later.
- Vite inlines values at build time, so **redeploy after any change**. Note that `.env` is tracked in Git: updating it locally is fine for builds, but commit only the publishable key, never a secret.

## 6. New project Auth settings (dashboard, manual)

- Authentication → URL Configuration: Site URL `https://psperfumes.com`; add `https://psperfumes.com/**` and the Vercel preview domain to Redirect URLs.
- Sign In / Providers → Email enabled. **Turn off "Allow new users to sign up"** (only admins have accounts). With the strict `is_admin()` a stranger's sign-up grants nothing, but it removes noise.
- Enable MFA for the admin account and the Supabase organisation members.

## 7. Cutover and rollback

1. Steps 1–5 (and §4 if migrating data) pass.
2. ⛔ Vercel **Preview** environment: set the §5 variables → deploy a preview → run the manual tests (§8) on the preview URL.
3. ⛔ Vercel **Production** variables → redeploy → smoke test.
4. **Rollback:** restore the previous production variables and promote the previous deployment. The old project is untouched, so this is instant. Orders placed in the new project during the window would need copying back by hand.

## 8. Manual tests still required (none of these has been run)

| # | Test | Expected |
|---|---|---|
| M-1 | Admin login with the new password | Dashboard opens, no red `is_admin()` banner, badge "Supabase connected" |
| M-2 | Sign in with a non-admin account (if one exists) | "You do not have permission…", signed out |
| M-3 | Products → New → upload primary + gallery images → save → reload | Images load from `pwacxxrghlglvdtclbig…/Ps-perfumes-media/products/…`; product and variants persist |
| M-4 | Edit price/stock → save → reload; deactivate/activate | Values persist; inactive product hidden from shop |
| M-5 | Delete a product without orders; delete one with orders | First is deleted (files removed); second is archived |
| M-6 | Categories, combos, hero, reels, homepage, coupons, settings: create/edit/save | Persist after reload |
| M-7 | Private window: shop, product page, homepage, hero video | Active items only; images and video load |
| M-8 | Checkout (COD) with and without a coupon | Order number shown; Admin → Orders shows totals priced by the database; coupon `used_count` +1 |
| M-9 | Admin → Orders: change status | Persists |
| M-10 | Layouts at 360, 768, 1024 and 1440 px (storefront + admin, incl. sidebar drawer) | No horizontal scroll, readable tables |
| M-11 | Re-run `05_verify.sql` | All expected values |
