---
name: Gates de /hub — área vs rol
description: Por qué abrir un endpoint por rol puede no bastar - el gate por área corre antes; cómo eximir paths y qué NO cubren los tests unitarios de router.
---

# Dos vocabularios de permisos conviven

- **Áreas** (`requireArea`, mapeo rol→área en lib/areas): gatean *familias* de endpoints en `routes/index.ts`.
- **Roles** (`hubScopesFor`/`hubWriteScopesFor` en lib/roles): control fino por colección/endpoint dentro de los routers.

**Regla:** al abrir un endpoint "por rol", verificar SIEMPRE qué middleware por área corre antes en `routes/index.ts`. `router.use("/hub", areaGate)` aplica a TODO `/hub/*` sin importar que el router específico esté montado después — el orden de montaje de routers NO evita un middleware ya registrado para el prefijo.

**Why:** al abrir la creación de tareas a marketing vía `hubWriteScopesFor`, tsc + 550 tests pasaron y el smoke como tester funcionó, pero marketing seguía bloqueado: su área no está en `requireArea("ceo","ejecutivo","rrhh")` y moría antes de llegar al router. Lo cazó la revisión de arquitecto, no los tests — los tests unitarios montan el router directo y **no ven los middlewares de `routes/index.ts`**.

**How to apply:**
- Mecanismo sancionado para eximir paths de `/hub` del gate por área: `HUB_ROLE_GATED_PATHS` / `hubNeedsAreaGate` en `lib/hub-gate.ts` (los paths llegan relativos al mount: `/tasks/12`, no `/hub/tasks/12`). `/`, `/owner` y `/tasks*` ya están exentos; el router de tareas se autoguarda por endpoint.
- Si un router queda exento, auditar TODOS sus endpoints por gates internos (a tareas le faltaba gate en team-members).
- Documentar el prefijo en `AREA_API_PREFIXES` (lib/areas, constante doc/test) y cubrir la exención en `hub-gate.test.ts` + `areas-consistency.test.ts`.
- El smoke con tester no prueba gates por área (tester pasa siempre); un 403 de área para otros roles solo se ve con tests del gate o cuenta real.
