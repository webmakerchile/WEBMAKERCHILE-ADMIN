---
name: Kit visual del Hub y rediseños de presentación
description: Dónde vive el kit hub-kit, y cómo auditar un rediseño "solo presentación" para que no rompa nada
---

# Kit visual (hub-kit) y rediseños de presentación

- **El kit existe:** `admin-panel/src/components/hub-kit.tsx` + `hub-kit.css` (SheetHeader, OptionCard, SectionHeader, EmptyState, StatusChip, SkeletonShimmer; clases `.hk-*` autocontenidas). Importable también en páginas Tailwind (mis-tareas, redes) porque trae su propio CSS namespaced — NO importa `ejecutivo.css` fuera del Hub.
  **How to apply:** cualquier retoque visual nuevo en el panel debe reusar estas piezas, no crear variantes ad-hoc.

- **Auditoría obligatoria tras un rediseño "solo presentación" de un subagente:** los subagentes de diseño sí derivan funcionalidad aunque se les prohíba: en este caso borraron un control funcional (✕ descartar propuestas IA), metieron CTAs con `document.querySelector(...).click()` y eliminaron ~40 reglas CSS todavía referenciadas (asistencia, wizard, subheads).
  **Why:** "compila y se ve bien en las pantallas tocadas" no cubre pantallas no visitadas (asistencia, paso 2 del wizard).
  **How to apply:** (1) revisar el diff con architect + includeGitDiff pidiendo caza de drift funcional; (2) auditar selectores: reglas `-` del diff CSS → ¿clase aún usada en TSX? → ¿selector exacto redefinido? → restaurar las huérfanas (el CSS del hub es una-regla-por-línea, `grep -F "selector{"` es fiable; ojo: chequear con selector EXACTO, `:hover` contiene la base y da falsos "ya definida"); (3) reemplazar dispatchers DOM por callbacks reales (ej. `handleNew` con sus chequeos de permiso).

- **Los CTAs de estados vacíos del Hub llaman `onNew` (prop desde el padre = `handleNew`),** que respeta tab activo y permisos. No volver a `querySelector('.hub-fab')`.

- **Las páginas del Hub (`proj-view.tsx`, `proyectos.tsx`, `global-search.tsx`, etc.) no usan primitivos shadcn genéricos (`components/ui/command.tsx`, `components/ui/popover.tsx`) ni clases Tailwind utilitarias en su markup — tienen su propio sistema visual a mano en `hub.css`** (`.tsearch`, `.sresults`/`.sr`, `.seg`, `<input>`/`<button>` planos con clases propias). Las páginas `wmc/*` sí usan un clon shadcn distinto (`components/wmc/ui/*`, ej. `ClientSearchSelect` en `proposal-builder.tsx`) para combobox — es OTRO sistema, no el del Hub.
  **Why:** si una tarea nueva del Hub menciona `command.tsx`/`popover.tsx`/un combobox de `wmc/*` como "archivo relevante", suele apuntar al PATRÓN DE INTERACCIÓN (buscar mientras se escribe, panel flotante), no a un mandato de importar ese componente tal cual — mezclarlo desentona (fuentes/colores/radios distintos) en una página sin ningún otro elemento shadcn.
  **How to apply:** para un control nuevo tipo combobox/dropdown en una página del Hub, construirlo a mano (clases nuevas en `hub.css`, siguiendo la paleta `--card1`/`--line`/`--orange2`/etc. ya definida ahí) usando `global-search.tsx` como plantilla estructural (input + panel absoluto con resultados), no los primitivos shadcn ni el clon de wmc.
