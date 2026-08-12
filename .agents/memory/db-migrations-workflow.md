---
name: DB migrations workflow
description: How schema changes are applied in this repo (dev vs prod) and why drizzle push can block
---

# DB migrations workflow

**Rule:** For schema changes, apply DDL to the dev DB directly (executeSql), then mirror the exact DDL in a new hand-numbered file `lib/db/drizzle/NNNN_<tag>.sql` as human-readable documentation only. **Current practice (confirmed as of migration 0040, Aug 2026): do NOT add an entry to `meta/_journal.json`** — recent migrations (35+) skip it entirely; Publish diffs dev vs prod schema directly from introspection, not from the journal. Production schema is applied by Replit's **Publish flow**: it introspects dev vs prod, computes a SQL diff, asks the user to confirm renames in the Publish UI, and applies it during publish. Never run DDL against prod yourself (agent prod SQL is read-only SELECT) and never add deploy-build or startup migration hooks.

**Why:** `pnpm --filter @workspace/db push` is interactive when a diff is ambiguous (create-vs-rename prompt) and hangs in non-TTY shells. This bit when `hub_tasks.status` (stale legacy column, long since replaced by `stage`) made push ask create-or-rename; dropping the stale column resolved it. The journal already has gaps (idx 13–14 missing) and recent migrations stopped extending it at all — it is a loose/abandoned changelog, not a real applier; `push`/manual SQL + Publish's own introspection are what actually matter. Publish auto-migration verified July 2026: after a republish, pending tables/columns appeared in prod with no manual step.

**How to apply:** Write idempotent DDL (`IF NOT EXISTS` / `IF EXISTS`); keep changes additive when possible (renames without Publish-UI confirmation become drop+add → data loss). After DDL, verify against information_schema + pg_constraint that FKs/defaults match the drizzle schema files. After a publish with schema changes, verify prod via information_schema SELECTs (`environment: "production"`). Publish moves **schema only** — rows created in dev (config, pairings, seeds) must be recreated in the published app.

## Post-merge reconciliation hits the exact same hang, one layer up

A task agent applies its schema DDL directly to *its own* isolated dev DB and leaves a numbered `lib/db/drizzle/NNNN_*.sql` file purely as documentation. Merging brings the **code** into the main agent's environment but not that DB state, so the post-merge script's `pnpm --filter db push` re-diffs against the main dev DB and hits the same create-vs-rename prompt — confirmed recurring (`hub_tasks.status` earlier, `ideas` rename to `column_id`/`created_by_user_id` later).

- **`--force` does not help:** per `drizzle-kit push --help`, it only "auto-approves data loss statements" (confirm-style prompts). The create-vs-rename disambiguation is a `select`-style prompt with no flag to answer it non-interactively. Any rename-shaped diff will hang the post-merge script every time, regardless of flags — this is a structural limit, not a config bug.
- **It does not fail fast on closed stdin either:** the skill assumes EOF on `/dev/null` stdin makes prompting commands "fail immediately," but drizzle-kit's select prompt just hangs until the external post-merge timeout kills it — so a rename always burns the *entire* configured timeout.
- **Recovery recipe (confirmed working):** find the newest `lib/db/drizzle/NNNN_*.sql` (its date/commit lines up with the failed merge), apply its DDL verbatim to the current dev DB via `executeSql`, verify with `information_schema.columns`/`pg_indexes` against the drizzle schema file, then `cd lib/db && pnpm exec tsc -b` (post-merge never rebuilds dist, so typecheck stays stale otherwise), then re-run the push script — "No changes detected" from drizzle itself is the authoritative confirmation the manual DDL exactly matches code (stronger than eyeballing columns).
- **Standing fix applied:** `scripts/post-merge.sh` now runs `push-force` instead of plain `push`, since `--force` still helps for the common *non*-rename case (drop/add-shaped diffs that would otherwise also prompt). Rename-shaped diffs will still need this manual recovery — that's expected, not a leftover bug to chase.

## Typecheck resolves lib/db through dist/, not src/
After adding/renaming anything in `lib/db/src/schema/`, run `pnpm exec tsc -b` inside `lib/db` before typechecking dependents. api-server's tsc resolves `@workspace/db/schema` via composite-project declarations in `lib/db/dist/`, so a new schema file yields "Module has no exported member X" until dist is rebuilt — the export in src can be correct and it still fails.
**How to apply:** schema change → `cd lib/db && pnpm exec tsc -b` → then `pnpm --filter @workspace/api-server exec tsc --noEmit`. For the admin panel use its own script (`pnpm --filter @workspace/admin-panel run typecheck`); raw `tsc -b --noEmit` fails with TS6310 on referenced projects.
