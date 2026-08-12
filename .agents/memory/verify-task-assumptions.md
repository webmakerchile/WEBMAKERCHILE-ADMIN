---
name: Verificar afirmaciones de "ya existe pero no se usa"
description: Un plan puede asumir que un sistema viejo no tiene UI activa; confirmarlo con grep/lectura completa de las páginas reales, no de oídas.
---

# Verificar afirmaciones de "ya existe pero no se usa"

Un plan de tarea puede describir un sistema existente como "no usado en
ninguna pantalla" para justificar reemplazarlo sin miedo a romper algo. Esa
afirmación puede estar desactualizada o ser parcialmente falsa: el sistema
puede seguir teniendo un consumidor real en una página que nadie mencionó.

**Why:** en el tablero de Ideas de equipo, el plan decía que el sistema
viejo de "ideas" privadas por usuario no tenía pantalla. Una lectura
completa del Dashboard encontró un widget kanban vivo y renderizado
(`IdeasKanban`) consumiendo esa misma API vieja — de haber confiado en la
afirmación del plan, el Dashboard habría quedado roto (llamando a
columnas/tabla que ya no existen) después de reescribir el esquema.

**How to apply:** antes de reescribir o eliminar cualquier tabla/endpoint
que un plan describe como "sin usar", correr un grep del nombre del
recurso (tabla, query key, endpoint) sobre las páginas del frontend
(`.tsx`), no solo sobre el router/schema del backend. Si aparece un
consumidor real, decidir explícitamente si se actualiza o se elimina junto
con el resto del cambio — no asumir que el plan ya lo consideró.
