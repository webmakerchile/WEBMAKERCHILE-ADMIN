---
name: DB migrations workflow
description: How schema changes are applied in this repo (dev vs prod) and why drizzle push can block
---

# DB migrations workflow

**Rule:** For schema changes, apply DDL to the dev DB directly (executeSql), then mirror the exact DDL in a new hand-numbered file `lib/db/drizzle/NNNN_<tag>.sql` and append a matching entry to `meta/_journal.json`. Production schema is applied by Replit's **Publish flow**: it introspects dev vs prod, computes a SQL diff, asks the user to confirm renames in the Publish UI, and applies it during publish. Never run DDL against prod yourself (agent prod SQL is read-only SELECT) and never add deploy-build or startup migration hooks.

**Why:** `pnpm --filter @workspace/db push` is interactive when a diff is ambiguous (create-vs-rename prompt) and hangs in non-TTY shells. This bit when `hub_tasks.status` (stale legacy column, long since replaced by `stage`) made push ask create-or-rename; dropping the stale column resolved it. The journal already has gaps (idx 13–14 missing) — it is a loose changelog, `push`/manual SQL are the real appliers. Publish auto-migration verified July 2026: after a republish, pending tables/columns appeared in prod with no manual step.

**How to apply:** Write idempotent DDL (`IF NOT EXISTS` / `IF EXISTS`); keep changes additive when possible (renames without Publish-UI confirmation become drop+add → data loss). After DDL, verify against information_schema + pg_constraint that FKs/defaults match the drizzle schema files. After a publish with schema changes, verify prod via information_schema SELECTs (`environment: "production"`). Publish moves **schema only** — rows created in dev (config, pairings, seeds) must be recreated in the published app.

## Typecheck resolves lib/db through dist/, not src/
After adding/renaming anything in `lib/db/src/schema/`, run `pnpm exec tsc -b` inside `lib/db` before typechecking dependents. api-server's tsc resolves `@workspace/db/schema` via composite-project declarations in `lib/db/dist/`, so a new schema file yields "Module has no exported member X" until dist is rebuilt — the export in src can be correct and it still fails.
**How to apply:** schema change → `cd lib/db && pnpm exec tsc -b` → then `pnpm --filter @workspace/api-server exec tsc --noEmit`. For the admin panel use its own script (`pnpm --filter @workspace/admin-panel run typecheck`); raw `tsc -b --noEmit` fails with TS6310 on referenced projects.
