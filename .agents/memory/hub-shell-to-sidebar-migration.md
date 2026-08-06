---
name: Hub Ejecutivo → páginas del sidebar
description: Cómo quedó la arquitectura tras migrar el shell interno /ejecutivo a 13 rutas propias en el sidebar principal; qué mirar antes de tocar cualquier pantalla del Hub.
---

# Hub Ejecutivo → páginas del sidebar

El shell viejo (`/ejecutivo`, un SPA-dentro-del-SPA con tabs por estado local) se eliminó. Cada tab pasó a ser una ruta de nivel superior (`/dashboard-ejecutivo`, `/torre-ceo`, `/proyectos`, `/clientes`, `/reuniones`, `/notas`, `/contratos`, `/ventas`, `/cobros`, `/servicios`, `/equipo-hoy`, `/asistencia`, `/drive-hub`), cada una envuelta en el `Layout` principal. La lógica compartida (tipos, helpers, `useHubBoard`, vistas) sigue viviendo bajo `pages/hub/`; las 13 páginas son wrappers delgados.

**Visibilidad = `lib/roles` directamente.** El array de nav en `layout.tsx` no tiene su propia lista de permisos: cada item se muestra si `canAccessRoute(rol, ruta)` es true. No hay que sincronizar dos listas — solo tocar `lib/roles` cambia qué ve cada rol, y `roles.test.ts` ya tiene un describe block ("el Hub Ejecutivo ahora vive en páginas propias del sidebar") que fija la matriz esperada por rol.

**Acceso a la ruta ≠ identidad del contenido.** `/torre-ceo` es alcanzable por `ceo` Y `tester` (routes: "*" para ambos), pero el panel real solo se renderiza si el rol es específicamente "ceo"; tester ve un estado restringido dentro de la misma ruta. Este patrón (ruta abierta, contenido con gate propio) puede repetirse en otras páginas — no asumir que "está en el sidebar" implica "el contenido se muestra".

**Navegación cruzada con hoja destino:** `navigateToTab(tab, sheetToOpen?)` en `use-hub-board.ts` decide si el tab pedido es la página actual (abre la hoja localmente) o otra página (usa `TAB_ROUTES[tab]` + `setLocation` con `?open=<json codificado>`); un `useEffect` de solo-montaje consume y limpia `?open=` una vez para que un refresh no reabra la hoja.

**Fullscreen de tableros:** se logra con `<Layout chromeHidden={bool}>`, que oculta sidebar/header/nav — no es un shell aparte ni una ruta distinta.

**Al migrar un shell de tabs internos a rutas propias:** grepear constantes/localStorage keys del shell viejo (ej. una clave tipo "última tab abierta") — sobreviven como exports sin uso si nadie las borra explícitamente, porque el nuevo modelo de rutas no las necesita (la URL ya es el estado).

**Why:** esta migración tocó 13 páginas nuevas + el sidebar + el Kanban fullscreen a la vez; sin este resumen, cualquier cambio futuro a una página del Hub obliga a releer toda esa cadena de archivos para entender por qué no hay un "shell" ni una lista de permisos aparte.

**How to apply:** antes de agregar una página nueva al Hub, cambiar quién ve cuál, o tocar la navegación entre tabs/hojas del Hub.
