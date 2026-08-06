---
name: Series de Proyecciones — convenciones al agregar una nueva
description: Cómo bucketear por periodo sin romper el borde de mes/semana, y qué significa completedAt en hub_tasks, al sumar una serie a lib/proyecciones.ts
---

## Bucketear timestamps crudos por mes: usar `periodKey`, no slice de ISO
Las series existentes (ventas, cobros) agrupan por mes cortando un STRING de fecha ya guardado tal cual ("YYYY-MM-DD"), lo que es seguro porque ese string ya es la fecha local que importa. Pero un campo `timestamp with time zone` crudo (ej. `completedAt`) NO se puede cortar así: `date.toISOString().slice(0,7)` da el mes en UTC, que cerca de fin de mes puede diferir del mes real en Chile.
**Why:** `lib/periods.ts` ya resuelve esto (`periodKey("mensual", date)`, vía `Intl.DateTimeFormat` con `America/Santiago`) porque una meta/tarea "de este mes" tiene que significar lo mismo para el servidor que para el equipo.
**How to apply:** cualquier serie nueva en `lib/proyecciones.ts` que bucketee un `timestamp` crudo (no un string de fecha ya calculado) debe pasar por `periodKey("mensual", fecha)`, igual que `serieProduccion`.

## `hub_tasks.completedAt` está en espejo con `stage`, no es "primera vez que se completó"
El servidor lo fija a `now()` al ENTRAR a stage "done" y lo vuelve a `null` al SALIR de "done" (reabrir una tarea la limpia). Por eso `completedAt IS NOT NULL` equivale siempre a "stage = done ahora mismo", nunca a un historial de completados-alguna-vez.
**Why:** evita que una tarea reabierta y vuelta a cerrar cuente producción "fantasma" de un cierre viejo; el conteo mensual siempre refleja lo que sigue entregado hoy.
**How to apply:** para filtrar/contar tareas "listas" basta `WHERE completed_at IS NOT NULL` (no hace falta además filtrar por `stage`); no asumir que el valor es la fecha del primer cierre histórico.
