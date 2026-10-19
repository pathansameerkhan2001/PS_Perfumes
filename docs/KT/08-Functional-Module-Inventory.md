# 08 — Functional Module Inventory

**Every module below is "Implemented (code)" and builds; none has been browser-tested or verified against live data.** "Needs migration" means it cannot work in production until `20261019_admin_media_and_product_delete.sql` is applied.

## 1. Storefront

| Module | Entry | Data | Behaviour | Needs migration | Verify |
|---|---|---|---|---|---|
| Home | `/` | homepage_sections (or built-in layout), products, combos, reels, reviews | Hero video unchanged; empty sections hide | Public read policies | Load `/` in a private window; hero autoplays |
| Collections / Shop / Search | `/attar`…, `/shop`, header search, `/search` | products (active only), categories | No demo products | Public read | Deactivate a product → it disappears |
| Product page | `/product/:slug` | product, variants, own approved reviews | Inactive → not found; strike price only for real sale price; ingredients only if stored | Public read | Switch bottle/size → price and stock change |
| Cart | drawer, `/cart` | localStorage | Variant price; coupon via `validate_coupon`; shipping from Store Settings or ₹1,500/₹99 | Coupon RPC | Apply valid / expired / below-minimum codes |
| Checkout | `/checkout` | orders, order_items | COD only; real errors; no read-back | **Yes** (insert policies) | Place order in private window; check Admin Orders |
| Track order | `/track-order` | orders (admin), local copy | Shoppers see only orders placed in this browser | — | Look up the order number just placed |
| Contact | `/contact` | contact_enquiries (optional) | Form disabled with direct contacts while the table is missing | Optional migration | Without table: notice shown; with table: message appears in Admin → Enquiries |
| Instagram | `/instagram`, home section | instagram_reels | Real reels only | Public read | Add a reel → appears |

## 2. Admin

| Module | Route | Data | Behaviour | Needs migration | Verify |
|---|---|---|---|---|---|
| Login / guard | `/admin/login` | Auth, admin_users | See 07 §2 | Recommended | Non-admin rejected |
| Dashboard | `/admin` | orders, products, variants, combos, customers | Real KPIs; real error text | Admin read | Compare counts with Supabase |
| Products | `/admin/products` | products, variants | Create (rollback if variants fail), edit, activate/deactivate, duplicate, delete/archive with banner | **Yes** (writes, delete RPC) | Create/edit/reload; delete with and without orders |
| Product images | product form | Storage `products/` | Primary, Glass, PVC; URL + path saved; preview restored on reload | **Yes** (Storage) | Upload, save, reload |
| Variants | product form | product_variants | Attar 6/10 ml; others 30/50/100 ml; Glass/PVC; price, sale price, SKU, stock, active | **Yes** | Edit and reload |
| Inventory | `/admin/inventory` | product_variants | Per-variant stock; product visibility untouched | **Yes** | +1 / −1 / set value, reload |
| Categories | `/admin/categories` | categories | Create/edit/delete (blocked if in use); image path saved | **Yes** | Create, edit, delete |
| Combos | `/admin/combos` | combos, combo_items | Product + quantity items; price/sale price; featured; active | **Yes** | Create, edit items, disable, delete |
| Hero slides | `/admin/hero` | hero_slides | CRUD, reorder, paths saved. **Not shown on the website** | **Yes** | CRUD and reload |
| Homepage | `/admin/homepage` | homepage_sections | "Save layout to database" when empty; toggle, reorder, titles | **Yes** | Hide a section → gone from `/` |
| Instagram reels | `/admin/reels` | instagram_reels | CRUD, reorder, thumbnail path | **Yes** | CRUD; check `/instagram` |
| Orders | `/admin/orders` | orders, order_items | Real orders; status change confirmed; variant shown per line | **Yes** (admin read) | Open the test order |
| Customers | `/admin/customers` | derived from orders | — | Admin read | — |
| Reviews | `/admin/reviews` | reviews | Approve / hide / delete | **Yes** | Approve → shows on product page |
| Coupons | `/admin/coupons` | coupons | Create (type, value, minimum, limit, expiry), toggle, delete | **Yes** | Create → apply in cart |
| Store Settings | `/admin/settings` | store_settings | Saves each key; shipping values used by cart and messages | **Yes** | Change threshold → cart and banners update |
| Admin Users | `/admin/admin-users` | RPCs | Grant by existing login e-mail; suspend; remove | **Yes** | Grant/suspend a test login |
| Enquiries | `/admin/enquiries` | contact_enquiries | Explains when the table is missing | Optional migration | — |

## 3. Not implemented

Payment gateway · automatic stock decrement · order e-mails/SMS · customer accounts · server-side price verification · hero slides on the website · audit log · automated tests · monitoring.

## 4. Admin-managed content that does not appear on the storefront (verified in code 2026-10-21)

| Content | Where managed | Storefront effect |
|---|---|---|
| Hero slides | Admin → Hero | **None** — the hero is the autoplay video only (decision pending, 12 §4) |
| Homepage section subtitle / description / image / button | Admin → Homepage (not editable in UI except title) | Not rendered. Titles are used only by the Best Sellers and New Arrivals grids |
| Homepage keys `editorial_feature`, `our_story`, `newsletter` | Built-in layout | Render nothing |
| Combo Pack and Reviews homepage sections | Only if a `homepage_sections` row with key `combos`/`combo_pack` or `reviews` exists | The built-in layout (what production shows today) has neither; Admin → Homepage cannot add new sections |
| `reviews.is_featured` | Database | Not used (homepage shows the latest approved reviews) |
| `combos.stock_quantity` | Admin → Combos | Not shown or enforced at checkout |
| `product_images` table | Database only | Not used (gallery images are in `products.fragrance_notes`) |
| Blogs / guides | — | **Not implemented** (no table, page or admin screen) |
