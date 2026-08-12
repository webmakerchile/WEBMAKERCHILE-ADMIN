---
name: Monorepo lib builds after merges
description: Stale composite dist after merges o codegen, y el pipeline correcto para agregar endpoints nuevos a la API
---

After a task-agent merge, TS errors like "Cannot find module '@workspace/x'" or TS6305 ("Output file ... has not been built") usually mean environment drift, not bad code. Same symptom happens with NO merge involved: editing a `lib/*/src` file yourself (e.g. adding a column to a `lib/db` schema) and typechecking a consumer package (e.g. `api-server`) fails with "Property X does not exist" even though the source clearly has it.

**Why:** lib packages (`lib/roles`, `lib/areas`, `lib/db`) are composite TS projects consumed via `dist/*.d.ts`; the package.json `exports` field points at `.ts` source (fine for tsx/vite runtime), but cross-package **type-checking** goes through TS project references, which resolve against the stale compiled `dist/*.d.ts` — neither `pnpm install` nor `tsc -b` runs automatically after a source edit, a merge, or codegen.

**How to apply:** any time you edit a `lib/*/src` file (not just after a merge) and a consumer's `tsc --noEmit` complains about a property/export that is clearly in the source, run `npx tsc -b lib/<pkg>` for that lib first before debugging further. After a task-agent merge specifically, also run `pnpm install` at the repo root first, then `tsc -b` each failing lib, and verify new tables from the merge exist in the dev DB.

## Pipeline para endpoints nuevos de la API

Regla: un endpoint nuevo se declara en `lib/api-spec/openapi.yaml` → `pnpm --filter @workspace/api-spec run codegen` (regenera `api-client-react` y `api-zod` src/generated) → si el nombre existe en ambos módulos generados (zod const + tipo TS), agregarlo al bloque de re-export explícito de `lib/api-zod/src/index.ts` → `npx tsc -b lib/api-zod lib/api-client-react`.

**Why:** el `export *` doble omite silenciosamente los nombres ambiguos (TS2305 "has no exported member" aunque el runtime resuelva bien — vitest pasa y tsc falla), y los consumidores type-resuelven contra dist compuesto stale hasta el `tsc -b`.

**How to apply:** además, todo endpoint que llame IA debe sumarse al regex de `aiLimiter` en app.ts Y a MUST_AI en limiter-coverage.test.ts; y validar body con `safeParse` + 400 amable — el error handler global responde 500 con el dump crudo de ZodError si se usa `.parse`.

## Convención de índices en schemas de lib/db

Los schemas de `lib/db/src/schema/*.ts` definen índices con la forma OBJETO
en el tercer argumento de `pgTable` — `(t) => ({ byX: index("...").on(t.x) })`
— no con la forma ARRAY (`(table) => [index(...)]`) que también circula en
ejemplos más nuevos de drizzle-orm. Confirmado mirando `attachments.ts` como
precedente antes de escribir un schema nuevo.

**Why:** consistencia dentro del repo; mezclar las dos formas entre
archivos de schema hace que se vea escrito por dos convenciones distintas
sin razón.

**How to apply:** al agregar un schema nuevo con índices, copiar la forma
objeto de un archivo existente (p. ej. `attachments.ts`) en vez de la forma
array de la documentación genérica de drizzle-orm.
