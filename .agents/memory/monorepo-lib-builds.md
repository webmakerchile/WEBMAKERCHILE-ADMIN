---
name: Monorepo lib builds after merges
description: Stale composite dist and missing node_modules links after task-agent merges
---

After a task-agent merge, TS errors like "Cannot find module '@workspace/x'" or TS6305 ("Output file ... has not been built") usually mean environment drift, not bad code.

**Why:** lib packages (`lib/roles`, `lib/areas`, `lib/db`) are composite TS projects consumed via `dist/*.d.ts`; merges add new deps/exports but neither `pnpm install` nor `tsc -b` runs automatically.

**How to apply:** run `pnpm install` at the repo root, then `npx tsc -b lib/<pkg>` for each failing lib, before assuming merged code is broken. Also verify new tables from the merge exist in the dev DB.
