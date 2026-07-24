---
name: DB migrations workflow
description: How schema changes are applied in this repo (dev vs prod) and why drizzle push can block
---

# DB migrations workflow

**Rule:** For schema changes, apply DDL to the dev DB directly (executeSql), then mirror the exact DDL in a new hand-numbered file `lib/db/drizzle/NNNN_<tag>.sql` and append a matching entry to `meta/_journal.json`. Production is NOT migrated automatically — the numbered SQL file must be run against prod at publish time (a task usually tracks this).

**Why:** `pnpm --filter @workspace/db push` is interactive when a diff is ambiguous (create-vs-rename prompt) and hangs in non-TTY shells. This bit when `hub_tasks.status` (stale legacy column, long since replaced by `stage`) made push ask create-or-rename; dropping the stale column resolved it. The journal already has gaps (idx 13–14 missing) — it is a loose changelog, `push`/manual SQL are the real appliers.

**How to apply:** Write idempotent DDL (`IF NOT EXISTS` / `IF EXISTS`) so the file can be run safely on both dev and prod. After DDL, verify against information_schema + pg_constraint that FKs/defaults match the drizzle schema files exactly. Keep prod drift visible as a project task; deploy healthchecks fail with 500s when prod is missing columns.

## Typecheck resolves lib/db through dist/, not src/
After adding/renaming anything in `lib/db/src/schema/`, run `pnpm exec tsc -b` inside `lib/db` before typechecking dependents. api-server's tsc resolves `@workspace/db/schema` via composite-project declarations in `lib/db/dist/`, so a new schema file yields "Module has no exported member X" until dist is rebuilt — the export in src can be correct and it still fails.
**How to apply:** schema change → `cd lib/db && pnpm exec tsc -b` → then `pnpm --filter @workspace/api-server exec tsc --noEmit`. For the admin panel use its own script (`pnpm --filter @workspace/admin-panel run typecheck`); raw `tsc -b --noEmit` fails with TS6310 on referenced projects.
