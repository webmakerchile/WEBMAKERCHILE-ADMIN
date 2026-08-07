---
name: Sync del tablero Hub (freshness)
description: Cómo se agregó refresco en vivo (polling + foco) a una página del Hub sin afectar las otras 12 que comparten el mismo hook; y un artefacto de entorno dev que puede simular un "bug de sync" que no existe en producción.
---

## Patrón: refresco en vivo por-pestaña en un hook compartido

`use-hub-board.ts` es un solo hook usado por las 13 páginas del Hub, parametrizado por `currentTab`. Para dar refresco en vivo (poll cada ~15s + refetch al recuperar el foco de la pestaña) a UNA sola página sin tocar el comportamiento de las otras 12:

- Gatear `refetchInterval`/`refetchOnWindowFocus` de la query de React Query con `currentTab === "<tab>" ? valor : false/default`.
- Si además hay un blob local (`pull()` en un `useEffect` con `setInterval`), gatear el intervalo corto y los listeners de `visibilitychange`/`focus` de la misma forma, con un cooldown (~5s) para no ráfaguear si ambos mecanismos coinciden.
- Incluir `currentTab` en el array de dependencias del efecto.

**Por qué:** el hook es compartido; cualquier cambio sin el gate por tab afecta silenciosamente a las otras 12 páginas (o exige tocar 12 lugares para dar opt-out). Gatear por `currentTab` mantiene el resto del Hub bit-a-bit igual.

**Cómo aplicar:** cuando una página del Hub necesite comportamiento propio (polling, atajos de teclado, layout distinto) dentro de un hook/componente compartido, buscar primero si ya existe un parámetro tipo `currentTab`/`activeTab` para gatear por ahí antes de bifurcar el hook.

## Artefacto de entorno dev: `resolveBoard()` puede devolver data:null

`resolveBoard()` (en `hub-board.ts`) resuelve "cuál fila de `hub_state` es el tablero" así: fila del CEO/superadmin si tiene contenido → si no, cualquier fila con contenido (adopción legado) → si no, la fila del CEO aunque esté vacía (`exists: !!ownRow`) → si NO HAY ningún CEO/superadmin en `users` **y** ninguna fila tiene contenido, devuelve `null` y el GET `/hub` responde `data: null`.

Esa última rama solo se alcanza si la base de dev no tiene NINGÚN usuario con `team_role='ceo'` (o `role='superadmin'`) — algo que no pasa en producción (siempre hay un CEO real que ya guardó algo alguna vez). Si estás probando sync/concurrencia del tablero en dev con usuarios sintéticos y vacías la única colección con contenido (ej. borras el último proyecto), vas a ver `data:null` y la UI se queda con el último estado conocido (correcto: `adoptServerData` ignora `data:null` a propósito) — esto **parece** un bug de sync pero es solo que no hay CEO en esa base de dev.

**Por qué:** `adoptServerData` ignora `data:null` a propósito (para no borrar la UI ante un hipo del servidor), así que el síntoma es "el cambio de otro usuario no llega nunca", indistinguible a simple vista de un bug real de sync.

**Cómo aplicar:** antes de probar en dev escenarios que vacíen todas las colecciones del blob (`projects`/`contracts`/`clients`/`meetings`/`notes`), asegurate de que exista al menos un usuario `team_role='ceo'` (o `role='superadmin'`) CON una fila en `hub_state` (aunque sea `{}`) — eso ancla `exists:true` para siempre, igual que en producción.
