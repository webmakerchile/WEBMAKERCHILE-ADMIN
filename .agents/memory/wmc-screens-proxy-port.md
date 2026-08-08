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
  **Por qué:** un origen que sirve una SPA con catch-all responde 200 con el `index.html` público para CUALQUIER ruta que su backend no reconozca todavía, key válida o no. Eso "parece" una respuesta normal (status 200) pero en realidad dice "esta ruta no existe en el build publicado aquí" — típicamente porque el otro proyecto escribió las rutas de servicio en su código pero no las publicó/deployó, aunque un export/spec generado desde su código fuente sí las documente como si ya existieran.
  **Cómo aplicar:** ante un passthrough vacío, no asumas 200 = éxito — compará `content-type`/bytes de la respuesta, no solo el status. Si la prueba de 4 variantes da resultados idénticos, el fix está del lado del origen (que su dueño publique/deploye ese otro proyecto), no en la llave ni la URL de este lado.
