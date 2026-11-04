# Step 14 (proposed): Perfumes subcategories

**Status: NOT APPLIED and not yet run against a test database.**

## Current Production state (read-only check, 2026-11-04)

Step 12 revision 2 **is applied**: `categories.parent_id` exists and every active category is linked.

| Main category | Subcategories (active) |
|---|---|
| Perfumes | none |
| Attars | Woody Attars, Arabic Attars, Traditional Attars |
| Fragrance Creams | none |
| Home Fragrance | Bakhoor, Room Fragrances |
| Body Care | Body Lotions, Body Mists, Body Oils, Personal Care |
| Combo Packs | none |

- No **active** category has the slug `musky`, `oud`, `floral` or `woody`.
- The retired fragrance families used these slugs and may still exist as **inactive** rows. Public reads cannot show inactive rows, so `14_verify_readonly.sql` checks for them.
- Active products: 1 (in Attars itself).

**Missing:** Perfumes › Musky, Oud, Floral and Woody. Everything else in the requested structure already exists.

## What step 14 does

It puts Musky, Oud, Floral and Woody under Perfumes, in that order.

- **A slug that already exists** (for example an inactive retired family) is **adopted**: it keeps its id, name, image and products, and is moved under Perfumes and made active.
- **Missing slugs** are created.
- Nothing else changes, and no product is moved.

The storefront needs no code change. The header dropdown, mobile menu, homepage section and Collections pills read the tree, so `/collections/perfumes?sub=musky` works as soon as the rows exist.

## Order

1. Run `14_verify_readonly.sql`. Section 1 shows which slugs exist; note any that will be adopted.
2. Run `14_perfume_subcategories.sql`. It is one transaction, and it prints a notice for each adopted row.
3. Run `14_verify_readonly.sql` again. Every check should be `ok = true`.

Rollback: `14_rollback.sql` restores adopted rows and deletes created ones. It refuses if products were assigned to a created row since.

## Without SQL

In Admin → Categories → **Add category**, set *Main Category* to "Subcategory of Perfumes" for each of the four.

This works only if no row with that slug exists already; slugs are unique. If an inactive retired family holds the slug, the admin's *Add* is refused. Edit that row instead: set its main category to Perfumes and tick *Active*.
