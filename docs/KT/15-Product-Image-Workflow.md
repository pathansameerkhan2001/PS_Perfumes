# 15 — Product Image Workflow

**Status (2026-10-24):** implemented locally, builds, **not browser-tested, dry-run only**. No image has been generated, uploaded or assigned.

Admin → Products → **Product Images** (`/admin/products/images`). Code: `src/admin/images/imageWorkflow.js`, `src/admin/pages/AdminProductImages.jsx`.

## What it does

| Stage | Behaviour |
|---|---|
| 1 Products | Reads all products (admin session) and builds one image slot per bottle look: products with Glass **and** PVC variants get two slots (`<slug>-glass-main`, `<slug>-pvc-main`); others get one (`<slug>-main`). Products that already have **any** image are skipped. Flagged source records need a per-session identity confirmation; unidentified/Zara records are excluded. File-name collisions are detected. |
| 2 Concepts | Shows a fixed prompt per slot and downloads a JSON prompt pack and a CSV manifest. **No generator is called** — none is configured. |
| 3 Review | Admin adds files; each must be WebP/PNG/JPEG, square (±1%), ≥ 1024 px, ≤ 10 MB. Approve/reject; declare *concept* (default) or *actual product photograph*. |
| 4 Match | Exact file-name match only. Ambiguous, duplicate and unmatched files are never assigned automatically; manual choice or ignore. |
| 5 Upload preview | Bucket + fixed path: concepts → `products/concepts/<stem>.<ext>`, photographs → `products/<stem>.<ext>`. Optional **read-only** Storage check for existing objects. |
| 6 Assignment preview | Which empty fields would be filled: `main_image_url/path`, `fragrance_notes.glass_image(_path)`, `fragrance_notes.pvc_image(_path)`. |
| 7 Approval | Disabled while `LIVE_IMAGE_WRITES_ENABLED = false`. When enabled: checkbox + typed `UPLOAD`. |
| 8 Results | Summary + manifest CSV (product id, name, slug, category, bottle, sizes, file name, local file, storage path, generation/review/upload/assignment status, concept vs photograph, prompt). |

## Safety rules enforced in code

- Dry run: `LIVE_IMAGE_WRITES_ENABLED = false`; `executePlanRow` throws while it is false. The only network calls are reading products and the optional Storage listing.
- Never overwrites: products with any stored image are skipped; `assignProductImages` fills empty fields only, guarded by `updated_at` and an empty-primary filter; uploads use fixed paths with `upsert: false` (the bucket also has no UPDATE policy).
- Retry-safe: an object already at the path with the same byte size counts as the earlier upload; a different one is a conflict.
- Verified before success: object listed after upload and the public URL answers `HEAD`.
- Status untouched: no code path changes `is_active`, prices, stock, SKUs, descriptions or variants. Concept images are refused for active products.
- Concept marker: the `products/concepts/` path (survives product-form saves; no schema change).

## Before enabling live writes (needs approval)

1. Storage set up by `supabase/new-project/03_storage.sql` (bucket `Ps-perfumes-media`, admin INSERT/SELECT policies; `products/concepts/…` is allowed because the first folder is `products`).
2. Signed in as an active `admin_users` row.
3. Set `LIVE_IMAGE_WRITES_ENABLED = true`, build, deploy — each step approved.

## Adding a generator later

Generation needs a secret API key, so it must not run in the browser (`VITE_*` values are public). Recommended: a Supabase Edge Function holding the provider key as a function secret, callable only when `is_admin()` is true, returning images for review (stage 3). No such function or key exists today.

## Pilot prompts (Khamrah)

All three share the style and no-branding text; only the bottle description differs. Negative prompt: `text, letters, numbers, typography, watermark, logo, brand name, readable label, packaging box, hands, people, duplicate bottles, distorted glass, warped cap, cluttered props, dark background`.

**Style:** Premium e-commerce studio product photograph, square 1:1, 2048 x 2048 px. Warm cream-ivory seamless background, soft diffused studio key light with a subtle warm gold rim light, gentle realistic contact shadow. Minimal black-and-gold accents (a small polished black stone plinth and a thin gold line) kept softly out of focus. Single bottle centred, occupying about 60% of the frame height, three-quarter front view, identical camera height, framing and lighting for every image in the series.

**No branding:** The bottle has a plain blank black-and-gold label panel with no text, letters, numbers, logos or brand marks, and no packaging box. Generic concept visual; it does not depict any specific branded product.

| File | Bottle description |
|---|---|
| `khamrah-attar-main.webp` | A small glass attar flacon (6 to 12 ml) with a faceted clear glass body, golden-amber perfume oil visible inside, and a short polished gold cap. |
| `khamrah-perfume-spray-glass-main.webp` | A clear heavy glass perfume spray bottle with thick glass walls, a polished gold spray cap and collar, and golden perfume visible inside. |
| `khamrah-perfume-spray-pvc-main.webp` | A lightweight clear PVC plastic perfume spray bottle with smooth rounded shoulders, thin walls and a glossy gold cap, golden perfume visible inside. The material must read clearly as plastic, not glass. |

File names assume the imported slugs `khamrah-attar` and `khamrah-perfume-spray`; stage 1 shows whether they exist.
