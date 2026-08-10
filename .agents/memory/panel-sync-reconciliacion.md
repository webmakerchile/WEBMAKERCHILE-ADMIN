---
name: Reconciliación del espejo del panel WMC
description: Por qué el delta sync se queda obsoleto y cómo un full-snapshot resuelve staleness + huérfanos a la vez; dónde vive el dato "rico" que el bulk sync no trae; cómo verificar la premisa de un usuario sobre datos espejados.
---

## Delta sync con cursor ciego a la actualización que importa
Cuando el delta sync usa un cursor basado en un campo que no cambia con la actualización relevante (ej. `createdAt` en vez de `updatedAt`), los cambios posteriores a la creación del registro nunca vuelven a sincronizarse — la sync "funciona" (no tira error) pero congela el estado al momento de creación.

**Por qué:** un cursor por `createdAt` solo detecta ALTAS nuevas, no cambios de estado en registros ya sincronizados; y un delta sync nunca puede detectar BAJAS (el origen no manda "esto ya no existe", simplemente deja de listarlo).

**Cómo aplicar:** un job periódico de reconciliación por full-snapshot (ignorando el cursor, trayendo TODO, con paginación si el recurso viene truncado) que:
1. Upsertea todo lo recibido (autocura staleness de cualquier campo, no solo el que se sospechaba).
2. Borra localmente cualquier id que ya no aparezca en el pull fresco (resuelve huérfanos por borrado en el origen).
3. Se salta el borrado si el pull fresco de un recurso viene vacío (red flag de fallo parcial, no "borraron todo") — nunca vaciar una tabla local por una respuesta vacía sin confirmar que es real.

Reutilizar el scheduler existente (ej. un poll de 60s) con un umbral de "hace cuánto no reconciliamos" en vez de crear un cron nuevo.

## Bulk list vs. detail endpoint: no asumir paridad
En el panel WMC, los endpoints de LISTADO (`/tareas`, `/proyectos`) no necesariamente traen los mismos campos "ricos" que el endpoint de DETALLE por id (`/proyectos/:id` → `datos.avance`, `datos.cobranza`, etc.). Antes de concluir "esto no se puede calcular / el mirror no tiene el dato", probar el endpoint de detalle directo contra el origen — puede existir un campo ya calculado por el origen (ej. `avance.porcentaje`, con fórmula y explicación incluidas) que el bulk sync actual simplemente no está trayendo, en vez de asumir que hay que reinventar el cálculo o que es un "gap de paridad" sin solución.

## Verificar la premisa del usuario en dos capas, no una
Cuando el usuario reporta "el dato existe en el origen pero no en el mirror", no basta con mirar el DB local. Verificar en orden: (1) el DB del mirror crudo, (2) el endpoint del origen que alimenta esa vista específica, en vivo. Ejemplo real: el usuario asumía un campo de progreso premapeado; no existía como tal en ningún lado — el progreso es *calculado* con una fórmula documentada (peso de tareas completadas), y esa fórmula, corrida en vivo contra el origen para varios proyectos activos, dio 0% en TODOS — el mirror ya reflejaba fielmente la realidad del origen. El bug real vivía en un mismatch de mayúsculas/minúsculas del status (`DONE`/`COMPLETED` vs. el contrato real `pending|in_progress|completed`) más el cursor ciego descrito arriba — no en un campo faltante.

También: un diff sistemático (ids del pull fresco vs. ids locales) es más confiable que una lista de huérfanos armada a mano por el usuario — encontró huérfanos reales que el usuario no había listado y descartó uno que el usuario sí había listado (seguía existiendo en el origen).
