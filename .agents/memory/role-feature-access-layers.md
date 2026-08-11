---
name: Capas independientes de acceso a una feature
description: Dar acceso a un rol nuevo tiene varias capas independientes que no se auto-derivan entre sí; falta una y queda un hueco real, no solo un detalle cosmético.
---

# Dar acceso a un rol nuevo no es una sola capa

Un rol puede tener la ruta en su menú y aun así no tener acceso real, o tenerlo de más. La navegación (qué ve un rol), la autorización de backend (qué le deja hacer el servidor) y cualquier límite de costo/uso (p. ej. cuotas de IA) suelen vivir en sitios distintos, mantenidos a mano, y ninguno se actualiza solo cuando cambia otro.

Un caso particular y fácil de pasar por alto: si un endpoint es compartido por varias features/productos (una misma lista o un mismo "obtener/borrar por id" que sirve filas de más de uno), autorizar por ruta o por sección NO alcanza — el servidor también debe revisar de qué feature es cada fila antes de servirla o borrarla. Un rol al que se le abrió una sola de esas features puede terminar leyendo o borrando datos de la otra simplemente porque comparten el mismo endpoint.

**Why:** cada una de estas capas falló de forma independiente y silenciosa en rollouts reales: el menú aparecía pero el backend seguía rechazando todas las llamadas; una acción nueva de IA quedó sin límite de costo porque nada la vinculaba automáticamente al resto; y un endpoint compartido siguió sirviendo contenido de la feature que debía quedar excluida porque el control era solo por ruta, no por fila. En los tres casos, typecheck y la suite de tests existente seguían en verde — nada de eso lo detecta solo.

**How to apply:** al abrir una feature existente a un rol nuevo, probar de punta a punta con una cuenta real de ese rol (no solo mirar si el menú aparece), revisar cualquier límite de costo/uso asociado, y si el endpoint es compartido entre features, probar explícitamente que el rol nuevo NO puede leer ni borrar contenido de la otra feature a través de ese mismo endpoint.

## Ampliar hubScopes/hubWrite de un rol: correr la suite COMPLETA, no solo roles.test.ts

`hubScopesFor`/`hubWriteScopesFor` (lib/roles) los consultan rutas que no tienen nada que ver entre sí a simple vista: GET /hub/owner (forma exacta de las claves que devuelve), POST /hub/tasks y /hub/tasks/batch, POST /tickets/:id/to-task (convertir ticket en tarea). Cada una tiene un test que hardcodea el array de scopes o el status code esperado PARA ESE ROL puntual. Correr solo el archivo de test obviamente relacionado con el cambio (p. ej. roles.test.ts) deja pasar tests rotos en archivos cuyo nombre no menciona "roles" ni "permisos".

**Why:** no son tests frágiles ni ruido — antes del fix, codificaban a propósito el comportamiento (restrictivo) que la tarea pedía cambiar, así que quedan desactualizados EN CUANTO el fix es correcto. Ignorarlos porque "no son el archivo que toqué" deja la suite roja o, peor, invita a debilitar el test en vez de corregir la aserción.

**How to apply:** tras cualquier cambio a `ROLES[...].hubScopes`/`hubWrite` en `lib/roles/src/index.ts`, correr `vitest run` completo en `api-server` (no un archivo suelto), y actualizar cada aserción que ahora refleje a propósito el comportamiento viejo — es parte de terminar el cambio, no un follow-up aparte.

## Un endpoint solo-rol devuelve `{error}` en 403: si el consumidor asume arreglo, tumba TODA la página

Un endpoint gateado por rol (patrón `router.use("/recurso", soloDireccion)`) responde 403 `{ error: "..." }` a cualquier rol sin acceso. Si el componente que lo consume hace `await res.json()` y lo usa directo como arreglo (`for...of`, `.map`, `.filter`) sin chequear `res.ok`/`Array.isArray`, ese objeto de error rompe el render con un `TypeError: X is not iterable`. Como casi ninguna sección tiene su propio error boundary local, el `RouteErrorBoundary` de la ruta entera lo atrapa — la página COMPLETA se cae ("Algo salió mal") para cualquier rol sin acceso a esa sección puntual, no solo esa sección. Se vio en vivo: `/cuentas` reventaba para todo rol que no fuera CEO/superadmin por culpa de una sola sub-sección (`CredencialesSection` ← `GET /credentials`, solo-dirección).

**Why:** el rol tester (u otros roles no-CEO) SÍ tiene la ruta en su menú (`canAccessRoute` los deja entrar a `/cuentas`), así que el problema es invisible mirando solo la navegación o probando como CEO/superadmin — solo aparece probando con una cuenta del rol restringido real, y usualmente ni typecheck ni la suite existente lo detectan (el tipo declarado, p. ej. `CredStatus[]`, es una promesa de TypeScript sobre datos externos, no una garantía en runtime).

**How to apply:** cualquier componente que hace fetch de un recurso con gate de rol en el backend debe: (1) reflejar la misma regla en el frontend (no renderizar/fetchear la sección si el usuario no califica, así se evita el 403 de entrada), y (2) igual validar la forma de la respuesta (`Array.isArray`/chequeo de shape) antes de usarla, como red de seguridad ante cualquier 403/500/error inesperado. Al auditar, buscar tanto gates "de bloque" (`router.use(path, gateFn)`) como gates inline dentro de cada handler.

## Mover un gate de "lista fija de roles" a Permisos: el wildcard "*" salta cualquier exclusión puntual

Los roles con acceso total resuelven a rutas `"*"` sin pasar por el catálogo de secciones configurables. Si una lista fija de roles permitidos excluía a propósito a uno de esos roles wildcard, migrar el gate a "seguir Permisos por rol" reintroduce ese acceso: cualquier chequeo tipo `rutasDelRol.includes(path)` da `true` cuando `rutasDelRol` es `"*"`, sin importar qué exclusión puntual existía antes. Typecheck y una migración "mecánica" no lo detectan.

**Why:** un rol wildcard puede tener acceso total al resto del panel y aun así estar excluido a propósito de UNA feature puntual (p. ej. una cuenta de revisión externa, excluida solo de pantallas con datos reales de un tercero). Esa exclusión vive fuera del sistema de permisos configurable, así que migrar el gate a ese sistema la borra en silencio salvo que se recree aparte.

**How to apply:** al migrar cualquier gate de "lista fija de roles" a Permisos por rol, primero anotar qué roles wildcard la lista fija excluía a propósito. Si excluía alguno, agregar un carve-out explícito además del chequeo de rutas (no dentro del catálogo genérico de secciones) y probarlo en vivo con ese rol puntual.

## Un gate compartido por varias pantallas no debe aceptar "alcanza con cualquiera de los permisos"

Cuando dos pantallas antes independientes pasan a compartir UN solo punto de aplicación (un middleware, un proxy genérico) pero cada una tiene su propio permiso configurable, gatear ese punto único con "el rol tiene el permiso A O el permiso B" es más permisivo que las dos pantallas por separado: un rol con solo el permiso A queda con acceso de lectura/escritura a los datos exclusivos de B con solo llamar al endpoint compartido directamente (curl/devtools), sin pasar por la UI que sí respeta el gate por pantalla. Un test que solo verifica "A solo → pasa" y "B solo → pasa" no lo detecta; hace falta el test cruzado ("A solo → falla contra un recurso exclusivo de B").

**Why:** el punto de aplicación compartido no sabe, por sí mismo, a qué pantalla pertenece cada sub-recurso que atraviesa — por eso es tentador gatear por "cualquiera de los permisos alcanza". Pero eso colapsa dos permisos pensados como independientes en uno solo, exactamente lo que la separación en permisos por pantalla buscaba evitar.

**How to apply:** clasificar los sub-recursos del punto compartido por a qué pantalla pertenecen (revisando qué llama cada pantalla realmente, no por intuición de nombres) y exigir el permiso específico de cada uno; declarar aparte, explícitamente, los sub-recursos genuinamente compartidos (alcanza con cualquiera de los permisos); y para cualquier sub-recurso todavía sin clasificar, exigir TODOS los permisos relevantes (fail-closed) en vez de cualquiera — nunca al revés. Escribir el test cruzado explícitamente: cada permiso por separado debe fallar contra los recursos exclusivos del otro.
