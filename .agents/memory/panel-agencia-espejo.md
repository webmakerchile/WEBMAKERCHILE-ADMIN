---
name: Espejo del panel webmakerlatam (Agencia)
description: Reglas de la integración con el panel externo de producción, quirks del entorno con dos backends, y sintaxis de rutas comodín de wouter v3.
---

# Espejo del panel webmakerlatam (sección Agencia)

**Regla de oro:** el panel externo (www.webmakerlatam.com) es la única fuente de verdad. Todas las escrituras se delegan; lo devuelto se upsertea al espejo. Prohibido: calcular plata localmente (ni sumas "presentacionales" de componentes — mostrar los campos del panel tal cual), fabricar URLs públicas (solo `_enlaces` de las respuestas), inventar ids o estados (zod excluye APPROVED/SIGNED a propósito).

**Why:** la revisión de arquitectura marcó como severo incluso un `quantity*unitPrice` de UI y un fallback de link por token: cualquier deriva local puede contradecir al panel y romper confianza en montos/links legales (contratos).

**How to apply:** ante cualquier feature nueva en /agencia: leer del espejo o de vistas en vivo; escribir solo vía panelPost/panelPatch; mostrar montos/links exclusivamente de campos devueltos. El 409 `transicion_no_permitida` se pasa verbatim al usuario.

## Sync y caché
- Sync por cursor con advisory lock + re-chequeo del cursor DENTRO de la tx (multi-instancia). Snapshot solo la primera vez.
- La caché de vistas en vivo (60s) vive en su propio módulo compartido para que TANTO el router (sync manual/escrituras) COMO el sync programado la limpien; es por instancia — el TTL corto acota el desfase entre procesos.

## Entorno: DOS backends corriendo
Hay dos workflows del api-server ("Backend API" en :3001 y el gestionado "artifacts/api-server: API Server"). El proxy de Vite puede apuntar a cualquiera según API_PORT. Tras cambios de rutas, **reiniciar AMBOS**: un "Cannot GET /api/..." con 404 en preview mientras curl a :3001 da 401 = instancia vieja sirviendo el proxy.

## Wouter v3: comodines
wouter v3 usa `regexparam`, NO path-to-regexp: `path="/seccion/:rest*"` (sintaxis v2) no matchea nada → 404 global. Usar `path="/seccion/*"` (y una ruta exacta `/seccion` aparte). Síntoma: subrutas caen a la página NotFound aunque la ruta "exista".

## No confundir con el port de pantallas WMC (proxy)
Esta integración (sync/espejo con saneo local, ids/estados propios) es DISTINTA del port de pantallas admin de webmakerlatam bajo `/admin/*` (passthrough en vivo sin tablas locales, gateado por allowlist de email) — ver [wmc-screens-proxy-port.md](wmc-screens-proxy-port.md). Mismo origen externo, dos mecanismos de acceso que no comparten código ni convenciones; no reusar el uno para extender el otro.

## Quirks del panel externo
Booleanos 0/1 al leer (acepta true al escribir), CLP enteros, IVA 19% calculado allá, POST idempotentes con `creado:false`, `forzarNuevo` para regenerar contrato de un presupuesto, volúmenes chicos (~85 clientes → snapshot liviano).

## Modos de acceso: equipo vs dirección
- /agencia abre a TODO el equipo en modo "equipo" (saneado server-side); "completo" solo CEO/superadmin. El modo se resuelve SIEMPRE en el servidor leyendo el usuario fresco de DB — jamás confiar en el cliente.
- Saneado = lista blanca de campos por recurso + depuración profunda de VALORES (plata/PII/tokens). **Decisión:** la lista blanca gana sobre la lista negra a nivel de campo (ej.: leads conservan `notes` porque es herramienta de venta); la depuración profunda igual corre sobre los valores. **Why:** un blocklist ciego rompía casos de uso legítimos del equipo.
- La UI esconde plata por MODO (no por presencia de datos): así el "ver como" del CEO previsualiza fiel. Regla: todo componente de /agencia que muestre montos se gatea con el modo, y toda query a recursos de dirección lleva `enabled: esCompleto` (si no: 403 en consola).
- Diagnóstico de sync (error crudo, cursor, detalle, motivo) NO va al equipo: el texto de error puede traer pedazos de respuestas del panel externo. Se reemplaza por un texto genérico apto para el banner.
- Candado de clave del CEO: montado en "/api" PEGADO a la sesión (antes de todos los routers), eximiendo solo /auth/* — default-deny para mounts futuros. Para anónimos (healthchecks, links públicos de firma) es no-op porque solo aplica a la cuenta del CEO. Comparación con las mismas semánticas del mount (case-insensitive).
- Los tests de router mockean la DB: NO detectan SQL inválido. Todo fragmento sql`` nuevo se valida con una corrida directa (tsx script contra la DB dev) o e2e antes de darlo por bueno.

## Acotado (ventas/dev/contador) vs equipo (tester): dos redacciones distintas
`InfoAcceso` tiene 3 modos, no 2: "completo" (CEO/superadmin), "equipo" (tester, saneado) y "acotado" (ventas/dev/contador vía `puedeFinanzas`=canSeeMoney y `puedeProyectos`=hasWmcAccess, roles WMC dev/ventas/ceo). **Acotado NO pasa por el saneador de equipo** — un rol acotado con `puedeProyectos` (ventas, dev) recibe presupuestos/proyectos/tareas/bitácora/clientes/contratos-servicio **crudos, con toda la plata**, igual que las páginas WMC ya se los mostraban. Solo "equipo" (tester) tiene sus montos tapados vía lista blanca server-side. **Why:** paridad con WMC exige que dev/ventas vean lo mismo que ya veían en `/admin/projects`; inventar una redacción nueva para ellos habría sido una regresión de acceso, no una mejora. **How to apply:** al auditar "¿se tapa la plata acá?", preguntar primero de qué MODO se trata — `canSeeMoney(rol)` decide si el rol entra a Finanzas, no si se le tapan montos en Proyectos/Presupuestos (eso es solo "equipo" vs el resto). El flag de UI correcto para ocultar/mostrar plata en componentes es `useVeMontos()` (`modo !== "equipo"`), nunca `esCompleto` ni `canSeeMoney` sueltos.

## Vista en vivo de un solo registro: puede 404 aunque el espejo lo liste
`GET /panel/vistas/:recurso/:id` (a diferencia de `/panel/espejo/:recurso/:id`, que lee el espejo local) llama en vivo al origen para dirección/acotado. Si el registro fue borrado en el origen DESPUÉS de sincronizarse, el espejo local lo sigue listando pero el detalle en vivo devuelve el 404 del origen tal cual (texto propio del panel, no nuestro) — la UI ya maneja esto bien con el mismo `ErrorCarga` + "Reintentar" que cualquier otra falla de carga. **No es un bug**: es inherente a que el detalle sea una llamada delegada en tiempo real, no una lectura del espejo. Antes de reportarlo como bug al testear, confirmar si el registro es basura de prueba vieja (en dev existen ≥2 presupuestos con cliente "ZZZ TEST ... - BORRAR" que 404ean así a propósito) o un registro real — probar con un registro real y reciente distingue "dato contaminado" de "bug sistémico".

## Testing en vivo: nunca ejercer las escrituras reales
`WEBMAKER_PANEL_URL` no tiene override de dev/staging — apunta siempre a `https://www.webmakerlatam.com` real, incluso en este entorno de desarrollo. **Cualquier acción de escritura del espejo (registrar gasto/ingreso, sincronizar MP, cambiar categoría de un movimiento, guardar/enviar una propuesta, crear cliente, marcar enviada/aprobada) pega contra producción real de otro proyecto.** Al hacer e2e manual/con tester: abrir los formularios y paneles para verificar que rendericen bien, pero NUNCA hacer click en el botón de submit/confirmar. La corrección del camino de escritura se verifica con la suite de tests del backend (mockea `panelPost`/`panelPatch`), no en vivo.

## Falsos positivos al testear redacción de plata por rol en una sola pestaña
Si un test e2e cambia el `team_role` en DB varias veces seguidas y reusa la MISMA pestaña/contexto de browser (solo "Recargar" entre cambios) para verificar que el modo equipo tapa montos, puede aparecer un falso positivo (plata "cruda" visible que en realidad no vino del último fetch). Antes de tratarlo como bug: repetir la verificación puntual en un **contexto de browser nuevo + login fresco**, e inspeccionar la respuesta de red real (¿el JSON de `/panel/espejo/...` trae `totalValue`/`monthlyMaintenance` o no?) en vez de confiar en lo pintado en pantalla de la sesión larga. La causa exacta no se confirmó (no es un service worker: se revisó y la respuesta sospechosa no venía de uno), pero el patrón "aislar en contexto nuevo antes de reportar" resolvió la duda en un solo round-trip.

## Convención: el switch de secciones de /agencia (`pages/agencia/index.tsx`)
Cada sección (resumen/clientes/presupuestos/contratos/proyectos/mantenimiento/finanzas) se renderiza SIEMPRE incondicionalmente en su `case`, nunca gateada por `puedeX ? <Seccion/> : <OtraCosa/>` — el 403 del servidor llega solo mediante la propia query de esa sección y se pinta con `ErrorCarga` (banner rojo con el mensaje real). Mezclar el fallback de una sección con el componente de otra (p. ej. Finanzas cayendo a `<Resumen/>`) es inconsistente con el resto y confunde al usuario acotado. Los flags `puedeFinanzas`/`puedeProyectos` siguen siendo necesarios aparte, para decidir a qué tab aterriza un rol acotado por defecto.
