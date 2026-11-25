# Step 16 — flat Air Shipping (₹49) · PROPOSED, NOT APPLIED

**Why:** the storefront now shows **Air Shipping, a flat ₹49 per order** with no free-shipping
threshold (`src/config/shipping.js`). The amount actually charged is computed in the database by
`place_order` (COD) and `place_order_core` (Razorpay). Until this step is applied, those functions still
charge the old rule: ₹99, or free from ₹1,500. **Apply this step together with the storefront deploy** so
the page and the charge match.

**What it changes:** one line in each of the two functions (see the header of `16_flat_shipping.sql`).
Nothing else: prices, stock, SKUs, variant ids, coupons, grants and existing orders stay as they are.
The `store_settings` rows `free_shipping_threshold` / `standard_shipping_fee` are left in place but no
longer used, and Admin → Store Settings no longer edits them.

| Order | File | Notes |
|---|---|---|
| 1 | `16_verify_readonly.sql` | Read-only. Both rows should say `original` before you start |
| 2 ⛔ | `16_flat_shipping.sql` | Needs written approval. Back up first. One transaction, fingerprint-checked |
| 3 | `16_verify_readonly.sql` | Both rows should now say `step16`, `charges_flat_49 = true` |
| Rollback ⛔ | `16_rollback.sql` | Restores the exact step 08 / 09 v2 functions. Revert the storefront code too |

**Before step 11:** step 11 (PIN code shipping, not applied) checks that both functions are the
step 08 / 09 v2 versions, so it refuses to run after step 16. Roll 16 back first, or revise 11.

**Test after applying (staging or with the owner):** place one COD order and one Razorpay order below
and one above ₹1,500. Each should have `shipping_amount = 49` and `total = subtotal − discount + 49`.
