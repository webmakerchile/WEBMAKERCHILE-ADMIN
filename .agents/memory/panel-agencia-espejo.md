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

## Quirks del panel externo
Booleanos 0/1 al leer (acepta true al escribir), CLP enteros, IVA 19% calculado allá, POST idempotentes con `creado:false`, `forzarNuevo` para regenerar contrato de un presupuesto, volúmenes chicos (~85 clientes → snapshot liviano).
