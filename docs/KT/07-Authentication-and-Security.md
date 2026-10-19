# 07 — Authentication, Authorization and Security

## 1. Authentication

| Flow | Implementation |
|---|---|
| Admin login | `/admin/login` → `adminLogin()` → `supabase.auth.signInWithPassword` → `verifyAdminAuthorization()`; non-admins are signed out immediately |
| Session | supabase-js stores tokens in `localStorage`, auto-refresh on |
| Logout | `adminLogout()` → `supabase.auth.signOut()` |
| Customers | No accounts, no sign-up UI |

## 2. Who is an admin

| Layer | Rule |
|---|---|
| Browser (`adminAuthService.js`, changed 2026-10-20) | `VITE_ADMIN_EMAIL` / primary admin e-mail, **or** active `admin_users` row (role super_admin/admin/editor), **or** `app_metadata.role`. `user_metadata` and e-mail patterns are not trusted |
| Database `is_admin()` (after migration) | active `admin_users` row for `auth.uid()` **or** `app_metadata.role`. The primary admin is inserted into `admin_users` by the migration |
| Admin management | Only `super_admin`, via RPCs; cannot demote/suspend/remove yourself; at least one active super_admin must remain. New admins must already have a Supabase Auth login (Dashboard → Authentication → Add user) |

The browser check only controls what the UI shows; the database check is what protects data.

## 3. Findings and status

| ID | Finding | Status |
|---|---|---|
| S-1 | DB `is_admin()` trusted `user_metadata` (self-editable) | **Fixed in migration (pending)** |
| S-2 | `admin@*` / `*@psperfumes.com` e-mails were admins | **Fixed**: UI (code, not deployed) + DB (migration pending) |
| S-2b | Old repo policies let any admin write `admin_users` (self-promotion) | **Fixed in migration (pending)** — those policies are dropped; remaining write policies are reported as NOTICEs |
| S-3 | Storage upload/delete rules missing in production | **Fixed in migration (pending)** |
| S-4 | Order totals, discount and coupon are computed in the browser | **Open (mitigated)**: subtotal recomputed from lines; discount ≤ subtotal; payment always pending; policy checks pending/unpaid/total ≥ 0. Prices are still not re-checked against `product_variants` in the database |
| S-5 | Public read of drafts, coupons, order items | **Fixed in migration (pending)** for the `ps_*` scope; review any older permissive policies listed by diagnostics §2 |
| S-6 | Spam vectors (anonymous inserts) | Reduced: order_items only for fresh pending orders; coupons only via RPC; reviews have no public insert from the app. No CAPTCHA / rate limiting |
| S-7 | Simulated card checkout | **Fixed (code)**: modal unmounted; COD only |
| S-8 | `SECURITY DEFINER` without `search_path` | New/replaced functions set `search_path` |
| S-9 | No security headers / CSP | Open |
| S-10 | `.env` tracked in git (public values only) | Open — `git rm --cached .env` recommended |
| S-11 | Supabase Auth settings — **read 2026-10-20 from the public `/auth/v1/settings` endpoint**: public sign-up **enabled** (`disable_signup: false`); e-mail confirmation **required** (`mailer_autoconfirm: false`); providers: e-mail only; MFA **not visible** from this endpoint | **Open — action recommended:** the store has no customer accounts, so turn off *Allow new users to sign up* (Dashboard → Authentication → Sign In / Providers). Admins are added with *Add user*. This removes the self-registration path entirely, even before the migration. Check MFA in the dashboard |

## 4. Safe verification (after migration)

Use only the publishable key (never the service-role key):

```bash
URL=<SUPABASE_URL>; KEY=<SUPABASE_PUBLISHABLE_KEY>
curl -s "$URL/rest/v1/products?select=id&is_active=eq.false&limit=1" -H "apikey: $KEY"   # expect []
curl -s "$URL/rest/v1/coupons?select=code&limit=1" -H "apikey: $KEY"                    # expect [] or 401/403
curl -s "$URL/rest/v1/orders?select=id&limit=1" -H "apikey: $KEY"                       # expect []
curl -s -X POST "$URL/rest/v1/rpc/validate_coupon" -H "apikey: $KEY" -H "Content-Type: application/json" \
     -d '{"p_code":"NOPE","p_subtotal":1000}'                                            # expect valid:false
```

UI checks: private window `/admin` → redirect to login; a non-admin login is rejected; an `editor` cannot open Admin Users changes (RPC returns "Only a super_admin…").

## 5. Common failures

| Symptom | Cause |
|---|---|
| "You do not have permission to access the admin panel" | No active `admin_users` row / app_metadata role for this login |
| Save/upload error mentioning row-level security / no row changed | Migration not applied, or `is_admin()` false for this user |
| Admin Users: "functions are not installed" | Migration not applied |
| Admin Users: "Only a super_admin…" | Logged-in admin is `admin`/`editor` |
