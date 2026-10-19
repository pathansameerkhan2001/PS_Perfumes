# 02 — Repository and Code Walkthrough

## 1. Project root

```text
E:\Ps_Perfumes\                 ← editor workspace (NOT the project; contains a stray empty package-lock.json)
└── PS_Perfumes\                ← ★ project root and git repository (branch main)
```

## 2. Top level

```text
PS_Perfumes/
├── .env                 # ⚠ tracked in git (publishable key + URL only) — see 05
├── .env.example         # template for VITE_* variables
├── index.html           # HTML shell, Google Fonts, LCP preloads
├── package.json         # scripts: dev, build, lint, preview
├── vercel.json          # SPA rewrite /(.*) → /index.html
├── vite.config.js       # React plugin, vendor chunk splitting
├── public/              # static assets served at / (brand images, videos)
├── docs/KT/             # this documentation
├── supabase/
│   ├── schema.sql                                         # ⚠ STALE: does not match the live database
│   ├── migrations/storage_and_permissions_fix.sql         # older script, never applied to production
│   ├── migrations/20261019_admin_media_and_product_delete.sql  # ★ production migration (pending)
│   ├── migrations/20261020_contact_enquiries_optional.sql      # optional contact-form table (pending)
│   └── diagnostics/20261019_media_and_product_delete_diagnostics.sql  # read-only checks
└── src/
```

## 3. `src/` map

| File or Directory | Purpose | Safe to modify | Risks |
|---|---|---|---|
| `main.jsx`, `App.jsx` | Bootstrap and all routes | Add routes | Admin routes must stay under `AdminRoute` |
| `lib/supabase.js` | Single Supabase client, bucket name | Client options | Throws if env vars missing (white page) |
| `lib/storage.js` | Upload (no upsert), public URL, `deleteStorageFiles` (verifies what was removed) | Messages, limits ≤ bucket limits | Folder names must match Storage policy allow-list |
| `lib/auth.js` | **Dead code** (old mock login) | Delete after review | Do not re-import |
| `config/siteConfig.js` | Contact details, site URL | Contact info | Duplicated in `store_settings` defaults |
| `context/CartContext.jsx` | Cart, wishlist, coupon state, shipping rule (from Store Settings), totals | UI state | Pricing logic lives here |
| `services/*.js` | Data access per entity, database only, confirmed writes | Query details | Column names must match the **live** schema (03 §2) |
| `services/dbErrors.js` | `describeDbError`, `dbError`, `assertRows` | — | Used by all services |
| `admin/` | Admin console (components, hooks, layouts, pages, services) | Page UI | `adminAuthService.js` is security-relevant |
| `pages/`, `components/` | Storefront | Visuals | `HeroCinematic.jsx` must keep the autoplay video |
| `data/products.js`, `data/reviews.js` | Old demo content | — | Only used when Supabase is not configured (effectively unused) |
| `components/CheckoutModal.jsx` | Old simulated card checkout | — | **Not mounted**; do not re-enable |

## 4. Routes

Public (inside `PublicLayout`): `/`, `/about`, `/shop`, `/offers` (= shop), `/attar` `/perfume` `/bakhoor` `/musky` `/oud` `/floral` `/woody`, `/category/:slug`, `/product/:slug`, `/cart`, `/checkout`, `/wishlist`, `/contact`, `/search`, `/instagram`, `/track-order`.

Admin: `/admin/login`; under `/admin`: dashboard, `hero`, `homepage`, `reels`, `products`, `products/new`, `products/:id/edit`, `categories`, `combos`, `inventory`, `orders`, `customers`, `reviews`, `enquiries` (added 2026-10-20), `coupons`, `settings`, `admin-users`. Still unrouted: `AdminBanners.jsx`.

## 5. Service layer (live columns in 03 §2)

| Module | Tables / RPC | Notes |
|---|---|---|
| `products.js` | products, product_variants, categories, `admin_delete_product` | `formatProduct` never invents variants/prices/ingredients for DB rows; `stored_images` exposes raw saved images; `updateVariantStock` for inventory; create rolls back if variants fail |
| `categories.js` | categories | DB only; delete blocked if products use it |
| `combos.js` | combos, combo_items, products | Items = product + quantity; price/sale_price mapping |
| `hero.js` | hero_slides | Stores image paths |
| `reels.js` | instagram_reels | Stores thumbnail path |
| `homepage.js` | homepage_sections | Built-in layout until saved; `initializeHomepageSections()` |
| `settings.js` | store_settings (key/value) | `_storedKeys` tells which values are really saved |
| `coupons.js` | coupons, `validate_coupon`, `redeem_coupon` | Admin CRUD + storefront validation |
| `reviews.js` | reviews | `review_text` ↔ comment, `is_approved` ↔ status |
| `orders.js` | orders, order_items, `redeem_coupon` | Client-generated UUID, no read-back, COD/pending |
| `enquiries.js` | contact_enquiries (optional table) | `isEnquiryStorageAvailable()` disables the form when missing |
| `adminUsers.js` | `admin_list_admin_users`, `admin_grant_admin`, `admin_update_admin`, `admin_revoke_admin` | super_admin only for changes |
| `admin/services/adminAuthService.js` | admin_users | Login + admin check |
| `admin/services/dashboardService.js` | orders, products, variants, combos, customers | Read-only KPIs; reports errors |

## 6. Main workflows

- **Create product:** form → uploads (main/glass/pvc) save URL + path → `createProduct` resolves category (error if unknown) → insert product → insert variants (product removed again if variants fail).
- **Edit product:** loads `stored_images` (real values) → `updateProduct` updates product (must change 1 row) → updates/inserts variants, retires removed ones (delete, or deactivate if referenced).
- **Delete product:** confirm dialog → `admin_delete_product` → `archived` or `deleted` (+ removal of unreferenced `products/` images) → list refresh and banner.
- **Inventory:** each variant row → `updateVariantStock` (product visibility untouched).
- **Checkout:** see 01 §5.1.

## 7. Change management

**High-risk areas:** `supabase/migrations/*`, `is_admin()`, `formatProduct`, `CartContext.jsx`, `orders.js`, `lib/storage.js`, `adminAuthService.js`.

**Before a change:** confirm live column names (03 §10); decide failure behaviour (no silent fallback); write SQL as a new dated file with rollback notes; back up affected tables.

**After a change:** `npm run build`; click through the affected pages; DevTools Network must show 2xx for Supabase calls; no false success messages.
