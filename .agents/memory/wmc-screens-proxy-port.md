---
name: Portar pantallas externas vía proxy (WMC)
description: Lecciones al portar pantallas de un panel hermano (webmakerlatam.com) manteniendo el origen como dueño de datos/lógica, vía un proxy de servicio genérico.
---

# Portar pantallas externas vía proxy de servicio

Distinto de [panel-agencia-espejo](panel-agencia-espejo.md): eso es una sincronización/espejo de datos con saneo local. Esto es un passthrough en vivo (sin tablas locales, sin recalcular nada) gateado por allowlist de email server-side. No confundir ni reusar el mecanismo de uno para el otro.

- **El manifiesto de un bundle exportado puede estar incompleto.** Grepear los imports reales de los archivos copiados (sobre todo `components/ui/*`) y diferenciar contra lo que el manifiesto declaraba.
  **Por qué:** el manifiesto se arma a mano/heurísticamente al exportar, no se deriva del grafo de imports real — encontramos un componente de UI usado que nunca apareció listado.
  **Cómo aplicar:** tras copiar según el manifiesto, correr un grep de imports de UI sobre TODOS los archivos copiados y agregar lo que falte antes de dar por completo el port.

- **El schema drizzle/zod de un bundle exportado no es portable tal cual cuando el destino no debe poseer esas tablas.** Si el origen sigue siendo dueño de los datos, no importar el `shared/schema.ts` original — reescribir a mano como interfaces TS planas en un `shared-*` propio.
  **Por qué:** importar el schema real tienta a reintroducir tablas/migraciones locales que duplican al origen.
  **Cómo aplicar:** confirmar con grep que el `shared-*` nuevo no importa `drizzle-orm` ni `drizzle-zod`.

- **Centralizar el rewrite de prefijo en un solo módulo de query-client no basta.** Barrer también `fetch`/`window.open`/hrefs directos dentro de las páginas portadas — esas llamadas no pasan por el cliente central y se quedan apuntando al prefijo/origen viejo si no se revisan una por una.
  **Por qué:** subidas multipart, descargas y links a tokens suelen construirse ad hoc, fuera del wrapper compartido (ver también upload-endpoints-convention.md).
  **Cómo aplicar:** grep de `fetch(`/`window.open(` en cada archivo portado, no confiar en que "todo pasa por apiRequest".

- **Un `use-toast` duplicado (módulo propio, no compartido con el resto de la app) necesita su propio `<Toaster/>` montado en el árbol.** El patrón shadcn usa un store a nivel de módulo; dos instancias de módulo = dos stores independientes aunque el código se vea idéntico.
  **Cómo aplicar:** si se duplica `use-toast.ts`, duplicar también `toaster.tsx` apuntando a ESE hook y montarlo junto al `Toaster` existente.

- **Un helper de acceso deny-by-default por rol (tipo `canAccessRoute`) no cubre solo una regla de acceso nueva y transversal (allowlist de un email para una sola feature).** No forzar un email suelto dentro de la tabla de roles — construir un shell/gate propio y explícito, independiente del sistema de roles (ej. `user.wmcAccess` booleano dedicado).
  **Por qué:** mezclar un allowlist de email con el enum de roles ensucia el modelo de roles por algo que no es un rol.

- Ver también [query-client-context-shadowing.md](query-client-context-shadowing.md) — el bug más caro de esta sesión: páginas portadas asumiendo el default `queryFn` del queryClient del ORIGEN, corriendo en realidad bajo el `QueryClientProvider` ambiental del destino.

- **Cuando el passthrough devuelve datos vacíos, probar 4 variantes del mismo path antes de sospechar de la credencial: llave real, llave inventada, sin header de llave, y hasta un path que no existe.** Si las 4 devuelven una respuesta byte-idéntica (mismo status, mismo content-type, mismo tamaño), el endpoint de servicio no está montado en el host en vivo del origen — no es un problema de llave vencida/cruzada ni de permisos.
  **Por qué:** un origen que sirve una SPA con catch-all responde 200 con el `index.html` público para CUALQUIER ruta que su backend no reconozca todavía, key válida o no. Eso "parece" una respuesta normal (status 200) pero en realidad dice "esta ruta no existe en el build publicado aquí".
  **Cómo aplicar:** ante un passthrough vacío, no asumas 200 = éxito — compará `content-type`/bytes de la respuesta, no solo el status.

- **Ese síntoma (4 variantes byte-idénticas) tiene DOS causas distintas del lado del origen, no una — publicar no arregla la segunda.** (1) las rutas de servicio existen en el código del origen pero ese código nunca se publicó/deployó — publicar lo resuelve; (2) las rutas SÍ están en el build en vivo (confirmable comparando el hash de sus JS/CSS antes/después de publicar) pero el router de servicio se montó en el Express del origen DESPUÉS del catch-all de la SPA, o nunca se montó — publicar de nuevo NO cambia nada porque el bug es de orden/registro de rutas, no de deploy pendiente. Confirmamos ambos casos en la misma sesión: publicar no alteró el síntoma, así que era la causa (2), un bug de código en el proyecto origen (fuera de este repo).
  **Cómo aplicar:** si tras publicar el origen el síntoma persiste idéntico, dejar de sospechar "falta publicar" y comunicar que es un bug de montaje de rutas que solo se arregla en el código del proyecto origen.

- **Para confirmar que un fix de "ruta no montada" en el origen realmente se aplicó, no basta con ver que la llave real ahora devuelve JSON — hay que confirmar también que la llave inválida/ausente ahora es RECHAZADA (401), no solo que "algo" responde 200.** Antes del fix, las 4 variantes (real/inventada/sin llave/ruta inexistente) daban la MISMA respuesta 200-HTML porque ninguna llegaba al router real. Si tras un fix la llave real da JSON pero una llave inventada también sigue dando 200 (aunque sea JSON), el router de servicio real todavía no está protegiendo esa ruta — podría ser un router distinto/de prueba. Ver el rechazo 401 específico para llave inválida y para llave ausente (con mensajes de error distintos) es la señal de que es el router real, autenticado, el que está respondiendo.
  **Por qué:** en esta sesión el fix del origen se confirmó así: llave real → 200 JSON con datos reales; llave inventada → 401 `{"error":"Unauthorized"}`; sin llave → 401 `{"error":"Missing X-Service-Key header"}`. Los tres resultados distintos, coherentes con lo que se espera de un router autenticado real, fue lo que dio certeza (no solo "ya veo datos").
