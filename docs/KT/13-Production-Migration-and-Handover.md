# 13 — Production Migration and Handover

> **Status (2026-10-21):** working-tree changes on `main` are uncommitted and not deployed. Production (https://psperfumes.com, Vercel) still runs the **old** bundle — verified: it contains the old demo-data key `ps_db_products` and none of the new code; it points at the expected Supabase project. The migration is **not applied** (its functions are absent). No browser test has been run. **Not approved for handover.**

## 1. Facts this plan is based on (verified read-only, 2026-10-20/21)

| Fact | How verified |
|---|---|
| Anonymous visitors can read **0 rows** from every table except `categories` (7 rows) | `select=id&limit=0` with `Prefer: count=exact` (no row data returned) |
| The live storefront therefore shows the **old built-in demo catalogue**, not database products | Old bundle falls back to demo data when a query returns 0 rows |
| Public sign-up is **on**, e-mail confirmation is **on**, e-mail is the only provider | `GET /auth/v1/settings` |
| `is_admin()` and `is_super_admin()` already exist in production (definitions unknown) | RPC probe |
| Hero video `hero/ps-perfumes-hero-desktop.mp4` is publicly served | HTTP 206 |

## 2. Deployment order — migration first, then frontend

**Why the migration goes first (backward compatible with the current old frontend):**

| Old frontend feature | Before migration | After migration, before deploy |
|---|---|---|
| Storefront product/category reads | 0 products visible → demo catalogue | Active products become visible (if any exist); demo only if none — no regression |
| Admin uploads (`upsert: true`) | Fail (no Storage policy) | Still fail (needs UPDATE policy, intentionally not granted) — no regression |
| Old checkout (`insert … select`) | Visitors cannot read orders back → order not stored | Same — no regression |
| Old admin writes | Depend on unknown live policies | Admins (via `admin_users`) get full manage policies |

**Why the frontend must not go first:** with the old database, the new frontend would show an empty catalogue (0 visible products, no demo fallback), coupons would be "not available", and admin delete / admin users / uploads would show errors.

**Keep the gap short:** deploy the frontend within minutes after the post-migration diagnostics pass.

**Business-visible consequence of the deploy:** the demo catalogue disappears. The shop shows only active products in the database. If the products table is empty, the shop will be empty until products are added in the admin. Check product count in Supabase before deploying.

## 3. Risk of enabling RLS

The migration runs `alter table … enable row level security` on: admin_users, products, product_variants, product_images, categories, combos, combo_items, hero_slides, instagram_reels, homepage_sections, reviews, store_settings, coupons, customers, orders, order_items.

- If RLS was already on (likely, given the anonymous 0-row results), this is a no-op and only `ps_*` policies are added.
- If RLS was **off**, every client that is not an admin loses access except through the new `ps_*` policies. Within this app that is intended. Any external tool using the publishable key (e.g. an automation reading orders) would stop working — none is known in the repo.
- Diagnostics §9 (before) records the state; restore with `alter table … disable row level security` only if a confirmed dependency breaks (not recommended).

## 4. Execution procedure (requires your approval at each ⛔)

1. ⛔ **Approve and commit** the working tree (do not push yet if Vercel auto-deploys from `main`).
2. ⛔ **Backup:** Supabase → Database → Backups: record the latest restorable backup time. If none is available on the plan, export the affected tables first. **Stop if there is no recoverable copy.**
3. ⛔ **Auth (recommended, independent):** Authentication → Sign In / Providers → turn **off** *Allow new users to sign up*. Admins are created with *Add user*.
4. **Diagnostics (before):** SQL Editor → run `supabase/diagnostics/20261019_media_and_product_delete_diagnostics.sql`. Save the **full** output (file/screenshot). It is read-only: only `select` statements, plus one block that sets a local role and is always `rollback`-ed.
5. ⛔ **Migration:** paste `supabase/migrations/20261019_admin_media_and_product_delete.sql` → Run. One transaction; any error leaves the database unchanged — stop and send the message. Save the NOTICE output.
6. **Diagnostics (after):** run the same file again; compare with §5.
7. ⛔ **Deploy** the approved commit (push to the branch Vercel builds from, or deploy it in Vercel). Then verify: Vercel shows the commit SHA; the live `/assets/index-*.js` contains `validate_coupon`; it still references the expected Supabase host.
8. **Smoke test** ([11](11-Testing-and-Operations.md) §3), then T-1 … T-24.
9. ⛔ **Optional:** `supabase/migrations/20261020_contact_enquiries_optional.sql` only after approval (see [12](12-Future-Implementation-Roadmap.md) §3).

## 5. Diagnostics comparison checklist

| § | Before (record) | After (expected) |
|---|---|---|
| 1 Storage policies | List current ones | `ps_perfumes_admin_select`, `_insert`, `_delete` present; old repo names absent |
| 2 Table policies | List current ones | `ps_admin_manage_*`, `ps_public_read_*`, `ps_checkout_insert_*`, `ps_admin_users_*` present; earlier policies still listed (review any permissive public writes) |
| 3 `is_admin` / `is_super_admin` | **Save both definitions (rollback copy)** | New definitions: admin_users / app_metadata only — no `user_metadata`, no e-mail patterns |
| 4 Primary admin | User exists; admin_users row may be missing | Row with role `super_admin` (or `admin`), `is_active = true` |
| 5 Simulated `is_admin()` | Record value | `true` |
| 6 Foreign keys to products/variants | Record ON DELETE actions | Unchanged |
| 7 / 7b / 7c Functions | `admin_delete_product`… absent | All present: admin_delete_product, is_super_admin, admin_list_admin_users, admin_grant_admin, admin_update_admin, admin_revoke_admin, validate_coupon, redeem_coupon, ps_order_accepts_items |
| 8 Hero object | Present | Present |
| 9 RLS per table | **Save** | `true` for the 16 tables in §3 |
| 10 `auth.users` triggers | Record (a trigger writing to the missing `profiles` table would break new logins) | Unchanged |
| 11 admin_users columns/constraints | Record | Unchanged |
| 12 store_settings keys | Record | Unchanged |
| 13 status / discount_type constraints | Must allow `pending` and `percentage`/`fixed` | Unchanged |
| 14 Coupons | Record codes | Unchanged |
| 15 contact_enquiries | `null` | `null` unless the optional migration was approved |

## 6. Rollback

- **Frontend:** Vercel → previous deployment → Promote / Instant Rollback (independent of the database; the old frontend works with the migrated database — §2).
- **Database:** ROLLBACK block at the end of the migration file, restoring §3 definitions and, only if necessary, §9 RLS states. The migration deletes no rows and no Storage objects, so rollback never needs data restore unless data was changed after go-live.

## 7. Vercel / production checklist

| Item | Expected | Status |
|---|---|---|
| Production env vars | `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` (required); `VITE_ADMIN_EMAIL`, `VITE_SITE_URL` (optional). **No secret / service-role key in any `VITE_*` variable** | Blocked (no Vercel access) |
| Build | Framework Vite, `npm run build`, output `dist`, Node ≥ 20.19 | Blocked |
| Env var change | Vite inlines values at build time → **redeploy after every change** | — |
| Domain | psperfumes.com served by Vercel with HSTS | Verified (HTTP 200, `Server: Vercel`) |
| Supabase Auth URLs | Site URL `https://psperfumes.com`; redirect URLs include it (password reset e-mails) | Blocked |
| Storage | Bucket `ps-perfumes` public; policies from §5 row 1 | Pending migration |
| Rollback | Previous deployment available to promote | Blocked |
| Post-deploy | Smoke test; live bundle contains new code | Pending |

## 8. Handover readiness

| Criterion | Status |
|---|---|
| Build passes | Verified (2026-10-21) |
| Diff reviewed: no secrets, `.env` unchanged, no customer data added | Verified |
| Commit approved | Pending Approval |
| Backup confirmed | Blocked |
| Public sign-up disabled | Pending Approval |
| MFA reviewed | Blocked |
| Migration applied; diagnostics match §5 | Pending Approval |
| Deployed commit verified live | Pending Approval |
| T-1 … T-24 passed in production | Not Tested |
| Owner decisions (shipping, coupons, enquiries, hero slides) | Pending Approval |

**Handover only when every row is Verified.**
