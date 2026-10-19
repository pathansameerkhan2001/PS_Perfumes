# 10 — Developer Onboarding (Local Setup)

> Commands marked ✅ were executed during the KT on Windows 11 (Node v24.12.0, npm 11.6.2). Others are standard commands derived from `package.json` and were **not executed**.

## 1. Required tools

| Tool | Version | Why |
|---|---|---|
| Node.js | `^20.19.0` or `>=22.12.0` (Vite 8 engine requirement); v24.12.0 verified ✅ | build/dev server |
| npm | 10+ (11.6.2 verified ✅) | lockfile v3 |
| Git | any recent | source control |
| A browser with DevTools | — | debugging |
| Supabase account access | to a **dev/staging** project (recommended) or production (read-only use) | data + auth |
| Optional: Supabase CLI | latest | schema dumps / migrations (not configured yet) |

## 2. Get the repository

```bash
git clone https://github.com/pathansameerkhan2001/PS_Perfumes.git
cd PS_Perfumes
```
(Access depends on repo visibility/collaborator rights — [Unverified].)

## 3. Locate the project root

The git repo **is** the project root: the folder containing `package.json`, `vite.config.js`, `src/`. On the current machine that is `E:\Ps_Perfumes\PS_Perfumes`, **not** `E:\Ps_Perfumes` (which only has a stray empty `package-lock.json`).

## 4. Install dependencies

```bash
npm ci        # reproducible install from package-lock.json (preferred)
# or: npm install
```
`node_modules` already exists on the current machine ✅.

## 5. Configure environment safely

```bash
cp .env.example .env.local
```
Fill in values per [05-Environment-and-Secrets.md](05-Environment-and-Secrets.md) §3. Do **not** edit the committed `.env` with new secrets; do **not** commit `.env.local`.

## 6. Connect development services

- **Recommended:** create a separate Supabase project for development, apply the **live production schema dump** (once exported — see [12](12-Future-Implementation-Roadmap.md) Phase 1), create the `ps-perfumes` bucket and policies, and create a test admin user + `admin_users` row.
- ⚠ Do **not** use `supabase/schema.sql`: it does not match the live schema ([03](03-Database-and-Data-Model.md) §2). Recreate from a dump of production, then apply `supabase/migrations/20261019_admin_media_and_product_delete.sql` (and optionally `20261020_contact_enquiries_optional.sql`). With a mismatched schema the site shows empty sections and admin pages show the database error.
- If you must use production: browse only; do not use admin features for experiments.

## 7. Database migrations

No migration tooling is configured. Run SQL manually in the Supabase SQL Editor of a **dev** project first. For production follow [13](13-Production-Migration-and-Handover.md) exactly (diagnostics before and after, backup, rollback copy).

## 8. Start the app

```bash
npm run dev          # http://localhost:5173
```
Storefront at `/`, admin at `/admin/login`.

## 9. Tests

There are **no automated tests** and no `test` script. Available checks:
```bash
npm run lint         # last run 2026-10-19 (before the fixes): 65 warnings, 0 errors — not re-run since
```
Manual test cases: [11-Testing-and-Operations.md](11-Testing-and-Operations.md) §3.

## 10. Production build (local only — does not deploy)

```bash
npm run build        # ✅ ran (into a scratch dir): success in ~7.6 s
npm run preview      # serve dist/ at http://localhost:4173
```

## 11. Common setup failures

| Problem | Fix |
|---|---|
| White page + `Missing VITE_SUPABASE_URL` | create `.env.local`, restart dev server |
| Storefront sections empty | Tables empty, items inactive, wrong project or missing read policies ([09](09-Troubleshooting-Runbook.md) R-7). Demo data no longer exists |
| Admin save shows a database error | Read the message: column mismatch, RLS ("no row was changed") or missing function ([09](09-Troubleshooting-Runbook.md)) |
| `npm` errors in `E:\Ps_Perfumes` | wrong folder — use `PS_Perfumes` |
| Node engine error | upgrade Node |
| Admin login rejected | your user needs an active `admin_users` row (`user_id` = your Auth user id) in the dev project |

## 12. Local vs production commands

| Local only (safe) | Affects production (deliberate, reviewed) |
|---|---|
| `npm ci`, `npm run dev`, `npm run lint`, `npm run build`, `npm run preview` | `git push` to `main` (may auto-deploy on Vercel — [Unverified]) |
| Read-only SQL `select …` | Any SQL in production SQL Editor |
| Using a dev Supabase project | Admin actions while `.env` points to production |
| | Changing Vercel env vars / domains |

## 13. Suggested reading order for the code
1. [App.jsx](../../src/App.jsx) (routes) → 2. [lib/supabase.js](../../src/lib/supabase.js), [lib/storage.js](../../src/lib/storage.js) → 3. [services/products.js](../../src/services/products.js) (`formatProduct`) → 4. [CartContext.jsx](../../src/context/CartContext.jsx) → 5. [services/orders.js](../../src/services/orders.js) + [CheckoutPage.jsx](../../src/pages/Checkout/CheckoutPage.jsx) → 6. [adminAuthService.js](../../src/admin/services/adminAuthService.js) → 7. [supabase/migrations/storage_and_permissions_fix.sql](../../supabase/migrations/storage_and_permissions_fix.sql).
