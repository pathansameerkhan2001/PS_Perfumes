# 13 — Production Migration and Handover

> **Update (2026-10-19, audit pass, uncommitted):** two further migrations were prepared and are **not applied**:
> `supabase/migrations/20261022_server_side_checkout.sql` (adds `place_order()`: order prices, shipping and coupon computed in the database) and
> `supabase/migrations/20261023_lock_direct_order_inserts.sql` (removes direct browser inserts into orders/order_items).
> Order: 20261019 → 20261022 → deploy the new frontend → one test COD order → 20261023. Running 20261023 before the new frontend is live breaks checkout.
> Until 20261022 is applied the frontend falls back to the old direct insert (browser-computed prices).
>
> **Update (latest):** commit `7baa580` is deployed (clean working tree at the time). The live admin reports `is_admin() = false` for the primary admin with a valid session, and neither the migration nor the repair is applied (their functions are absent). The full migration is required: the repair would fix uploads but not product saves, because existing table policies rely on the current `is_admin()`.
>
> **Update 2026-10-21 (later):** the changes were committed as `76f182b` and pushed; production now runs the new code. The migration is **still not applied** (functions absent), which causes the admin upload error "Storage rejected the upload (403 …)". Apply the migration (§4 step 5) — or, if it cannot be applied yet, the narrow storage repair `supabase/repairs/20261021_storage_upload_repair.sql` — then re-test uploads.
>
> **Earlier status (2026-10-21):** working-tree changes on `main` were uncommitted and not deployed. Production (https://psperfumes.com, Vercel) still runs the **old** bundle — verified: it contains the old demo-data key `ps_db_products` and none of the new code; it points at the expected Supabase project. The migration is **not applied** (its functions are absent). No browser test has been run. **Not approved for handover.**

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
- Diagnostics section 09 (before) records the state; restore with `alter table … disable row level security` only if a confirmed dependency breaks (not recommended).

## 4. Execution procedure (requires your approval at each ⛔)

**Prerequisites**
- Supabase Owner/Admin access to the production project **`jnrmmhzhhmjxefapkemv`**. Confirm before every SQL run: the dashboard URL contains `/project/jnrmmhzhhmjxefapkemv/`, and Settings → General → Reference ID matches. Diagnostics section `00` also shows the bucket — it must exist.
- A **confirmed recoverable backup** (step 1) and **passing pre-migration diagnostics** (steps 3–5). Do not continue without both.
- The SQL Editor only shows the result of the **last statement** of a script. Both diagnostics files are built for that: run each file **in full** (do not highlight part of it), then export the result grid as CSV (results panel → Export → Download CSV; if that option is not shown, select all cells in the grid and copy them into a spreadsheet) and keep it.

**Steps**
1. ⛔ **Backup:** Database → Backups — note the latest restorable backup time (or export the affected tables if the plan has no backups).
2. ⛔ **Recommended:** Authentication → Sign In / Providers → turn off *Allow new users to sign up*.
3. **Before — diagnostics:** SQL Editor → New query → paste all of `supabase/diagnostics/20261019_media_and_product_delete_diagnostics.sql` → Run → export the grid as `before-diagnostics.csv`. One SELECT statement; writes nothing.
4. **Before — simulation:** new query → paste all of `supabase/diagnostics/20261021_storage_insert_simulation.sql` → Run → export as `before-simulation.csv`. Expected now: `admin_insert = REJECTED …42501…`. It leaves nothing behind (every test sub-block is forced to roll back).
5. **Go / no-go review** (send me both CSVs if unsure). **STOP** — do not run step 6 — if any of these is true:
   1. **No recoverable backup** confirmed in step 1.
   2. **Signature or ownership mismatch:** `03` shows an `is_admin`/`is_super_admin` entry with non-empty `args` or `can_manage = false`; `00` shows `can_manage_storage_policies = false`; or `09` shows `can_manage = false` for any of the 16 tables in §3. (The migration also refuses to run in these cases.)
   3. **Unexpected order-status constraints:** `13` does not allow `order_status = 'pending'` and `payment_status = 'pending'` (and `discount_type` values other than `percentage`/`fixed` exist).
   4. **Broken login trigger:** `10` lists an `auth.users` trigger that writes to a table that does not exist (e.g. `profiles`) or to a function not in the project.
   5. **Restrictive Storage policy:** `01` contains any entry with `permissive = RESTRICTIVE` (it would still block uploads).
   6. **Admins who would lose access:** simulation `users_admin_under_current_is_admin` contains an e-mail that is **not** in `users_in_admin_users_table`. Decide first: accept (re-grant later in Admin → Admin Users) or stop.
   Also stop if `00` does not show the `ps-perfumes` bucket, or any simulation row ends in `_setup_error`.
6. ⛔ **Apply the full migration:** new query → paste all of `supabase/migrations/20261019_admin_media_and_product_delete.sql` → Run. It is one transaction; if any statement fails, **nothing** is changed — copy the error and stop. Save the NOTICE messages.
7. **After:** re-run steps 3 and 4 (`after-diagnostics.csv`, `after-simulation.csv`) and compare with §5.
8. **Browser:** admin login → Products → upload a primary image → save → reload (T-2/T-3).
9. Continue with T-1 … T-24.

**Fallback (only if step 6 fails and the cause cannot be fixed quickly):** ⛔ apply `supabase/repairs/20261021_storage_upload_repair.sql` (fixes uploads only; product saves/deletes still need the full migration), re-run step 4, then retry step 6 later. The full migration later replaces the repair's policies and drops its helper function.

⛔ **Optional enquiries table:** `supabase/migrations/20261020_contact_enquiries_optional.sql`, only after the full migration and only if approved.

## 5. Diagnostics comparison checklist

| Section | Before (record) | After (expected) |
|---|---|---|
| 00 database | Bucket `ps-perfumes` present; `can_manage_storage_policies` true | Unchanged |
| 01 storage policies | Current list; note RESTRICTIVE ones | `ps_perfumes_admin_select`, `_insert`, `_delete` present; repo-era names absent |
| 02 table policies | Current list | `ps_admin_manage_*`, `ps_public_read_*`, `ps_checkout_insert_*`, `ps_admin_users_*` present; earlier ones still listed (review permissive public writes) |
| 03 admin functions | **Rollback copy**; `args` empty; `can_manage` true | New definitions (admin_users / app_metadata only); `ps_is_media_admin` absent |
| 04 primary admin | Auth user present; admin_users row may be missing | Row with role `super_admin` (or `admin`), `is_active = true` |
| 05 admin_users rows | Record | Primary admin added/updated; other rows unchanged |
| 06 foreign keys | Record | Unchanged |
| 07 migration functions | `[]` | All 8 listed |
| 08 hero video | Present | Present |
| 09 RLS / owner | **Rollback record**; `can_manage` true for the 16 tables | `rls_enabled = true` for the 16 tables in §3 |
| 10 auth.users triggers | Record | Unchanged |
| 11 / 11b admin_users | Record | Unchanged |
| 12 store_settings keys | Record | Unchanged |
| 13 check constraints | Must allow `pending`, `percentage`, `fixed` | Unchanged |
| 14 coupons | Record | Unchanged |
| 15 contact_enquiries | `null` | `null` unless the optional migration was approved |
| 16 row counts | Record | **Identical** (the migration deletes nothing) |
| Simulation `anon_insert` | REJECTED | REJECTED |
| Simulation `admin_is_admin` | Record | `true` |
| Simulation `admin_insert` / `admin_insert_returning` | REJECTED (the current 403) | ALLOWED |
| Simulation `admin_insert_wrong_folder` | Record | REJECTED |

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
