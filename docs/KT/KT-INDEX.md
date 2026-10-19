# PS PERFUMES — Knowledge Transfer Index

**Project:** PS PERFUMES storefront + admin console · **Repo root:** `E:\Ps_Perfumes\PS_Perfumes` (GitHub `pathansameerkhan2001/PS_Perfumes`, branch `main`) · **Updated:** 2026-10-20.

**Stack:** React 19 + Vite 8 SPA (JavaScript) → Supabase (Auth, Postgres + RLS, Storage bucket `ps-perfumes`) · static hosting on Vercel (inferred) · no server code, no CI, no tests.

**Status in one line:** code fixes are implemented and build, but are **uncommitted, not deployed, and not browser-tested**; the production migration is **not applied**. Start with [13](13-Production-Migration-and-Handover.md).

## Where to start

| If you are… | Read |
|---|---|
| Taking over / going live | 13 → 00 → 07 → 09 |
| New developer | 00 → 01 → 02 → 10 → 03 |
| Cloud / DevOps | 04 → 05 → 06 → 13 → 11 |
| Fixing a production problem | 09 |

## Documents

| # | Document | Covers |
|---|---|---|
| 00 | [Project Overview](00-Project-Overview.md) | Purpose, roles, current state, business rules, limitations |
| 01 | [Architecture and Data Flow](01-Architecture-and-Data-Flow.md) | Stack, diagrams, request flows, error handling |
| 02 | [Repository and Code Walkthrough](02-Repository-and-Code-Walkthrough.md) | Folders, routes, services, workflows, change checklists |
| 03 | [Database and Data Model](03-Database-and-Data-Model.md) | **Verified live schema**, RLS after migration, DB functions |
| 04 | [Cloud Infrastructure](04-Cloud-Infrastructure.md) | Supabase, Storage/media workflow, Vercel, verification checklist |
| 05 | [Environment and Secrets](05-Environment-and-Secrets.md) | Variables, build-time config, secret findings |
| 06 | [Deployment and CI/CD](06-Deployment-and-CICD.md) | Build, deploy, rollback |
| 07 | [Authentication and Security](07-Authentication-and-Security.md) | Admin model, findings and their fix status |
| 08 | [Functional Module Inventory](08-Functional-Module-Inventory.md) | Every module with status and test steps |
| 09 | [Troubleshooting Runbook](09-Troubleshooting-Runbook.md) | Symptoms → causes → fixes |
| 10 | [Developer Onboarding](10-Developer-Onboarding.md) | Local setup |
| 11 | [Testing and Operations](11-Testing-and-Operations.md) | Manual tests, smoke test, monitoring, backups, incidents |
| 12 | [Future Implementation Roadmap](12-Future-Implementation-Roadmap.md) | Remaining work in phases |
| 13 | [Production Migration and Handover](13-Production-Migration-and-Handover.md) | **Exact go-live procedure and readiness checklist** |

## Five things to know first

1. **The repo's `supabase/schema.sql` is stale.** The live schema is documented in [03](03-Database-and-Data-Model.md) §2 (verified 2026-10-19).
2. **The migration is pending.** Until it runs, admin uploads and deletes fail and checkout/coupons may be blocked by permissions.
3. **No demo data anymore.** The site shows only database content; empty tables mean empty sections.
4. **Payment is COD only.** There is no gateway; never mark orders paid automatically.
5. **Every admin write now reports the real database error.** A save that RLS silently ignores is reported as a failure.

No secrets are reproduced in these documents; placeholders such as `<SUPABASE_URL>` and `<project-ref>` are used.
