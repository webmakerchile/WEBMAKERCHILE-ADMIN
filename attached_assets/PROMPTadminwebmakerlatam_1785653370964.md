# Prompt para el agente de admin.webmakerlatam.com

> Copiá todo lo que está debajo de la línea y pegalo como primer mensaje en el
> Replit de `admin.webmakerlatam.com`. Reemplazá `<<PEGAR_API_KEY_ACA>>` por la
> key real antes de enviarlo (o pegá el prompt sin la key y cargala después como
> secret — el agente no necesita verla para construir).

---

# Contexto y misión

Estás trabajando en **admin.webmakerlatam.com**, un panel administrativo de
**WebMakerChile SpA** (agencia de desarrollo web y software, Los Andes, Chile,
RUT 78.042.968-2).

Ya existe otro sistema en producción: **`https://www.webmakerlatam.com/admin`**,
que internamente llamamos *el panel autoadministrable*. Ese panel es el **sistema
operativo completo del negocio** y **seguirá funcionando tal cual está**: ahí se
siguen haciendo los presupuestos, los contratos, las firmas y toda la operación.

**Tu misión es conectar este panel con ese, no reemplazarlo.**

Este panel tiene que:
1. **Tener toda la información sincronizada** del panel autoadministrable
   (clientes, presupuestos, contratos, mantenimiento, proyectos, finanzas, tienda).
2. **Poder generar contratos también desde acá**, pero **delegando la generación
   al panel**, de modo que el contrato resultante sea idéntico al que se hace en
   webmakerlatam.com/admin: mismo link, misma página de firma, mismo PDF, misma
   cascada posterior.
3. **No romper ni duplicar nada.** Cero desincronización.

Este panel puede verse y organizarse distinto al otro (de hecho, se espera que
sea distinto). Lo que no puede cambiar es de dónde salen los datos y quién los
genera.

---

# 🔴 La regla de oro (leé esto dos veces)

**El panel autoadministrable (webmakerlatam.com) es la ÚNICA fuente de verdad.**

- Este panel **lee** todo desde su API y guarda una copia local **espejo**.
- Este panel **nunca inventa** presupuestos, contratos, tokens ni links por su cuenta.
- Cuando acá se crea algo, se **le pide al panel que lo cree**, y el panel devuelve
  el registro ya generado con su id y su link. Ese id es el que se guarda acá.
- Si un dato existe en los dos lados, **gana siempre el del panel**.

Por qué esto es innegociable: el panel ya tiene construida toda la maquinaria de
links automáticos, firma electrónica y automatizaciones post-firma. Si este panel
genera contratos por su cuenta, esos contratos **no tendrán link de firma válido,
no generarán PDF, no crearán el proyecto ni la carpeta de Drive, y no enviarán
los emails**. Eso es exactamente lo que hay que evitar.

---

# Lo que YA existe en el panel autoadministrable y NO se debe reimplementar

Nada de esta lista se reconstruye acá. Todo esto se consume o se dispara vía API:

**Links públicos automáticos con token** (el cliente entra sin login):
- `https://www.webmakerlatam.com/propuesta/{token}` — ver y aprobar el presupuesto
- `https://www.webmakerlatam.com/contrato/{token}` — leer y **firmar** el contrato
- `https://www.webmakerlatam.com/contrato-laboral/{token}` — firma del equipo interno
- `https://www.webmakerlatam.com/addon/{token}` — aprobar un servicio adicional

**Firma electrónica**: el cliente firma dibujando, subiendo imagen o tipeando. El
panel guarda nombre, email, **IP** y fecha de firma. Ese es el respaldo legal.

**Generación de PDF** del contrato firmado, con branding.

**Cascada automática al firmarse un contrato** (esto es lo más importante de no perder):
1. El contrato queda `SIGNED` con la firma y la IP.
2. El presupuesto pasa a `APPROVED`.
3. **Se crea el proyecto** automáticamente, con sus tareas por fase.
4. **Se crea la carpeta de Google Drive** del cliente con la estructura del proyecto.
5. **Se envían los emails** al cliente y al equipo.
6. Se registra al cliente en el portal de clientes.

**Otras automatizaciones vivas en el panel**: cobranza mensual de mantenimiento con
recordatorios por email y WhatsApp, emisión de boletas y facturas electrónicas al
SII (vía Wasabil), checkout de tienda con MercadoPago, cálculo de comisiones del
closer, generación de contratos con IA, portal del cliente, y un chat con IA.

---

# La API de conexión

**Base:** `https://www.webmakerlatam.com/api/integration/v1`

**Autenticación:** API key en cada request.
```
Authorization: Bearer <<PEGAR_API_KEY_ACA>>
```
(También acepta `X-Api-Key`.) Guardala como secret `WEBMAKER_PANEL_API_KEY`.
**Nunca** la expongas en el frontend: todas las llamadas al panel se hacen desde
el backend de este panel.

## Empezá por acá, antes de escribir una línea de código

```
GET /api/integration/v1/manifiesto
```

Ese endpoint **te explica el panel entero**: sus 8 módulos con las rutas que
tienen en el admin original, las 20 entidades con **todos sus campos tipados**
(tipo, enum, si es obligatorio), las relaciones entre tablas, los 3 flujos de
negocio paso a paso, las 11 reglas de negocio y un glosario español↔inglés.
Además trae la configuración viva (IVA, día de cobro, mora, datos de la empresa)
leída de la base en ese momento.

**Leelo completo y basá el modelo de datos de este panel en él.** No inventes
nombres de campos: usá los que dice el manifiesto.

Después mirá:
- `GET /recursos` — índice de los 20 recursos con cuántos registros tiene cada uno
- `GET /openapi.json` — OpenAPI 3.1 completo, podés generar el cliente desde ahí
- `GET /salud` — verificar que la conexión y la credencial funcionan

---

# PARTE 1 — Lo que llega por la API (sincronización)

## Los 20 recursos

Todos con el mismo patrón: `GET /<recurso>` (listado paginado) y `GET /<recurso>/{id}`.

| Recurso | Qué es |
|---|---|
| `clientes` | Empresas contratantes: razón social, RUT, RUT de facturación, contacto, dirección, closer asignado |
| `leads` | Contactos entrantes de formularios, WhatsApp, chat IA y campañas |
| `presupuestos` | Cotizaciones: subtotal, descuento, IVA, total, modalidad de pago, cuotas, mantenimiento mensual, margen y comisión del closer, vigencia |
| `servicios` | Catálogo base con precio y costo, para armar presupuestos |
| `adicionales` | Add-ons vendidos sobre un proyecto en curso, con su mini-contrato |
| `proyectos` | Trabajo en ejecución: fase, valor, mantenimiento mensual, desarrollador asignado, deadline, carpeta de Drive |
| `tareas` | Checklist por fase; su **peso** define el % de avance |
| `bitacora` | Avances publicados al cliente (texto + imágenes + videos) |
| `solicitudes-cambio` | Pedidos del cliente desde su portal |
| `contratos-servicio` | Contratos firmados electrónicamente: estado, firmante, IP, fecha, PDF |
| `contratos-mantenimiento` | Servicios mensuales: tipo, precio, si lleva IVA, vigencia, notificaciones |
| `pagos-mantenimiento` | Una cuota por mes/año de cada contrato, con vencimiento y estado |
| `ofertas-cierre` | Oferta de hosting + soporte que se hace al entregar el proyecto |
| `pagos` | Abonos por proyecto (transferencia, efectivo, tarjeta) |
| `ingresos` | Ingresos manuales que no vienen de un proyecto |
| `gastos` | Egresos operativos (ads, software, otros) |
| `documentos-tributarios` | Boletas (39) y facturas (33) del SII: folio, montos, PDF, estado |
| `pedidos` | Compras de la tienda online con datos fiscales y estado de pago |
| `colaboradores` | Equipo interno (developers y closers). **Sin credenciales, nunca** |
| `contratos-laborales` | Contratos del equipo, con firma electrónica |

## Parámetros que soporta todo listado

| Parámetro | Ejemplo | Para qué |
|---|---|---|
| `limite` / `offset` | `?limite=1000&offset=2000` | Paginar (máx. 1000, default 100) |
| `desde` / `hasta` | `?desde=2026-07-01T00:00:00Z` | Sincronización incremental |
| `q` | `?q=vascan` | Búsqueda de texto |
| `orden` | `?orden=asc` | Dirección (default `desc`) |
| `campos` | `?campos=id,companyName` | Traer sólo esas columnas |
| `incluirContenido` | `?incluirContenido=1` | Incluir textos largos (contratos completos) |

Más los filtros propios de cada recurso (`?estado=`, `?clienteId=`, `?proyectoId=`,
`?anio=`, `?mes=`…). Aceptan varios valores: `?estado=SENT,APPROVED`.

**Forma de la respuesta de un listado:**
```json
{
  "ok": true,
  "recurso": "presupuestos",
  "paginacion": { "limite": 100, "offset": 0, "total": 342, "devueltos": 100, "hayMas": true, "siguiente": "..." },
  "campoFechaSync": "updatedAt",
  "datos": [ /* … */ ]
}
```

## Vistas ya armadas (usalas en vez de hacer 5 llamadas)

| Endpoint | Trae |
|---|---|
| `GET /clientes/{id}` | **Vista 360**: presupuestos, proyectos, contratos, cuotas, pagos, pedidos, solicitudes + KPIs del cliente |
| `GET /presupuestos/{id}` | Ítems, cliente, contrato asociado, proyecto y bloque de cálculo |
| `GET /proyectos/{id}` | Tareas, bitácora, pagos, add-ons, mantenimiento, **% de avance** y saldo por cobrar |
| `GET /contratos-mantenimiento/{id}` | Cliente, proyecto, grilla completa de cuotas y estado de cobranza |
| `GET /contratos?tipo=todos` | Los 4 tipos de contrato en una sola lista normalizada |
| `GET /resumen` | Conteos de todo + MRR + pipeline + proyectos activos |
| `GET /mantenimiento/resumen` | MRR neto y con IVA, contratos por tipo, morosidad, próximos vencimientos |
| `GET /finanzas/resumen?anio=2026` | Ingresos y gastos mes a mes, pipeline, tienda, documentos tributarios |

## Cómo sincronizar (hacelo exactamente así)

```
Primera corrida:
  GET /sync/snapshot?limitePorRecurso=1000
  → devuelve TODOS los recursos en una respuesta + un campo `cursor`
  → guardá el cursor

Cada 5-15 minutos:
  GET /sync/cambios?desde=<cursor guardado>
  → devuelve SÓLO lo creado o modificado desde ese momento
  → hacé UPSERT por `id` en tu base
  → guardá el nuevo cursor
```

Reglas críticas de la sincronización:

- **Upsert siempre por `id`** (UUID string, estable y único). Nunca por nombre,
  email ni número correlativo.
- Si un recurso viene con `"truncado": true`, paginalo aparte con
  `GET /<recurso>?limite=1000&offset=N` hasta que `paginacion.hayMas` sea `false`.
- Guardá el `cursor` en una tabla de estado, no en memoria: tiene que sobrevivir
  a los reinicios.
- **Nunca modifiques localmente un registro que vino del panel.** Si lo hacés, el
  próximo sync lo pisa y perdés el cambio. Todo cambio se manda al panel por API.
- El panel casi no borra: usa estados (`CANCELLED`, `REJECTED`, `EXPIRED`). No
  esperes eventos de borrado.

---

# PARTE 2 — Crear contratos desde este panel (escritura delegada)

Este es el flujo que hay que construir. **Tres llamadas, en este orden.**

### Paso 0 (una vez): traer las plantillas
```http
GET /plantillas-contrato
```
Devuelve las plantillas con las que el panel arma los contratos (id, nombre, tipo,
cuál es la por defecto). Mostralas en un selector.

### Paso 1: el cliente
```http
POST /clientes
{
  "companyName": "Vascan SpA",
  "rut": "76.123.456-7",
  "contactName": "Juan Pérez",
  "contactEmail": "juan@vascan.cl",
  "contactPhone": "+56 9 1234 5678"
}
```
**Es idempotente**: si ya existe un cliente con ese RUT o ese email, devuelve el
existente con `"creado": false` en vez de duplicarlo. Podés llamarlo sin miedo.

### Paso 2: el presupuesto
```http
POST /presupuestos
{
  "clienteId": "<id del paso 1>",
  "items": [
    { "name": "Sitio web corporativo", "quantity": 1, "unitPrice": 1200000 },
    { "name": "Hosting anual", "quantity": 1, "unitPrice": 180000 }
  ],
  "hasIVA": true,
  "discount": 0,
  "paymentModality": "STANDARD",
  "monthlyMaintenance": 50000,
  "estado": "SENT"
}
```
El panel calcula subtotal, descuento, IVA y total (no los mandes vos), y devuelve:
```json
{
  "ok": true,
  "datos": {
    "id": "0a0d4ebe-…",
    "status": "SENT",
    "_enlaces": { "propuesta": "https://webmakerlatam.com/propuesta/CD5FCD6F5A7942F0" }
  },
  "items": [ /* … */ ],
  "calculo": { "subtotal": 1380000, "descuento": 0, "iva": 262200, "total": 1642200 }
}
```
También podés mandar el objeto `cliente` en vez de `clienteId` y el panel crea o
reutiliza el cliente en la misma llamada.

### Paso 3: el contrato
```http
POST /contratos-servicio
{
  "presupuestoId": "<id del paso 2>",
  "clientRepresentativeName": "Juan Pérez",
  "plantillaId": "<id de una plantilla, opcional>",
  "estado": "PENDING_SIGNATURE"
}
```
Devuelve **el link de firma listo para mandar al cliente**:
```json
{
  "ok": true,
  "creado": true,
  "datos": {
    "id": "9df62202-…",
    "status": "PENDING_SIGNATURE",
    "_enlaces": {
      "contrato": "https://webmakerlatam.com/contrato/991bf56b-5271-413b-b30b-b…",
      "pdf": "https://webmakerlatam.com/api/public/agreement/991bf56b-…/pdf"
    }
  }
}
```

Ese link **es el mismo** que produce webmakerlatam.com/admin. Abre la misma página
de firma, genera el mismo PDF y al firmarse dispara la misma cascada (proyecto +
Drive + emails). Está verificado end-to-end.

Si el presupuesto ya tiene un contrato vivo, el endpoint devuelve **ese** con
`"creado": false` en vez de crear un duplicado (mandá `"forzarNuevo": true` sólo
si realmente querés otro).

Alternativas de contenido: `plantillaId` (usa la plantilla), `contenido` (texto
propio), o ninguno de los dos (usa la plantilla por defecto).

### Cambios de estado permitidos
```http
PATCH /presupuestos/{id}        { "estado": "DRAFT" | "SENT" | "REJECTED" | "EXPIRED" }
PATCH /contratos-servicio/{id}  { "estado": "DRAFT" | "PENDING_SIGNATURE" | "EXPIRED", "contenido": "…" }
```

### Ingresar leads
```http
POST /leads
{ "name": "...", "email": "...", "message": "...", "serviceInterest": "..." }
```

---

# 🚫 Lo que está bloqueado (y por qué)

Estas operaciones devuelven **`409`** con una explicación. **No intentes esquivarlas
ni implementarlas localmente** — están bloqueadas para proteger la integridad legal
y las automatizaciones:

| Intento | Respuesta | Por qué |
|---|---|---|
| `PATCH /contratos-servicio/{id}` con `estado: "SIGNED"` | 409 `transicion_no_permitida` | La firma la hace **el cliente** en su link, y queda con nombre, email, IP y fecha. Es el respaldo legal del contrato |
| `PATCH /presupuestos/{id}` con `estado: "APPROVED"` | 409 `transicion_no_permitida` | Aprobar dispara proyecto + carpeta de Drive + emails. Lo aprueba el cliente desde su link, o el equipo desde webmakerlatam.com/admin |
| Modificar un contrato ya firmado | 409 `contrato_firmado` | Registro cerrado. Si hay que cambiar algo, se emite uno nuevo |
| Modificar un presupuesto ya aprobado | 409 `presupuesto_aprobado` | Ya tiene proyecto asociado |
| Borrar cualquier cosa | No existe `DELETE` | Las bajas son estados: CANCELLED, REJECTED, EXPIRED |
| Crear pagos, cuotas de mantenimiento o documentos tributarios | No hay endpoint | Los mueven el panel, sus schedulers y MercadoPago. Escribirlos de afuera desincroniza la cobranza y el SII |

**Cuando el cliente firme, te enterás por el sync**: el contrato aparece con
`status: "SIGNED"` en el siguiente `GET /sync/cambios`, junto con el proyecto
recién creado. No hagas polling del link ni lo marques a mano.

---

# Reglas de los datos (respetalas o los números van a estar mal)

| Tema | Regla |
|---|---|
| **Montos** | Enteros en pesos chilenos, **sin decimales**. `150000` = $150.000. No uses floats ni centavos |
| **IVA** | 19% (viene en el manifiesto, es configurable). El campo `hasIVA` vale `1` (lleva IVA) o `0` (no) |
| **Fechas** | ISO-8601 en UTC (`2026-08-02T14:30:00.000Z`). El negocio opera en `America/Santiago` (UTC-3/-4): convertí sólo para mostrar |
| **Booleanos** | El panel los guarda como `integer` 0/1, no `true`/`false`. Convertí al mostrar |
| **IDs** | UUID string. Son la clave primaria de tu espejo |
| **Nulos** | Un campo opcional vacío llega como `null`, no se omite |
| **Textos largos** | `content`, `contractContent`, `message` se omiten por defecto en los listados; pedilos con `?incluirContenido=1` |

### Estados (usá exactamente estos strings)
```
presupuestos        DRAFT · SENT · VIEWED · APPROVED · REJECTED · EXPIRED
proyectos           MOCKUP · DEVELOPMENT · QA · DELIVERY · COMPLETED
contratos-servicio  DRAFT · PENDING_SIGNATURE · SIGNED · EXPIRED
mantenimiento       ACTIVE · PAUSED · CANCELLED
cuotas              PENDING · PAID · LATE · WAIVED
leads               NEW · PENDING · CONTACTED · CONVERTED · NOT_RELEVANT · CLOSED
pedidos             PENDING · PAYMENT_PENDING · PAID · INTAKE_DONE · CANCELLED · REFUNDED
adicionales         DRAFT · SENT · APPROVED · REJECTED
```

### Sobre los links: usá `_enlaces`, nunca el token

Los registros que tienen link público traen un bloque `_enlaces` con la URL ya
armada. **Usá eso.** El token crudo no se expone (y no lo necesitás): con el link
podés mostrar un botón "ver contrato", mandarlo por WhatsApp o abrir el PDF.

```json
"_enlaces": {
  "contrato": "https://webmakerlatam.com/contrato/991bf56b-…",
  "pdf": "https://webmakerlatam.com/api/public/agreement/991bf56b-…/pdf"
}
```

---

# Manejo de errores

Todos los errores vienen con la misma forma:
```json
{ "ok": false, "error": "scope_insuficiente", "mensaje": "explicación en castellano de qué pasó" }
```

| Código | Qué hacer |
|---|---|
| 400 | El `mensaje` y el array `campos` dicen exactamente qué falta. Mostralo en el formulario |
| 401 | Revisar la API key |
| 403 | Faltan permisos en la credencial |
| 404 | El registro no existe |
| 409 | **Operación prohibida a propósito.** Mostrá el `mensaje` al usuario, no reintentes |
| 429 | Rate limit (240/min). Respetá el header `Retry-After` |
| 5xx | Reintentá con backoff exponencial (3 intentos) |

**Nunca reintentes un 4xx**: no va a cambiar.

---

# Qué construir en este panel

Backend:
1. **Cliente de API** con la key en secret, reintentos con backoff y timeout.
2. **Base espejo local** con las tablas del manifiesto (podés simplificar campos
   que no uses, pero **conservá siempre el `id` del panel**).
3. **Job de sincronización** cada 5-15 minutos con el cursor persistido.
4. **Endpoints propios** para las acciones de escritura, que por dentro llaman al
   panel. El frontend nunca habla directo con webmakerlatam.com.

Frontend (organizalo como quieras, es lo que puede ser distinto):
- Dashboard con `GET /resumen` y `GET /mantenimiento/resumen`
- Listado y ficha de clientes (usá la vista 360)
- Presupuestos con su detalle e ítems
- **Contratos**: listado + botón "Crear contrato" con el flujo de 3 pasos, y el
  link de firma copiable / enviable
- Mantenimiento: contratos activos, MRR y cuotas impagas
- Proyectos con su % de avance
- Finanzas con el resumen mensual

En cada pantalla que muestre datos sincronizados, poné **cuándo fue el último sync**.

---

# Checklist de aceptación

- [ ] `GET /salud` responde `ok: true` con la key configurada
- [ ] El modelo local sale del `/manifiesto`, no de campos inventados
- [ ] El snapshot inicial trajo los 20 recursos y se guardó el cursor
- [ ] El sync incremental corre solo y actualiza por `id` sin duplicar
- [ ] El cursor sobrevive a un reinicio del servidor
- [ ] Los recursos `truncado: true` se paginan completos
- [ ] Se puede crear cliente → presupuesto → contrato y se obtiene el link de firma
- [ ] Reintentar la creación del mismo cliente **no** genera un duplicado
- [ ] Pedir un segundo contrato para el mismo presupuesto devuelve el existente
- [ ] Intentar `SIGNED` o `APPROVED` muestra el mensaje del 409, no rompe la UI
- [ ] Los montos se muestran como CLP enteros con separador de miles
- [ ] Las fechas se convierten de UTC a hora de Chile sólo para mostrar
- [ ] La API key **no** aparece en el bundle del frontend
- [ ] Cuando un contrato se firma en el panel, este panel lo refleja tras el sync

---

# Lo que NUNCA hay que hacer

1. ❌ Generar tokens, links de firma o PDFs por tu cuenta.
2. ❌ Reimplementar la firma electrónica.
3. ❌ Marcar un contrato como firmado o un presupuesto como aprobado desde acá.
4. ❌ Editar localmente un registro que vino del panel sin mandarlo por API.
5. ❌ Usar el nombre, el email o un correlativo como clave: **siempre el `id`**.
6. ❌ Llamar a la API desde el frontend con la key.
7. ❌ Crear pagos, cuotas o documentos tributarios.
8. ❌ Asumir campos que no estén en el manifiesto.

---

# Resumen en una frase

**webmakerlatam.com/admin manda; admin.webmakerlatam.com refleja y pide.** Todo lo
que se ve acá vino de allá por sincronización, y todo lo que se crea acá lo generó
allá por delegación. Así los dos paneles muestran siempre lo mismo y nada se pierde.

**Arrancá leyendo `GET /api/integration/v1/manifiesto` completo.**
