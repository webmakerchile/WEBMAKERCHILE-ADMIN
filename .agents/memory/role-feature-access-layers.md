---
name: Capas independientes de acceso a una feature
description: Dar acceso a un rol nuevo tiene varias capas independientes que no se auto-derivan entre sí; falta una y queda un hueco real, no solo un detalle cosmético.
---

# Dar acceso a un rol nuevo no es una sola capa

Un rol puede tener la ruta en su menú y aun así no tener acceso real, o tenerlo de más. La navegación (qué ve un rol), la autorización de backend (qué le deja hacer el servidor) y cualquier límite de costo/uso (p. ej. cuotas de IA) suelen vivir en sitios distintos, mantenidos a mano, y ninguno se actualiza solo cuando cambia otro.

Un caso particular y fácil de pasar por alto: si un endpoint es compartido por varias features/productos (una misma lista o un mismo "obtener/borrar por id" que sirve filas de más de uno), autorizar por ruta o por sección NO alcanza — el servidor también debe revisar de qué feature es cada fila antes de servirla o borrarla. Un rol al que se le abrió una sola de esas features puede terminar leyendo o borrando datos de la otra simplemente porque comparten el mismo endpoint.

**Why:** cada una de estas capas falló de forma independiente y silenciosa en rollouts reales: el menú aparecía pero el backend seguía rechazando todas las llamadas; una acción nueva de IA quedó sin límite de costo porque nada la vinculaba automáticamente al resto; y un endpoint compartido siguió sirviendo contenido de la feature que debía quedar excluida porque el control era solo por ruta, no por fila. En los tres casos, typecheck y la suite de tests existente seguían en verde — nada de eso lo detecta solo.

**How to apply:** al abrir una feature existente a un rol nuevo, probar de punta a punta con una cuenta real de ese rol (no solo mirar si el menú aparece), revisar cualquier límite de costo/uso asociado, y si el endpoint es compartido entre features, probar explícitamente que el rol nuevo NO puede leer ni borrar contenido de la otra feature a través de ese mismo endpoint.
