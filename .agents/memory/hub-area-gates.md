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

## Frontend: la misma tensión, en la navegación entre el panel y el Hub

`App.tsx` tiene su propio par de guards compitiendo, en paralelo al backend:
- `AreaGuard`/`EjecutivoRoute` (usan `lib/areas`, el sistema viejo) envuelven las rutas por FUERA y, si no hay acceso, muestran un cartel visible `UnauthorizedPage` ("Acceso restringido").
- `RouteShell` (usa `lib/roles` vía `canAccessRoute`, el sistema nuevo) envuelve por DENTRO y redirige en silencio (`setLocation(home, {replace:true})`) a la home real del rol.

Como el guard viejo está por fuera, si su allowlist (`AREA_PAGES`) no cubre una ruta para el área de un rol, gana él: el usuario ve el cartel de acceso restringido y el guard nuevo (que redirigiría en silencio a su home real) nunca llega a correr.

**Trampa real encontrada:** los links "Volver al panel" dentro del Hub Ejecutivo (`ejecutivo.tsx`) apuntan siempre a `href="/"` fijo. Para roles cuya área no tiene "/" en `AREA_PAGES` (ej. dev/ventas, área "ejecutivo"), eso no lleva a su panel — cae en "Acceso restringido", cuyo propio botón de escape manda de vuelta a `/ejecutivo`. El usuario lo percibe como "no puedo salir del Hub, se bloquea". Fix correcto: resolver la home real del rol (la misma que ya calcula `roleHome`), no una ruta fija.

Además, las pestañas internas del Hub (`ejecutivo.tsx`, array `TABS`) deciden su visibilidad con booleanos escritos a mano (`isCeo`, `canManageSvc`, etc.) que nunca consultan `lib/roles` — pueden divergir del menú lateral general (`layout.tsx`, que sí usa `canAccessRoute`).

**Lección de método:** un explorer subagent afirmó que `EjecutivoRoute` bloqueaba a dev citando ese mismo código — el cálculo booleano estaba mal (confundió el valor de área "ejecutivo" con el nombre de rol "ejecutivo"). Antes de relayar al usuario un hallazgo de control de acceso basado en lógica condicional leída por un subagent (o por uno mismo), verificarlo en vivo (flip de rol real + login) cuando la conclusión vaya a moldear una decisión — la lógica multi-capa es fácil de calcular mal incluso leyendo el código correcto.
