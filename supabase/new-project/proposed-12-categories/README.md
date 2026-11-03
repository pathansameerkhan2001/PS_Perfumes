# Migration 12: two-level categories

**Status: proposed and tested locally on PostgreSQL 17.11 (60 of 60 checks). Not applied to any remote database.**

It adds main categories with subcategories, creates the four-category structure, and moves existing products out of the seven fragrance families. It touches no checkout, payment, order, price, stock or image data, and it doesn't depend on Migrations 10 or 11.

## Files

| File | Purpose | Writes? |
|---|---|---|
| `12_precheck_readonly.sql` | Run first; read the move plan and save the counts | No |
| `12_categories.sql` | The migration | Yes |
| `12_verify_readonly.sql` | Run only after the migration has succeeded | No |
| `12_rollback.sql` | Undoes the migration using its log | Yes |
| `tests/` | Local test suite and fixture | Disposable container only |
| `test-results-pg17.txt` | Output of the latest test run | No |

**Never run `12_verify_readonly.sql` before the migration.** It stops with `Migration 12 is not applied, so nothing was verified. No data was changed.`

## What changes

**Structure.** The migration adds `categories.parent_id`, which is null for a main category. It allows two levels only: a subcategory can't have subcategories, and a category can't be its own parent. The column is nullable with no default, so no table rewrite happens.

**Categories.** It creates 4 main categories and 14 subcategories, 18 in all:

| Main | Subcategories |
|---|---|
| Perfumes | Arabic Perfumes, Designer-Inspired Perfumes, Luxury Perfumes |
| Attars | Arabic Attars, Oud Attars, Musk Attars, Floral Attars, Traditional Attars |
| Home Fragrance | Bakhoor, Incense Sticks, Bakhoor Burners |
| Body Care | Perfume Cream, Body Cream, Fragrance Cream |

If a slug already exists, the migration adopts that row instead of creating a duplicate. Adoption changes only the row's parent and position. Its name, image, description and status stay as they are. The existing `bakhoor` category becomes Home Fragrance › Bakhoor and keeps its products.

**Product moves.** These follow the owner's choice of automatic mapping:

| From | To |
|---|---|
| Perfume | Perfumes |
| Attar | Attars |
| Woody | Attars |
| Musky | Attars › Musk Attars |
| Oud | Attars › Oud Attars |
| Floral | Attars › Floral Attars |

Products in any other category, or with no category, stay where they are. Only `category_id` changes, and the products' `updated_at` moves with it. The six emptied families are made **inactive, not deleted**.

**Effect of the mapping.** Products that move into Attars are treated as attars wherever the storefront checks. That affects only the fallback size for a product with no variants and one label on the product page. Real variants and prices are unchanged. The owner can refine any product's category in Admin.

**Guards.**
- A category that still has products can't be deleted. Before this migration, deleting one silently left its products with no category.
- A main category can't be deleted while it has subcategories.

**Log.** Table `category_migration_12_log` records every created, adopted, moved and deactivated row, so the rollback can be exact. It has RLS on, no policy, and no grants.

## Rules

- **Access:** the existing category policies are unchanged. Visitors read active categories, including `parent_id`, and admins manage them. New functions and tables can't be reached by visitors.
- **Indexes:** none added. The storefront reads the whole active categories table, which has under 30 rows, and filters products by `category_id`, which `products_category_id_idx` already covers.
- **Locking:** `lock_timeout` is 5 seconds and `statement_timeout` is 60 seconds. `categories` is locked for the run, which takes well under a second. Product rows are locked only while they are moved.

## Code compatibility

The storefront and admin code work with and without this migration:

- **Without it:** every category is a main category with no subcategory filters. The old URLs (`/attar`…`/woody`, `/category/<slug>`) show the original collection pages.
- **With it:** the header, mobile menu, footer and homepage list the active main categories, each linking to `/collections/<slug>`. The old URLs redirect there. For example, `/musky` goes to `/collections/attars?sub=musk-attars`.

So the code can be deployed before or after the migration, and neither rollback needs the other first.

## Order of work

1. Confirm a verified backup.
2. Run `12_precheck_readonly.sql`. Check the move plan and the adopted slugs, which should list only `bakhoor`.
3. Run `12_categories.sql`.
4. Run `12_verify_readonly.sql`.

## Rollback

`12_rollback.sql` does the following:
- Puts moved products back in their families. A product an admin has moved since keeps its new category.
- Reactivates the families and restores adopted positions.
- Deletes the created categories.
- Removes the guards, `parent_id` and the log.

It stops, changing nothing, if a product was placed in a new category after the migration, or if someone has created a new subcategory. Any names, images or descriptions given to the created categories after the migration are lost.

## Running the tests

Docker Desktop must be running, with the `postgres:17.11` image present. From the repository root:

```bash
bash supabase/new-project/proposed-12-categories/tests/run_tests.sh supabase/new-project/proposed-12-categories/test-results-pg17.txt
```

The suite builds the production state (01, 02, 07, 08, 09 v2 and 10) in a container with no network, then checks:
- precheck, install (as one request and statement by statement), and verify;
- every product move and the adoption of existing slugs;
- that products, variants, images, orders, coupons, customers, combos, functions, policies and grants are unchanged;
- the payment and checkout fingerprints;
- the guards and visitor access;
- rollback, its two stops, and reinstalling;
- the lock timeout.
