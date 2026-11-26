# Step 17 — PIN-code Delivery Rule (516001 & 516002 Free, Others ₹49) · PROPOSED, NOT APPLIED

**Target:** `ps-perfumes-production` (`pwacxxrghlglvdtclbig`)  
**Status:** PROPOSED. Review only. Apply manually in the Supabase SQL Editor only after written approval.

---

## 1. Why

The storefront delivery policy has been updated:
- Customer-facing label renamed to **"Delivery Charges"**.
- Delivery to PIN codes **`516001`** and **`516002`** (Kadapa atelier) is **FREE (₹0)**.
- Delivery to all other valid Indian PIN codes is **₹49**.
- Missing, incomplete, or invalid PIN codes leave the charge uncalculated (`null`) and block checkout until a valid 6-digit PIN code is supplied.

To ensure strict database authoritativeness:
- Client-provided shipping amounts are ignored.
- The database directly evaluates `v_pincode` (which is already extracted from `p_customer ->> 'pincode'` and validated against `^[1-9][0-9]{5}$`).
- If `v_pincode in ('516001', '516002')`, `v_shipping := 0`.
- If `v_pincode not in ('516001', '516002')` and `v_subtotal > 0`, `v_shipping := 49`.
- If `v_subtotal <= 0`, `v_shipping := 0`.

---

## 2. What Changes

In both `place_order` (COD) and `place_order_core` (Razorpay):

```sql
-- Before (Step 16)
v_shipping := case when v_subtotal > 0 then 49 else 0 end; -- Step 16: flat Air Shipping

-- After (Step 17)
v_shipping := case when v_subtotal > 0 and v_pincode not in ('516001', '516002') then 49 else 0 end; -- Step 17: PIN 516001 & 516002 free, others ₹49
```

Both functions already contain this validation immediately before order creation:
```sql
if v_pincode !~ '^[1-9][0-9]{5}$' then
  raise exception 'Enter a valid 6-digit PIN code.';
end if;
```
Thus, no invalid or empty PIN code can ever be processed.

---

## 3. Fingerprints

| Function | Live (Step 16) | Target (Step 17) | Original (Steps 08/09 v2) |
|---|---|---|---|
| `place_order(jsonb, jsonb, text, text, uuid)` | `7e6e340c8f2fb2c9deb0f7c753ac7a8a` | `5ce511e7c3119b4210d0c9128f06301b` | `f58df5ff55e84e958d1e27336cd82f6e` |
| `place_order_core(jsonb, jsonb, text, text, uuid)` | `99cfea71ece5e3b8706ff5b5c74ecc43` | `8f318b975a346db1012356db55a3ac27` | `11e685594045be8687ee025bcba72c8c` |

---

## 4. Verification & Rollback

- **Verify anytime without modifying:**  
  Run `17_verify_readonly.sql`. When live, both functions will report `state = 'step17'` and `charges_pincode_rule = true`.
- **Rollback:**  
  Run `17_rollback.sql` to revert to Step 16 (flat ₹49 shipping).
