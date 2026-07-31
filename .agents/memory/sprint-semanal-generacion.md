---
name: Cierre semanal y generación única por periodo
description: Patrones del sprint semanal del Hub — cierre foto+arrastre idempotente sin transacción, y generación 1×/semana con candado advisory dentro de transacción.
---

## Cierre de periodo: foto primero, arrastre después, todo re-ejecutable
Regla: la foto por persona va en UN insert multi-fila con ON CONFLICT DO NOTHING; el arrastre es un UPDATE condicional que corre SIEMPRE sobre toda semana vencida (no solo las recién fotografiadas).
**Why:** un revisor pidió transacción+candado por "pérdida de snapshot"; el análisis mostró que la única pérdida real exigiría un insert parcial, y Postgres no produce inserts parciales en una sentencia — DO NOTHING solo salta filas ya existentes. Un proceso caído entre foto y arrastre se completa solo en el próximo tick.
**How to apply:** en procesos periódicos tipo "cerrar periodo", diseñar cada paso atómico e idempotente y en ese orden; no agregar transacciones/candados que compliquen los tests si la sentencia ya es atómica.

## Generación cara 1×/periodo (plan de contenido IA)
Regla: gate barato de existencia ANTES del LLM (409 rápido); la llamada al LLM queda FUERA de la transacción; después `db.transaction` con `pg_advisory_xact_lock(hashtext(clave-periodo))` + re-chequeo de existencia dentro del candado (el perdedor de la carrera recibe 409) + inserts y enlaces dentro de la misma tx.
**Why:** dos clics dentro de la latencia del LLM (~30 s) duplicaban el plan de todo el equipo; el xact lock se libera solo al commit y evita el clásico bug de advisory locks de sesión con pool de conexiones.
**How to apply:** cualquier "generar una vez por semana/mes" costoso. Los pares enlazados (redes ↔ edición) van como UN insert de dos filas + updates de enlace en la misma tx: si algo falla a mitad, no quedan mitades huérfanas que además bloquean el reintento vía dedupe.

## Página compartida con tablero de área
Regla: en páginas usadas por roles sin acceso al tablero /hub (social/editora/rrhh en mis-tareas), el fetch del tablero es "mejor esfuerzo": su 403 no debe tumbar la página; fatal solo el fetch principal de la página.
**Why:** el gate por área corre antes que los routers montados (ver hub-area-gates), así que roles nuevos en una página vieja reciben 403 en fetches secundarios.
