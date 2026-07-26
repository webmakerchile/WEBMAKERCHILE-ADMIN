---
name: Prod build skew
description: Primer sospechoso cuando el usuario reporta bloqueos o permisos rotos en la app publicada
---
El usuario prueba únicamente en la app publicada; los cambios en dev son invisibles hasta Publicar.

**Regla:** ante un reporte de "la app no deja hacer X" (permisos denegados, features que faltan), comparar primero la fecha del último Publish con la fecha del código que habilita X, antes de asumir bug.

**Why:** el rol ventas apareció "bloqueado" para crear contratos aunque el código dev ya lo permitía: producción corría un build anterior al sistema de roles (julio 2026). El fix fue publicar, no tocar código.

**How to apply:** (1) confirmar que la feature existe en el código actual; (2) revisar los datos del usuario afectado en la DB de prod (read-only); (3) si el código lo permite y prod lo niega, la causa probable es build viejo → publicar.
