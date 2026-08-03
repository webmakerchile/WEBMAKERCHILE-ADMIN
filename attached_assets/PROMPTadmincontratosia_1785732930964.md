# Prompt 2 — Sistema de contratos e IA

> Este es un prompt **de continuación**: pegalo en la MISMA conversación del Replit de
> `admin.webmakerlatam.com` donde ya construiste el espejo y el wizard de contratos.
> No reemplaza al primero, lo completa.

---

Quedó muy bien el espejo y el wizard de 3 pasos. Ahora hay que completar el sistema de
contratos, porque falta la parte más importante: **cómo se arma el contenido de un
contrato y cómo se redacta con IA**. El panel ya expone todo eso por API.

## 🔴 Lo primero: el contenido de un contrato NO es texto plano

Este es el error que hay que corregir sí o sí.

El campo `content` de un contrato de servicio es **un JSON con secciones** que la página
pública de firma (`/contrato/:token`) parsea para renderizar cada título y su cuerpo.
Si se guarda texto suelto, el contrato se ve como **un bloque único sin títulos ni
formato** — se pierde toda la presentación profesional.

Traé la especificación completa acá:

```http
GET /api/integration/v1/formato-contratos
```

Ese endpoint devuelve: los 2 formatos aceptados, las 7 secciones canónicas, el marcado
(negritas y viñetas), los datos legales fijos de la empresa, la garantía estándar, la
cláusula de propiedad intelectual, el ciclo de vida del contrato y cómo funciona la firma.

### Las 7 secciones canónicas

| Clave | Título | Qué va |
|---|---|---|
| `alcance` | ALCANCE DEL PROYECTO | La más importante y la más larga: qué se desarrolla, con qué tecnologías, entregables |
| `entregables` | PROCESO DE TRABAJO | Etapas: análisis, mockups, desarrollo, QA, prueba, entrega |
| `plazos` | PLAZOS DE ENTREGA | Plazo desde el anticipo y qué lo puede extender |
| `condiciones` | CONDICIONES DE PAGO | Monto, forma de pago, qué pasa si no se paga |
| `garantía` | GARANTÍA | 1 mes de bugs + 1 mes de hosting; qué NO cubre |
| `confidencialidad` | CONFIDENCIALIDAD | Confidencialidad + cesión de código al pagar el 100% |
| `extras` | SERVICIOS INCLUIDOS | Desglose de cada servicio con su precio y el total |

⚠️ La clave es **`garantía` con tilde**, no `garantia`.

### Cómo mandar el contenido (la forma correcta)

En `POST /contratos-servicio`, mandá **`secciones`** y el panel se encarga de
serializarlo al JSON exacto que la firma sabe renderizar:

```json
POST /api/integration/v1/contratos-servicio
{
  "presupuestoId": "…",
  "clientRepresentativeName": "María González",
  "estado": "PENDING_SIGNATURE",
  "secciones": [
    { "titulo": "ALCANCE DEL PROYECTO", "contenido": "WebMaker desarrollará el **sitio web corporativo** de…\n- Home con hero animado\n- Blog administrable" },
    { "titulo": "PLAZOS DE ENTREGA", "contenido": "30 días hábiles desde la recepción del anticipo." }
  ]
}
```

La respuesta incluye `formatoContenido` (`"secciones"`, `"campos"` o `"texto_plano"`) y,
si mandaste texto plano, una `advertencia`. **Si ves `formatoContenido: "texto_plano"`,
algo está mal en tu llamada.**

También se acepta el objeto por campos (`{ "alcance": "...", "plazos": "..." }`), que es
el formato del proposal builder del panel. El texto plano se acepta pero se renderiza mal.

### Marcado dentro de cada sección

- `**texto**` para negritas (doble asterisco, en contratos de servicio)
- `- item` al inicio de línea para viñetas
- `\n\n` separa párrafos

## 🤖 Redacción con IA (esto es lo que faltaba)

El panel redacta los contratos con Gemini usando un prompt afinado que ya conoce el
negocio: los datos de WebMakerChile SpA, la garantía estándar, la cesión de código
fuente, el estilo de redacción, qué NO son entregables (documentación, manuales,
capacitaciones), las tecnologías que se mencionan, y el desglose financiero.

**Es la misma IA, el mismo prompt y el mismo formato** que el botón "Generar con IA" del
proposal builder de webmakerlatam.com/admin. No lo reimplementes ni escribas tu propio
prompt: llamá al endpoint.

### Redactar

```http
POST /api/integration/v1/contratos-servicio/redactar-ia
{ "presupuestoId": "<id del presupuesto ya creado>" }
```

O antes de crear el presupuesto:

```http
POST /api/integration/v1/contratos-servicio/redactar-ia
{
  "clienteId": "…",
  "items": [{ "name": "Sitio web corporativo", "quantity": 1, "unitPrice": 1200000 }],
  "paymentModality": "STANDARD"
}
```

Devuelve:

```json
{
  "ok": true,
  "modelo": "gemini-2.5-flash",
  "contexto": { "cliente": "Vascan SpA", "total": 1428000, "formaDePago": "50% anticipo, 50% contra entrega" },
  "secciones": [
    { "titulo": "ALCANCE DEL PROYECTO", "contenido": "…" },
    { "titulo": "PLAZOS DE ENTREGA", "contenido": "…" }
  ],
  "porCampos": { "alcance": "…", "plazos": "…" }
}
```

**No guarda nada.** Devolvé esas secciones a la UI para que el usuario las revise y edite.

### Corregir con lenguaje natural

```http
POST /api/integration/v1/contratos-servicio/corregir-ia
{
  "correccion": "Cambiá el plazo a 45 días hábiles y agregá que el hosting del primer año corre por cuenta del cliente",
  "secciones": [ /* las secciones actuales, tal cual las tenés */ ]
}
```

Devuelve las 7 secciones actualizadas, modificando sólo lo que se pidió.

### Crear el contrato con lo redactado

```http
POST /api/integration/v1/contratos-servicio
{ "presupuestoId": "…", "clientRepresentativeName": "…", "secciones": <las secciones editadas>, "estado": "PENDING_SIGNATURE" }
```

Si Gemini no está configurado en el panel, los endpoints de IA devuelven **503
`ia_no_configurada`** con el mensaje explicando qué falta. Manejalo mostrando el editor
manual de secciones, no rompas la UI.

## Qué construir

**Editor de contrato** dentro del paso 3 del wizard, con:

1. Botón **"Redactar con IA"** → llama a `redactar-ia`, muestra un loader (tarda unos
   segundos) y carga las 7 secciones en el editor.
2. **Un textarea por sección**, con el título arriba, editables. Que se vea el marcado
   (`**negrita**`, `- viñeta`) o mejor, un preview renderizado al lado.
3. Campo de **"pedile un ajuste a la IA"** → llama a `corregir-ia` con lo que escriba el
   usuario y recarga las secciones.
4. Selector de **plantilla** (`GET /plantillas-contrato`) como alternativa a la IA.
5. Botón **"Crear contrato"** → `POST /contratos-servicio` con `secciones`.
6. Al crearse, mostrar **el link de firma** (`_enlaces.contrato`) con botones de copiar,
   abrir y compartir por WhatsApp, y el link del PDF (`_enlaces.pdf`).

**En el listado de contratos**, mostrar por cada uno: estado, cliente, monto, fecha, el
link de firma copiable, el PDF, y si está firmado: quién firmó, cuándo y desde qué IP.

## Lo que sigue estando prohibido

Nada cambia acá: **no se puede firmar por API** (`estado: "SIGNED"` devuelve 409). La
firma la hace el cliente en `/contrato/:token`, y ahí queda su nombre, email, IP y fecha
— es el respaldo legal. Cuando firma, el panel dispara la cascada (presupuesto aprobado,
proyecto creado, carpeta de Drive, emails) y vos te enterás por el sync siguiente.

Tampoco se puede aprobar un presupuesto (`APPROVED` → 409) ni modificar un contrato ya
firmado (409 `contrato_firmado`).

## Detalle menor pero importante

Los links ahora salen siempre con el dominio canónico **`https://www.webmakerlatam.com`**.
Si guardaste links en tu base con el dominio sin `www`, actualizalos en el próximo sync.

## Checklist

- [ ] `GET /formato-contratos` consultado y el modelo de secciones sale de ahí
- [ ] Crear contrato manda `secciones`, nunca texto plano
- [ ] La respuesta trae `formatoContenido: "secciones"` (si dice `texto_plano`, está mal)
- [ ] Botón "Redactar con IA" funcionando, con loader
- [ ] Las 7 secciones son editables antes de crear el contrato
- [ ] Campo de corrección con IA funcionando
- [ ] Si la IA devuelve 503, aparece el editor manual y un aviso claro
- [ ] El link de firma se muestra copiable y se puede compartir
- [ ] El PDF abre correctamente
- [ ] Los contratos firmados muestran firmante, fecha e IP
- [ ] Todos los links usan `https://www.webmakerlatam.com`
