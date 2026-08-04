---
name: Subagents que exceden el timeout del notebook
description: Cómo recolectar un subagente (p. ej. code-review) cuando el await del notebook expira, sin tragarse el resultado de un job viejo.
---

# Subagents que exceden el timeout del notebook

Si `await subagent(...)` expira con "Timed out waiting for assignment `<name>:<id>` … still running", recolectar con `waitForJob({ jobId: "<name>:<id>" })` usando **ese id literal del mensaje de timeout**, no una variable del bloque que falló: si el bloque anterior lanzó, sus variables pueden resolver a otro job histórico con el mismo nombre base (p. ej. un `code-review` de una sesión anterior) y `waitForJob` devuelve ese informe viejo sin error.

**Why:** un informe de review de OTRO diff se leyó como si fuera el actual; hablaba de archivos que no estaban en el cambio. El nombre base repetido ("code-review") se auto-renombra ("code-review-347a") pero los jobs viejos siguen recolectables.

**How to apply:** tras cualquier timeout de subagente, (1) usar el id del mensaje de timeout, y (2) antes de actuar sobre un informe, verificar que hable del diff/archivos de ESTA tarea; si describe otro trabajo, es un job equivocado.
