---
name: Contratos por secciones + IA del panel
description: Formato canónico del contenido de contratos, degradación cuando el panel externo no publica sus endpoints, y la regla de doble sanitización de PII de firma.
---

# Contratos por secciones + IA del panel

## Formato del contenido
- El `content` de un contrato de servicio NO es texto plano: la página pública de firma parsea un JSON de secciones `{titulo, contenido}` con marcado liviano (`**negrita**`, líneas `- ` como viñetas, `\n\n` párrafos).
- 7 secciones canónicas (clave→título): alcance→ALCANCE DEL PROYECTO, entregables→PROCESO DE TRABAJO, plazos→PLAZOS DE ENTREGA, condiciones→CONDICIONES DE PAGO, **`garantía` CON tilde**→GARANTÍA, confidencialidad→CONFIDENCIALIDAD, extras→SERVICIOS INCLUIDOS.
- Al crear mandando `secciones`, la respuesta del panel confirma con `formatoContenido: "secciones"`; si vuelve otra cosa (o falta), avisar en UI que revise el PDF — significa panel desactualizado o bug (`texto_plano`).
- El monto de un contrato NO viene en su registro (`totalAmount` null): mapear `proposalId` → total del presupuesto espejo (solo dirección).

## Degradación cuando el panel no publica una ruta
- Síntoma de ruta inexistente en el panel publicado: su SPA atrapa el POST y devuelve **HTML con 200** → el cliente lo corta como `respuesta_invalida` (502, sin reintentos).
- **Regla:** mapear a 503 "función no disponible" SOLO ese síntoma (`respuesta_invalida`). Jamás mapear 404 en bloque: un 404 JSON legítimo (recurso inexistente cuando la ruta ya exista) debe pasar tal cual. El architect lo cazó como bug la primera vez.
- El 503 propio del panel (p. ej. IA sin configurar) pasa tal cual; la UI cae al editor manual con aviso, nunca pantalla rota.

## Doble sanitización de PII/plata (modo equipo)
- Hay DOS capas independientes: la whitelist por recurso (listados del espejo) y la denylist profunda `DROP_EXACTO`/regex (vistas en vivo). **Un campo nuevo sensible (email/IP de firma, PDFs, RUTs) hay que vetarlo en la capa profunda aunque la whitelist ya lo excluya** — las vistas en vivo no pasan por la whitelist. Fue la fuga que encontró la review (signedByEmail/signedByIp).
- Campos que solo existen en datos de dirección (email/IP de firma) permiten "render-if-present" en UI sin gates extra, pero SOLO si el servidor realmente los poda en equipo.

## E2E sin ensuciar producción
- Las escrituras delegadas crean datos REALES en el panel externo de producción: el tester e2e puede navegar el wizard, seleccionar cliente/presupuesto EXISTENTES y disparar la IA (stateless), pero nunca clicar el crear final ni crear presupuestos/clientes.
