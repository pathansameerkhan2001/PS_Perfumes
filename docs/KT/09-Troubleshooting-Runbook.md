# 09 — Troubleshooting Runbook

> Confirm a cause with the evidence step before acting. Back up before any production SQL.

## 0. First two minutes
1. Reproduce in a private window.
2. DevTools → Console and Network (filter `supabase.co`): note status codes and the response `message`/`code`.
3. Admin pages now show the real error in a banner — copy it exactly.
4. Check Supabase project status and the latest Vercel deployment.

## 1. Playbooks

| # | Symptom | Likely cause | Evidence | Safe fix |
|---|---|---|---|---|
| R-1 | Blank white page, "Missing VITE_SUPABASE_URL" | Env var missing at build | Console; Vercel env vars | Add vars, redeploy |
| R-2 | Upload fails: "Storage rejected the upload (403 … row-level security)" — **reproduced in production 2026-10-21** after commit `76f182b` was deployed without the migration | Migration not applied in project `<project-ref>` (verified: its functions are absent); the banner now also says whether `is_admin()` is true or false | `supabase/diagnostics/20261021_storage_insert_simulation.sql` (rolled-back INSERT as the admin); diagnostics sections 01, 04 | Apply the full migration (preferred) or the narrow `supabase/repairs/20261021_storage_upload_repair.sql`. Never make the bucket writable by anon or use `WITH CHECK (true)` |
| R-3 | Upload fails: MIME / size / invalid key | Unsupported file (HEIC, GIF, >10 MB image) | Banner text | Convert to webp/jpeg/png ≤10 MB |
| R-4 | Any admin save: "no row was changed" | RLS blocked the write (not admin per `is_admin()`) or record gone | Simulation file (admin_is_admin) | Apply migration / grant admin |
| R-5 | Delete product: "admin_delete_product is not installed" | Migration pending | Diagnostics section 07 | Apply migration |
| R-6 | Product "deactivated instead of deleted" | Order items / combos / reviews reference it — **expected** | Banner lists counts | None (history preserved) |
| R-7 | Storefront empty (no products/combos/reels) | Tables empty, items inactive, or public read policy missing | Network: 200 with `[]` vs 401/42501 | Activate items; apply migration |
| R-8 | Checkout: "Your order could not be placed (… row-level security …)" | Insert policy missing (migration pending) | API logs `POST /orders` | Apply migration |
| R-9 | Checkout: order received but items not saved | order_items insert rejected (e.g. order older than 30 min) | API logs | Contact customer using the order number; re-enter items as admin |
| R-10 | Coupon: "Promo codes are not available at the moment" | `validate_coupon` missing | Diagnostics section 07 | Apply migration |
| R-11 | Coupon invalid though it exists | Inactive, expired, not started, limit reached, or below minimum — message says which | Admin → Coupons | Adjust coupon |
| R-12 | Shipping amount differs from banner | Banners and cart read the same value; a stale tab may hold the old value | Store Settings | Reload; confirm saved values |
| R-13 | Contact form shows "Online enquiries are not available" | `contact_enquiries` table missing — expected until the optional migration | Diagnostics section 15 | Apply optional migration if wanted |
| R-14 | Admin Users: "Only a super_admin…" / "functions are not installed" | Role too low / migration pending | — | Use a super_admin / apply migration |
| R-15 | Hero video missing | Object moved/deleted or Storage issue | `curl -I …/public/ps-perfumes/hero/ps-perfumes-hero-desktop.mp4` | Re-upload the same path |
| R-16 | Deep link 404 on refresh | SPA rewrite missing | Host config | Keep `vercel.json` |
| R-17 | Build fails | Node < 20.19, missing `node_modules`, wrong folder | Error text | Upgrade Node; `npm ci`; run in `PS_Perfumes` |

## 2. Rollback

- **Frontend:** Vercel → previous deployment → Promote / Instant Rollback (or `git revert` + push).
- **Database:** the rollback block at the end of the migration file, using the definitions saved from diagnostics sections 03 and 09.
- **Storage:** no versioning; deleted files cannot be restored without a separate backup.

## 3. Where to look

Browser console/network · Supabase Logs (API, Postgres, Auth, Storage) · Supabase Advisors · Vercel deployment logs · `localStorage` keys `ps_cart`, `ps_wishlist`, `ps_my_orders`, `sb-<project-ref>-auth-token`.
