---
name: "/mis-tareas" ya existe y es otra cosa
description: Trampa de nombres al agregar una función personal/privada nueva parecida a algo que ya existe; qué patrón seguir para que sea de verdad privada.
---

# "/mis-tareas" ya existe y es otra cosa

`/mis-tareas` es una ruta viva: envuelve el tablero Scrumban **compartido** del Hub (`hub_tasks`, vía `tareas-hub.ts`), gestionado por rol — NO una lista personal, aunque el nombre lo sugiera. Antes de construir algo que "suena" a una ruta existente, revisar qué tabla/hook la respalda de verdad (grep de la ruta en `App.tsx` / `layout.tsx` y el hook que usa) — el nombre nunca garantiza el alcance real.

**Why:** confundir ambas cosas habría significado tocar o migrar `hub_tasks` (rompiendo el Scrumban de dev, que además es la página de inicio del rol dev) para un requerimiento que pedía exactamente lo opuesto: privacidad estricta por usuario, sin excepción de rol ni siquiera para CEO.

**How to apply:** al recibir un pedido de función personal/privada nueva cuyo nombre natural podría chocar con una ruta existente, verificar primero qué hace hoy esa ruta antes de decidir si reusarla o crear una con nombre propio (p. ej. se creó "Mis pendientes" en vez de reusar "Mis tareas"). Patrón ya establecido en este código para lo genuinamente privado (sin excepción de rol):
- Tablas propias con `userId` obligatorio (FK a `users`, cascade delete) + índice por usuario.
- Router montado fuera de `/hub`, junto a otros self-service routers (`ideasRouter`, `jornadaRouter`), solo detrás de `requireAuth, requireApproved` — sin gate de área ni bypass de rol.
- Cada query filtra por `eq(tabla.userId, user.id)` sin excepción en ningún handler (mismo patrón que `ideas`, a diferencia de `hub_tasks` que sí tiene lógica ceo/ventas de "ver todo").
- La ruta se agrega a `COMMON_ROUTES` en `lib/roles` para que los 9 roles la vean automáticamente (ceo/tester ya cubiertos por su wildcard `"*"`).
