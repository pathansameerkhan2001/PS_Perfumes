# Step 12, revision 2 (proposed): four main categories and 14 subcategories

**Status: NOT APPLIED and not yet run against a test database.** Run only one of `proposed-12-categories/12_categories.sql` or `12r2_categories.sql`, never both.

## Why Body Care and the subcategories are missing today

Read-only check of Production, 2026-11-04:

| Finding | Effect |
|---|---|
| Active categories: Perfumes, Attars, Fragrance Creams, Home Fragrance, Combo Packs | **No Body Care record** is visible. An *inactive* one would be hidden from public reads; Admin → Categories lists all of them. |
| `categories.parent_id` does not exist | No subcategories can exist, so no filter pills or dropdowns appear. |
| All 9 active products are in Attars (all named "… Perfume Spray") | Correct assignment is an admin decision; this migration moves nothing. |
| The storefront never lists `fragrance-creams` or `combo-packs` as main categories | This is a deliberate rule (`NOT_MAIN_CATEGORY_SLUGS`, src/services/categories.js), not a product-count filter. That is why exactly three tabs show. |

## What revision 2 does

- Adds `parent_id` and the guards, unchanged from step 12.
- Adopts the existing `perfumes`, `attars` and `home-fragrance` rows. Their id, name, image, status and products are kept.
- Creates `body-care` and the 14 requested subcategories. Any slug that already exists, even an inactive one, is adopted instead of duplicated.
- Moves **no products** and deactivates **nothing**.

| Main category | Subcategories |
|---|---|
| Perfumes | Arabic Perfumes, Designer-Inspired Perfumes, Luxury Perfumes |
| Attars | Musk Attars, Oud Attars, Floral Attars, Woody Attars |
| Home Fragrance | Bakhoor, Incense Sticks, Room Fragrances |
| Body Care | Body Lotions, Body Mists, Body Oils, Personal Care |

## Differences from step 12 (the earlier owner list)

- **Attars:** adds Woody Attars; drops Arabic Attars and Traditional Attars.
- **Home Fragrance:** adds Room Fragrances; drops Bakhoor Burners.
- **Body Care:** Body Lotions, Body Mists, Body Oils and Personal Care replace Perfume Cream, Body Cream and Fragrance Cream.
- **Product moves:** none. Step 12 moved products out of the seven families, which no longer exist.

## Decisions left to the owner

1. **Fragrance Creams** (active, 0 products) is not in the new list. Earlier the owner placed creams under Body Care. Options: make it a Body Care subcategory, deactivate it, or keep it hidden as now.
2. **Combo Packs** (active, 0 products) stays a main category in the database and is shown only as its own navigation link.
3. Move the 9 Perfume Spray products to the right category or subcategory (Admin → Products) after the migration.

## Order

1. Run `12r2_verify_readonly.sql`. It lists which requested slugs exist, whether they are active, and their product counts.
2. Run `12r2_categories.sql`. It is one transaction: any failed check changes nothing. Inactive adopted rows are reported as notices.
3. Run `12r2_verify_readonly.sql` again.

The rollback is `12_rollback.sql`, the same file as step 12.
