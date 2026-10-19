# 11 — Testing, Monitoring, Backup and Operations

## 1. Test status (2026-10-20)

| Item | Exists | Run | Result |
|---|---|---|---|
| Automated tests | No | — | — |
| `npm run build` | Yes | Yes (2026-10-20) | Pass |
| `npm run lint` | Yes | Last on 2026-10-19 (before fixes) | 65 warnings, 0 errors |
| Browser tests (any page) | — | **No** | — |
| Live database read-only checks | — | Yes (column/table/function existence, public hero file) | See 03 §2 |
| Live writes / admin workflows | — | **No** | Pending migration and manual testing |

## 2. Manual test plan

Run after the migration and deployment ([13](13-Production-Migration-and-Handover.md)). Use real but clearly named test records (e.g. "TEST – delete me") and remove them afterwards.

| # | Test | Expected |
|---|---|---|
| T-1 | Admin login (admin) / non-admin login / wrong password | Access / rejected and signed out / error |
| T-2 | Create Attar product: Glass 6 ml and 10 ml, prices, sale price, SKU, stock; upload primary + Glass images | Saved; reload shows images, sizes, prices |
| T-3 | Create Perfume product: Glass + PVC × 30/50/100 ml; upload primary, Glass, PVC | Same; storefront shows Glass/PVC selector with correct prices |
| T-4 | Edit product: change price and stock of one variant, remove a size | Reload shows change; removed size gone |
| T-5 | Deactivate product | Gone from home, collections, search; product URL → not found |
| T-6 | Delete a product never ordered | "permanently deleted"; its `products/` images removed |
| T-7 | Delete a product that has an order | "deactivated instead of deleted"; order still intact |
| T-8 | Inventory: −1, +1, +10, type a value | Saved per variant; reload confirms; product stays active at 0 |
| T-9 | Combos: create with 2 products + image, edit items, disable, delete | Each persists after reload; storefront combo section matches |
| T-10 | Categories: create with image, edit, delete unused; try deleting a used one | Persist; used one blocked with message |
| T-11 | Hero slides: create, reorder, deactivate, delete | Persist after reload; homepage still shows the autoplay video |
| T-12 | Reels: create with thumbnail, reorder, deactivate, delete | Persist; `/instagram` and homepage section match |
| T-13 | Homepage: "Save layout to database" (if shown), hide a section, reorder | Homepage reflects it |
| T-14 | Coupons: create percentage (min order) and fixed (expiry); apply in cart above/below minimum, expired, wrong code | Correct discount or clear message; total never negative |
| T-15 | Checkout (private window): non-default variant, coupon, COD | Confirmation; Admin Orders shows variant, bottle, size, qty, unit price, discount, `Coupon: CODE`, payment pending; coupon used_count +1 |
| T-16 | Store Settings: set shipping threshold/fee | Cart, drawer, product modal and benefits bar show the same rule |
| T-17 | Reviews: approve / hide | Product page and homepage reflect it |
| T-18 | Admin Users (super_admin): grant an existing login as editor, suspend, remove; try to suspend yourself | Works; self-change refused |
| T-19 | Contact page | Without optional table: form disabled with contact details. With table: message appears in Admin → Enquiries |
| T-20 | Mobile (≈375 px) home, product, cart, checkout, admin product form | No horizontal scroll; buttons reachable |
| T-21 | Footer/contact dock links: WhatsApp, Instagram, Google Maps, e-mail | Open the correct destinations |
| T-22 | Unauthorized access / RLS (private window, not logged in): open `/admin/products`; run the anonymous checks in [07](07-Authentication-and-Security.md) §4 (inactive products, coupons, orders, admin users) | Redirect to login; every check returns `[]` or 401/403; `validate_coupon` with a wrong code returns `valid:false` |
| T-23 | Production error handling: upload an unsupported file (e.g. GIF/HEIC or >10 MB); save a product with no variant price; delete a category that has products | Each shows a clear error banner; nothing reports success; data unchanged |
| T-24 | No invented data: open a product with no approved reviews and no sale price; a homepage product grid; an empty combo/reel/review section | "No reviews yet" (no stars/count); no strike-through price; empty sections hidden; no demo products anywhere |

## 2b. Test results record

Fill in after production testing. **Status on 2026-10-21: no T-test has been executed** — the migration is not applied, the code is not deployed, and no browser session was run. Code-inspection notes are not test results.

| ID | Environment | Result | Evidence | Defect |
|---|---|---|---|---|
| T-1 … T-24 | — | **Not Tested** | — | — |

Template per test: `T-n | production (URL, commit sha) | Pass / Fail | screenshot or DB row id | defect description`.

## 3. Smoke test after every deploy
Home loads and the hero video plays · a product page loads with images · add to cart · `/checkout` renders · `/admin/login` loads · Network tab shows no 4xx/5xx from Supabase.

## 4. Monitoring, logging, backups

| Capability | Status |
|---|---|
| Error tracking, uptime monitoring, alerts | Not configured |
| Logs | Browser console; Supabase dashboard logs (retention depends on plan) |
| Database backups | Plan-dependent — **unverified** |
| Storage backups | None known |

## 5. Incident response
1. Triage (site down / orders failing / suspicious admin activity). 2. Preserve evidence (screenshots, Supabase logs, row ids). 3. Contain (Vercel rollback; ban suspicious Auth users; revoke admin via Admin Users or SQL; disable sign-ups). 4. Recover (backup/PITR, re-upload media). 5. Verify (smoke test, §2 permission checks). 6. Communicate with the owner/customers. 7. Post-mortem.
