---
name: Spinner negro persistente tras varias ediciones seguidas de frontend
description: Cómo distinguir una regresión real de un artefacto transitorio del HMR de Vite cuando se prueba una ruta justo después de editar varios archivos frontend.
---

# Spinner negro persistente tras varias ediciones seguidas de frontend

Si un tester (o una captura) reporta una ruta que se queda en pantalla negra con solo un spinner (el fallback de `<Suspense>` de una página lazy-loaded en `App.tsx`, NO el spinner interno de una tarjeta), y esa ruta no fue tocada por los cambios recientes, sospechar primero de un artefacto transitorio del dev server antes de asumir una regresión real.

**Why:** editar archivos que exportan tanto un componente como un hook/contexto (p. ej. `App.tsx` con `useAuth`, `lib/lang.tsx` con `useLang`) hace que Vite no pueda hacer Fast Refresh ("... export is incompatible") y fuerza un `page reload` completo. Varias ediciones seguidas en poco tiempo pueden dejar el árbol de módulos del cliente en un estado a medio recargar; si justo en ese momento se navega (client-side) a una ruta lazy que el tab todavía no había importado en esa sesión, el `import()` dinámico puede quedar colgado sin lanzar ningún error a consola.

**How to apply:** antes de reportar una ruta como rota, reintentar con una recarga completa (navegar a otra ruta y volver, o recargar duro) una vez que ya no haya ediciones de archivos en curso. Si carga bien de forma consistente (2-3 intentos), fue flaky — no crear una tarea ni seguir depurando el código de esa ruta.
