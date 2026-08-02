---
name: Arrays en sql`` de drizzle
description: Por qué `= ANY(${array}::text[])` genera SQL inválido en drizzle y cómo parametrizar listas.
---

# Arrays JS dentro de sql`` de drizzle

**Regla:** nunca interpolar un array JS directo en un fragmento sql`` esperando un array de Postgres. Drizzle expande el array en varios placeholders sueltos (`$2, $3, $4`), así que `campo = ANY(${arr}::text[])` produce SQL inválido que revienta 500 en runtime.

**Why:** un filtro de visibilidad con `ANY(${estados}::text[])` pasó tsc y 1500+ tests (la capa DB estaba mockeada) y recién explotó en e2e con `Failed query`.

**How to apply:** para listas de valores usar `IN (...)` construido con `sql.join(valores.map((v) => sql`${v}`), sql`, `)` — un placeholder por valor — o el helper `inArray()` de drizzle cuando se compara una columna real. Validar todo fragmento sql`` nuevo con una corrida directa contra la DB dev (script tsx) porque los tests con DB mockeada no detectan sintaxis inválida.
