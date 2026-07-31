---
name: Navegación de tableros horizontales
description: Patrón board-nav (chips/flechas/fades/snap) para kanbans con scroll horizontal y sus trampas
---

# Tableros horizontales (kanban/scrumban)

- **Módulo compartido `board-nav` (admin-panel/components):** rail sticky de chips por etapa (+contador), flechas ‹ ›, fades laterales y scroll-snap móvil. Se monta SOBRE el contenedor de scroll existente vía callback-ref + `data-bnav-col` en columnas + clase `bnav-scroll`, sin reestructurar el DOM.
  **Why:** envolver/reemplazar el contenedor rompe el drag & drop nativo (HTML5) y los estilos por página (Tailwind en unas, CSS propio en el Hub).
  **How to apply:** cualquier tablero horizontal nuevo debe reusar este módulo, no reinventar indicadores. El rail solo se renderiza si hay overflow real.

- **Flechas por POSICIÓN, nunca por índice de columna.** Con overflow chico (p. ej. 73px), el borde de la "columna anterior/siguiente" queda fuera del rango de scroll: `scrollTo` se clava en el clamp del navegador y el clic no mueve nada (bug real encontrado en e2e).
  **How to apply:** siguiente = primer borde de columna a la derecha del scroll actual (min con maxScroll); anterior = último borde a la izquierda (max con 0).

- **Chip activo al final del scroll = última columna.** La regla "columna cuyo borde izquierdo esté más cerca" nunca marca la última si el overflow es menor que una columna; al llegar al tope derecho se fuerza activa la última.

- **Snap + drag:** `scroll-snap-type` solo en móvil/puntero grueso y se APAGA mientras hay arrastre (`data-dragging`), con auto-scroll manual en `onDragOver` cerca de los bordes (el nativo de contenedores internos es poco fiable).

- **Trampa de especificidad:** el Hub tiene un `::-webkit-scrollbar` global; la barra acentuada del tablero usa clase doblada (`.bnav-scroll.bnav-scroll`) para ganar el empate sin depender del orden de imports de CSS.
