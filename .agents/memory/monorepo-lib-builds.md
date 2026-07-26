---
name: Monorepo lib builds after merges
description: Stale composite dist after merges o codegen, y el pipeline correcto para agregar endpoints nuevos a la API
---

After a task-agent merge, TS errors like "Cannot find module '@workspace/x'" or TS6305 ("Output file ... has not been built") usually mean environment drift, not bad code.

**Why:** lib packages (`lib/roles`, `lib/areas`, `lib/db`) are composite TS projects consumed via `dist/*.d.ts`; merges add new deps/exports but neither `pnpm install` nor `tsc -b` runs automatically.

**How to apply:** run `pnpm install` at the repo root, then `npx tsc -b lib/<pkg>` for each failing lib, before assuming merged code is broken. Also verify new tables from the merge exist in the dev DB.

## Pipeline para endpoints nuevos de la API

Regla: un endpoint nuevo se declara en `lib/api-spec/openapi.yaml` → `pnpm --filter @workspace/api-spec run codegen` (regenera `api-client-react` y `api-zod` src/generated) → si el nombre existe en ambos módulos generados (zod const + tipo TS), agregarlo al bloque de re-export explícito de `lib/api-zod/src/index.ts` → `npx tsc -b lib/api-zod lib/api-client-react`.

**Why:** el `export *` doble omite silenciosamente los nombres ambiguos (TS2305 "has no exported member" aunque el runtime resuelva bien — vitest pasa y tsc falla), y los consumidores type-resuelven contra dist compuesto stale hasta el `tsc -b`.

**How to apply:** además, todo endpoint que llame IA debe sumarse al regex de `aiLimiter` en app.ts Y a MUST_AI en limiter-coverage.test.ts; y validar body con `safeParse` + 400 amable — el error handler global responde 500 con el dump crudo de ZodError si se usa `.parse`.
