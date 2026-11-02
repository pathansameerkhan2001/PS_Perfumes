# Migration 11: shipping priced by delivery PIN code

**Status: proposed and tested locally on PostgreSQL 17.11. Not applied to any remote database.**

Shipping is priced on the server, in one place, for both checkouts: `ps_shipping_quote` is called by `place_order` (COD) and `place_order_core` (Razorpay). The browser never sends a shipping charge that is used.

## Files

| File | Purpose | Writes? |
|---|---|---|
| `11_shipping.sql` | The migration. Requires Migration 10 | Yes |
| `11_verify_readonly.sql` | Run only after the migration has succeeded | No |
| `11_rollback.sql` | Restores the step 08 and 09 v2 checkout functions exactly; keeps tables and order records | Yes |
| `tests/` | Local test suite (`run_tests.sh`) | Disposable container only |
| `test-results-pg17.txt` | Output of the latest test run | No |

The two checkout functions in `11_shipping.sql` were generated from the exact text of steps 08 and 09 v2 with three edits each, all marked `11:` (shipping variables, the shipping section, the two new order columns). The rollback restores the original text, and its fingerprints are checked.

## Modes

| Mode | Shipping | When |
|---|---|---|
| `legacy` | `free_shipping_threshold` / `standard_shipping_fee` from Store Settings (defaults 1500 / 99), exactly as today | After the migration |
| `pincode` | By delivery PIN code, from Admin → Shipping | Only when switched on, and only if every decision is recorded and at least one PIN code can be delivered to |

The tests prove legacy mode gives the same subtotal, shipping, discount and total as steps 08 and 09 v2 in 40 cases, across four Store Settings states including malformed values and missing rows.

## PIN code rules

1. An **active** row for the PIN code:
   - not serviceable → refused, even when a fallback is allowed;
   - its own charge → that charge;
   - otherwise its zone's charge, if the zone is active → refused if the zone is off.
2. No active row → the fallback charge if the owner allowed one, otherwise refused.
3. Free shipping, if the owner chose a threshold: charge 0 when the item total **before the coupon** reaches it, as the legacy rule counts it.
4. Coupons and item prices are untouched; total = items − discount + shipping, as before.

Refusals reach the shopper as: *Sorry, we do not deliver to PIN code 560001 yet. Please check the PIN code, or contact us for help.*

Each order records `shipping_pincode` and `shipping_rate` (rule, rate row id, zone, base charge, free-shipping flag). A retry of a saved checkout attempt keeps its original price.

## Safeguards in the database

- Pincode mode cannot start while the fallback or free-shipping decision is blank (`shipping_config_pincode_mode_decided`).
- It cannot start, and no PIN code or zone change is accepted, if that would leave nothing deliverable.
- Visitors cannot read the tables; `get_shipping_quote` shows them a charge and a message only.
- Only administrators (RLS, `is_admin()`) manage PIN codes, zones and the single config row.

## Business inputs still needed

Nothing is pre-filled. Until these are entered in Admin → Shipping, checkout stays on the standard rule.

1. The initial list of serviceable PIN codes.
2. The charge for each PIN code, or the zones and their charges.
3. Whether PIN codes that are not listed may use a fallback charge, and how much.
4. Whether any free-shipping condition applies, and from what item total.
5. Any PIN codes to refuse explicitly.

## Order of work

1. Confirm a verified backup.
2. Run `11_shipping.sql` (after Migration 10), then `11_verify_readonly.sql`.
3. Deploy the storefront and admin code. Before the migration, that code falls back to the standard rule.
4. Enter the business inputs, then press **Use PIN code rates at checkout**.

After this migration, `10_verify_readonly.sql` reports the two replaced checkout fingerprints as false; that is expected.

**Rollback order:** revert the code, then run `11_rollback.sql`. It must come **before** any rollback of Migration 10 or 09 v2, and `09v2_rollback.sql` refuses to run until it has. While pincode mode is on, the rollback changes what customers pay, so it asks for the confirmation described in its header.

## Running the tests

With Docker running, from the repository root:

```bash
bash supabase/new-project/proposed-11-shipping/tests/run_tests.sh supabase/new-project/proposed-11-shipping/test-results-pg17.txt
```

Every charge and PIN code in the tests is a fixture, not a business value.
