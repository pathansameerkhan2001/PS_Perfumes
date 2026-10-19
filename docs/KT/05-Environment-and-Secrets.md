# 05 — Environment Variables and Secrets

> No secret values are reproduced in this package. Use placeholders such as `<SUPABASE_URL>`.

## 1. Variable reference

| Variable Name | Purpose | Required or Optional | Client or Server | Where to Configure | How to Verify |
|---|---|---|---|---|---|
| `VITE_SUPABASE_URL` | Supabase project API URL `https://<project-ref>.supabase.co` | **Required** — [lib/supabase.js](../../src/lib/supabase.js) throws if missing | Client (bundled into JS) | `.env.local` locally; Vercel → Settings → Environment Variables | Dev console prints `Supabase URL configured: true`; Network tab shows calls to that host |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase **publishable** key (`sb_publishable_…`). Designed to be public; security relies on RLS | **Required** — throws if missing | Client | same | Dev console prints `…publishable key configured: true`; REST calls return 200, not 401 |
| `VITE_ADMIN_EMAIL` | Primary admin email used by the UI admin check | Optional — defaults to a hard-coded email in [lib/supabase.js](../../src/lib/supabase.js) | Client | same | Log in with that account; you reach `/admin` |
| `VITE_SITE_URL` | Public site URL used for "View live site" links in admin | Optional — defaults to `https://psperfumes.com` | Client | same | Admin header "live website" link opens the right domain |
| `VITE_PUBLIC_SITE_URL` | Alternate name read by `getLiveWebsiteUrl()` | Optional, not in `.env.example` | Client | same | — |

Things that are **not** environment variables but behave like config (hard-coded):

| Value | Location | Change requires |
|---|---|---|
| Storage bucket name `ps-perfumes` | [lib/supabase.js](../../src/lib/supabase.js) `STORAGE_BUCKET` | code change + rebuild |
| Production Supabase URL inside hero video fallback | [HeroCinematic.jsx](../../src/components/home/HeroCinematic.jsx) `HERO_VIDEO_FALLBACK` | code change (breaks if the project changes) |
| Primary admin email | `schema.sql`, migration, `adminAuthService.js`, `lib/supabase.js`, `siteConfig.js`, `settings.js` | code **and** SQL changes |
| Admin e-mail patterns | **Removed 2026-10-20** from `adminAuthService.js`; removed from `is_admin()` by the pending migration | — |
| Shipping threshold / fee | Admin → Store Settings (`store_settings` keys `free_shipping_threshold`, `standard_shipping_fee`); fallback ₹1,500 / ₹99 in [CartContext.jsx](../../src/context/CartContext.jsx) | Save in Store Settings (takes effect on next page load, no redeploy) |
| Promo codes | Admin → Coupons (`coupons` table, validated by `validate_coupon()`); no hard-coded codes remain | Admin page |
| Contact details, social links | `siteConfig.js`, `settings.js` defaults, `store_settings` rows | code or Admin → Store Settings |

## 2. Build-time vs runtime

- Vite **inlines `import.meta.env.VITE_*` at build time**. The deployed JS contains the literal values. Changing a variable in Vercel has **no effect until you redeploy (rebuild)**.
- Only variables prefixed `VITE_` are exposed; anything else in `.env` is ignored by the client bundle.
- There are **no server-side variables** because there is no server code.
- ⚠ **Never** put the Supabase `service_role`/secret key, database password, or any payment-gateway secret in a `VITE_` variable — it would be shipped to every visitor. If server-side secrets are needed later, introduce a server component (Supabase Edge Function or Vercel Function) and keep the secret there ([12](12-Future-Implementation-Roadmap.md)).

## 3. Local configuration

```bash
# inside E:\Ps_Perfumes\PS_Perfumes
cp .env.example .env.local      # .env.local is git-ignored and overrides .env
# then edit .env.local and fill:
VITE_SUPABASE_URL=<SUPABASE_URL>
VITE_SUPABASE_PUBLISHABLE_KEY=<SUPABASE_PUBLISHABLE_KEY>
VITE_ADMIN_EMAIL=<PRIMARY_ADMIN_EMAIL>
VITE_SITE_URL=http://localhost:5173
```

Vite load order: `.env` < `.env.local` < `.env.[mode]` < `.env.[mode].local`. Restart `npm run dev` after editing.

**Recommendation:** point local development at a **separate development Supabase project**, not production. Today the committed `.env` points local development at production, so local admin testing modifies live data.

## 4. ⚠ Secret-management findings

| ID | Finding | Evidence | Severity / note |
|---|---|---|---|
| E-1 | `.env` is **tracked in git** even though `.gitignore` lists it (it was committed before/despite the ignore rule; history: commits `0a16c0d`, `a258fbb`, `29913f6`) | `git ls-files .env` → tracked | Contents are a publishable key + URL + admin email — **public by design**, so low direct risk. But any future secret added to `.env` will be committed. Remove from tracking with `git rm --cached .env` [Recommendation — not executed] |
| E-2 | No `service_role`/secret key found in repo or history (checked variable names in all `.env` revisions) | git history | ✔ Good |
| E-3 | Production project ref is hard-coded in source | `HeroCinematic.jsx` | Not secret, but couples code to one project |
| E-4 | Admin email (PII) hard-coded in ~6 files including SQL | grep | Change management issue; also reveals the admin login identity |

## 5. Detecting missing or mismatched configuration

| Symptom | Likely cause |
|---|---|
| Blank white page; console `Error: Missing VITE_SUPABASE_URL` / `…PUBLISHABLE_KEY` | Variable missing at **build** time (Vercel) or `.env.local` not loaded (restart dev server) |
| Requests go to an unexpected `*.supabase.co` host | Wrong `VITE_SUPABASE_URL` for that environment |
| 401 `Invalid API key` on all REST calls | Key from a different project, or key rotated/revoked |
| Site shows demo products/combos (names like "Royal Amber Extrait") everywhere | DB unreachable, empty, or column mismatch → fallback data. Check Network tab |
| Admin "live site" link wrong | `VITE_SITE_URL` |
| Changes in Vercel env not visible | Not redeployed after the change |

## 6. Rotating the publishable key (if ever needed)
1. Supabase → Settings → API keys → create a new publishable key.
2. Update `VITE_SUPABASE_PUBLISHABLE_KEY` in Vercel (Production + Preview) and in local `.env.local`.
3. Redeploy; verify the site.
4. Revoke the old key. (Users' admin sessions are unaffected; the key only identifies the project.)

## 7. Credential rotation checklist (treat previously shared credentials as compromised)

Nothing in this repository contains a secret/service-role key or a password (verified 2026-10-21). If a secret key or the admin password was ever shared in chat, e-mail or screenshots, rotate it:

| # | Action | Where | Notes |
|---|---|---|---|
| 1 | Change the admin password for the primary admin login | Supabase → Authentication → Users → user → *Send password recovery* (or the admin resets it via the login page flow) | Use a unique password stored in a password manager |
| 2 | Sign out existing sessions | Same user → *Sign out user* / revoke sessions | Forces re-login everywhere |
| 3 | Create a new **secret** API key and revoke the old one | Supabase → Settings → API Keys → Secret keys | The app does not use a secret key, so nothing in Vercel changes. Update only server-side tools that used it (if any) |
| 4 | If the project still uses **legacy** JWT-based keys (`anon` / `service_role`) and the legacy service_role key was exposed | Supabase → Settings → JWT keys → rotate / disable legacy keys | Rotating the legacy JWT secret also invalidates the legacy anon key and all sessions; the app uses the new publishable key (`sb_publishable_…`), so confirm that before rotating |
| 5 | Optionally rotate the publishable key | §6 above | Public by design; rotate only if a key was revoked/abused |
| 6 | Enable MFA for admin accounts | Supabase → Authentication → MFA, then enrol each admin | Pending verification |
| 7 | Record the rotation date (without values) in this document | — | Never write key values here, in Git, or in Vercel `VITE_*` variables |
