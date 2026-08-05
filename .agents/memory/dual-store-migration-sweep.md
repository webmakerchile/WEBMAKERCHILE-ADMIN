---
name: Migraciones que dejan un escritor viejo vivo
description: Cuando una entidad tiene dos almacenes (tabla real + blob JSONB viejo), migrar los datos históricos no basta — hay que barrer TODOS los que escriben, no solo confirmar que la lectura ya usa el nuevo.
---

# Migraciones que dejan un escritor viejo vivo

**Regla:** al mover una entidad de un blob JSONB a una tabla real, buscar TODOS los endpoints que crean/escriben esa entidad (no solo los que la leen) antes de dar la migración por completa. Un grep de la función de escritura vieja (ej. saveBoard/resolveBoard) filtrado al campo específico (ej. `.tasks`) revela escritores huérfanos.

**Why:** la conversión de ticket a tarea seguía insertando en el blob `hub_state.data.tasks` mucho después de que `hub_tasks` (tabla real) se volviera la única fuente que lee el tablero Scrum — la tarea se creaba "bien" (sin error) pero quedaba invisible para siempre. El síntoma reportado ("no aparece en mi tabla de scrum") no tenía nada que ver con filtros de área; era un endpoint que nadie actualizó tras la migración.

**How to apply:** ante cualquier reporte de "esto se guardó pero no aparece" en una entidad que alguna vez vivió en el blob del Hub (tareas, y potencialmente otras si se migran a futuro), sospechar primero un escritor no migrado antes de revisar filtros/roles. Verificar con grep de la función de escritura vieja + el nombre del campo específico; no basta con confirmar que la vista principal ya lee de la tabla nueva.
