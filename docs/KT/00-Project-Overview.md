# 00 — Project Overview

> **Last updated:** 2026-10-20 · **Repository:** `E:\Ps_Perfumes\PS_Perfumes` (git `main`, last commit `adf3dde`; the 2026-10-19/20 fixes are **uncommitted working-tree changes**).

## Status labels used in this package

| Label | Meaning |
|---|---|
| **Implemented (code)** | Present in the working tree and the production build compiles. Not yet deployed. |
| **Pending migration** | Needs `supabase/migrations/20261019_admin_media_and_product_delete.sql` applied to production before it can work. |
| **Verified (live, read-only)** | Checked against the production Supabase project with the public key, without reading or writing rows (column/table existence, function existence, public file access). |
| **Not verified** | Not exercised in a browser or against live data. **Nothing in the app has been browser-tested yet.** |
| **Unverified (needs access)** | Requires Supabase / Vercel / DNS console access. |

## 1. What the project is

**PS PERFUMES** (Kadapa, Andhra Pradesh) — a single-brand online perfume/attar store with an admin console.

- **Storefront:** browse categories (attar, perfume, bakhoor, musky, oud, floral, woody), product pages with bottle/size variants, combos, Instagram reels, cart, Cash-on-Delivery checkout, order lookup, contact details.
- **Admin console (`/admin`):** products and variants, categories, inventory, combos, hero slides, homepage layout, Instagram reels, orders, customers, reviews, coupons, store settings, admin users, enquiries.

Stack: React 19 + Vite 8 single-page app (JavaScript) → Supabase (Auth, Postgres with Row Level Security, Storage bucket `ps-perfumes`). Hosting: Vercel (inferred from `vercel.json`). No server code, no CI, no automated tests.

## 2. Users and roles

| Role | How | Can |
|---|---|---|
| Shopper | No account (there is no customer login) | Browse, cart/wishlist (browser only), place COD orders, apply coupons, track orders placed from the same browser |
| Admin (`super_admin`, `admin`, `editor`) | Supabase Auth login + active row in `admin_users` (after the migration) | All admin pages. Only `super_admin` can grant/suspend/remove admins |

## 3. Current state (2026-10-20)

| Area | State |
|---|---|
| Code fixes (uploads, product CRUD, variants, inventory, combos, hero/reels, homepage, reviews, coupons, settings, orders, admin users, contact, shipping/payment messaging) | **Implemented (code)**, build passes, **not deployed**, **not verified** |
| Production migration | **Pending migration** — confirmed on 2026-10-20 that its functions do not exist in production yet |
| Optional enquiries table migration | Written, **not applied**; owner decision |
| Hero autoplay video `hero/ps-perfumes-hero-desktop.mp4` | Unchanged; file **verified (live)** to be publicly served |
| Browser / production testing | **None performed** |

See [13-Production-Migration-and-Handover.md](13-Production-Migration-and-Handover.md) for the go-live checklist.

## 4. Business rules in code

| Rule | Where | Notes |
|---|---|---|
| Payment: **Cash on Delivery only** | [CheckoutPage.jsx](../../src/pages/Checkout/CheckoutPage.jsx) | No payment gateway exists; orders are stored `payment_status = 'pending'` |
| Free shipping threshold / fee | [CartContext.jsx](../../src/context/CartContext.jsx) | Uses Store Settings values **if saved**; otherwise ₹1,500 / ₹99. All storefront messages read the same value. **Owner must confirm the intended threshold** (older copy said ₹999) |
| Coupons | `validate_coupon()` DB function + [coupons.js](../../src/services/coupons.js) | Active, start/expiry date, usage limit, minimum order; percentage or fixed; discount never exceeds subtotal. Hard-coded PS10/WELCOME20 were removed — they work only if created in Admin → Coupons |
| Attar sizes 6 / 10 ml (Glass); other categories 30 / 50 / 100 ml (Glass and/or PVC) | [AdminProductForm.jsx](../../src/admin/pages/AdminProductForm.jsx) | Category decides the size list |
| Product delete | `admin_delete_product()` | Archived (deactivated) instead of deleted when referenced by order items, combo items or reviews |
| Stock | `product_variants.stock_quantity` per variant | **Not decremented by orders** (manual in Admin → Inventory) |

## 5. Known limitations (honest list)

1. Migration not applied → admin uploads, deletes, admin-user management, coupon validation and anonymous checkout permissions depend on it.
2. No payment gateway (COD only).
3. Stock is not reduced automatically when orders are placed.
4. Order totals/discounts are computed in the browser; the database accepts them (only basic checks).
5. Shoppers can track only orders placed from the same browser (orders are not publicly readable).
6. Contact form is disabled until the optional `contact_enquiries` table is created.
7. Hero slides managed in admin are **not displayed** on the site (the hero is a fixed video; showing slides needs a design decision).
8. Combo items store product + quantity only (the live table has no bottle/size columns).
9. No automated tests, monitoring, staging environment or CI.
