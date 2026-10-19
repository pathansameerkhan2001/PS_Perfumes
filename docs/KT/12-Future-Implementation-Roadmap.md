# 12 — Future Implementation Roadmap

> Planning only. Items here are **not implemented** unless stated.

## 1. Readiness snapshot (2026-10-20)

| Area | State |
|---|---|
| Code fixes for admin/storefront | Implemented, build passes, uncommitted, not deployed, not tested |
| Production migration | Written and reviewed, **not applied** |
| Staging environment | None |
| CI / automated tests / monitoring | None |
| Payments | COD only |
| Backups | Unverified |

## 2. Phases

**Phase 1 — Go-live of current work (blocking)**
Follow [13](13-Production-Migration-and-Handover.md): commit, diagnostics, migration, deploy, manual tests T-1…T-24, owner sign-off. *Acceptance:* all critical tests pass on production.

**Phase 2 — Owner decisions**
Confirm the free-shipping threshold and fee (save in Store Settings); decide on the enquiries table; decide whether hero slides should appear over the video; recreate any coupons customers know (PS10, WELCOME20) if still wanted.

**Phase 3 — Operational safety**
Staging Supabase project and Vercel Preview env vars; GitHub Actions (`npm ci`, lint, build); confirm paid Supabase plan and backups; Storage backup script; uptime monitor and error tracking; `git rm --cached .env`; security headers in `vercel.json`.

**Phase 4 — Commerce hardening**
Server-side order creation (RPC) that re-prices lines from `product_variants`, applies the coupon and decrements stock atomically; order notification e-mail/WhatsApp to the owner; optional payment gateway (e.g. Razorpay) with server-side verification and webhook — **requires owner approval and a server component holding the secret key**.

**Phase 5 — Quality**
Vitest for `formatProduct`, cart totals and coupon maths; Playwright for checkout and admin product flow on staging; RLS tests per role.

**Phase 6 — Housekeeping**
Remove dead code (`lib/auth.js`, `CheckoutModal.jsx`, `data/*`, `AdminBanners.jsx`), de-duplicate `src/assets` vs `public/assets`, commit a fresh `supabase db dump` as the schema baseline, clean orphaned Storage files.

## 3. Contact enquiries — decision pending

| Option | What happens | Pros | Cons |
|---|---|---|---|
| **A. Keep direct contacts (current code)** | `/contact` detects that no enquiries table exists, disables the form and shows e-mail, Instagram and WhatsApp links | No new public write surface; nothing to monitor; messages reach channels the owner already uses | No in-site form; no admin inbox |
| B. Database-backed form (optional migration) | Visitors may only INSERT (length/format checks, status `unread`); admins read/manage in Admin → Enquiries | Messages stored and visible in admin | New anonymous write endpoint with no CAPTCHA/rate limit → spam risk; someone must check the inbox (no e-mail notification exists) |

**Recommendation: A** until there is an owner who will check the admin inbox and a spam control (CAPTCHA or rate limiting) is planned. The code supports B without changes once the migration is approved.

## 4. Hero slides — decision pending

| Option | Pros | Cons |
|---|---|---|
| **A. Video only; hide or label the Hero Slides admin page as "not shown on the website"** | Matches the current cinematic design; no layout risk; removes admin confusion | Promotional messages need another place (e.g. announcement ticker) |
| B. Video plus slide content as a restrained text/CTA overlay or a section directly below the video | Admin can change campaign text without code | Design and responsive work; overlay text on video affects legibility and LCP; must not reintroduce a "PLAY SHOWCASE" style overlay |

**Recommendation: A** (keep the video as the only hero visual and clearly label the admin page), because the current design is built around a full-bleed video and no slide content is shown today. No change has been made; awaiting approval.
